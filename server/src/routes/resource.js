const express = require('express');
const mongoose = require('mongoose');
const { hasRole } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../middleware/error');
const { nextNumber } = require('../models/Counter');
const { audit, diff } = require('../services/audit');
const { notify } = require('../services/notify');
const { checkTransition } = require('../services/workflows');
const { applyTransition, slaStatus } = require('../services/sla');
const { Change } = require('../models/itsm');

const USER_FIELDS = 'name email department';
const ALWAYS_PROTECTED = ['_id', 'id', 'tenant', 'number', 'activities', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt', 'sla', '__v', 'allowedTransitions', 'slaStatus'];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function sanitize(body, protectedKeys) {
  const out = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (k.startsWith('$') || k.includes('.') || protectedKeys.includes(k)) continue;
    out[k] = v === '' ? undefined : v;
  }
  return out;
}

const refOf = (Model, key) => {
  const p = Model.schema.path(key);
  return p?.options?.ref || p?.caster?.options?.ref || null;
};

/** Tolak referensi ke dokumen milik tenant lain (atau yang tidak ada). */
async function validateRefs(Model, updates, tenantId) {
  for (const [k, v] of Object.entries(updates)) {
    const refModel = refOf(Model, k);
    if (!refModel || v == null) continue;
    const ids = (Array.isArray(v) ? v : [v]).map((x) => (x && typeof x === 'object' ? x._id : x)).filter(Boolean);
    if (!ids.length) continue;
    if (!ids.every((x) => mongoose.isValidObjectId(x))) throw new HttpError(400, `Referensi tidak valid pada ${k}`);
    const found = await mongoose.model(refModel).countDocuments({ _id: { $in: ids }, tenant: tenantId });
    if (found !== new Set(ids.map(String)).size) throw new HttpError(400, `Referensi tidak ditemukan pada ${k}`);
  }
}

function populateQuery(q, def) {
  for (const p of def.populate || []) {
    q.populate(p, refOf(def.model, p) === 'User' ? USER_FIELDS : undefined);
  }
  return q;
}

function decorate(doc, canSeeWorknotes = true) {
  const obj = doc.toJSON ? doc.toJSON() : doc;
  if (obj.sla) obj.slaStatus = slaStatus(obj.sla);
  // Work note bersifat internal: tidak dikirim ke pengguna yang tidak berhak mengubah record
  if (obj.activities && !canSeeWorknotes) obj.activities = obj.activities.filter((a) => a.type !== 'worknote');
  return obj;
}

module.exports = function buildResourceRouter(name, def, registry) {
  const router = express.Router();
  const { model: Model } = def;
  const protectedKeys = [...ALWAYS_PROTECTED, ...(def.protected || []), ...(def.workflow ? ['status'] : [])];
  const perm = (req) => req.perms[name];

  const can = (action) => (req, res, next) => {
    const p = perm(req);
    if (!p.enabled) return next(new HttpError(403, `Modul ${def.label} tidak termasuk paket langganan workspace ini`));
    return hasRole(req.user, p[action]) ? next() : next(new HttpError(403, `Anda tidak berwenang (${action}) pada ${def.label}`));
  };
  const scopeOf = (req) => ({ tenant: req.tenant._id, ...(def.scope ? def.scope(req.user) : {}) });

  async function load(req) {
    if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'ID tidak valid');
    const doc = await Model.findOne({ _id: req.params.id, ...scopeOf(req) });
    if (!doc) throw new HttpError(404, `${def.label} tidak ditemukan`);
    return doc;
  }

  const respond = async (req, res, doc, status = 200) => {
    const full = await populateQuery(Model.findById(doc._id), def);
    res.status(status).json({
      ...decorate(full, hasRole(req.user, perm(req).write)),
      allowedTransitions: def.workflow?.transitions[full.status] || [],
    });
  };

  // LIST — ?q=&status=&page=&limit=&sort=&<field>=<value>
  router.get(
    '/',
    can('read'),
    asyncHandler(async (req, res) => {
      const { q, page = 1, limit = 25, sort, ...filters } = req.query;
      const filter = {};
      for (const [k, v] of Object.entries(filters)) {
        if (typeof v !== 'string' || !Model.schema.path(k) || k === 'tenant') continue; // tolak operator injection
        const values = v.split(',');
        filter[k] = values.length > 1 ? { $in: values } : v;
      }
      if (typeof q === 'string' && q.trim() && def.search?.length) {
        const rx = new RegExp(escapeRegex(q.trim()), 'i');
        filter.$or = def.search.map((f) => ({ [f]: rx }));
      }
      const scoped = { $and: [filter, scopeOf(req)] };
      const lim = Math.min(Math.max(Number(limit) || 25, 1), 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * lim;
      const sortBy = typeof sort === 'string' && /^[-\w\s]+$/.test(sort) ? sort : def.defaultSort || '-createdAt';
      const [items, total] = await Promise.all([
        populateQuery(Model.find(scoped).sort(sortBy).skip(skip).limit(lim).select('-activities'), def),
        Model.countDocuments(scoped),
      ]);
      res.json({ items: items.map((d) => decorate(d)), total, page: Number(page) || 1, limit: lim });
    })
  );

  router.get('/:id', can('read'), asyncHandler(async (req, res) => respond(req, res, await load(req))));

  // Record lain yang mereferensikan record ini (mis. incident yang terkait problem)
  router.get(
    '/:id/related',
    can('read'),
    asyncHandler(async (req, res) => {
      const doc = await load(req);
      const groups = [];
      for (const [otherName, other] of Object.entries(registry)) {
        if (!req.perms[otherName]?.enabled || !hasRole(req.user, req.perms[otherName].read)) continue;
        const paths = Object.keys(other.model.schema.paths).filter((p) => refOf(other.model, p) === Model.modelName);
        if (!paths.length) continue;
        const items = await other.model
          .find({ tenant: req.tenant._id, ...(other.scope ? other.scope(req.user) : {}), $or: paths.map((p) => ({ [p]: doc._id })) })
          .select('number title name status priority')
          .sort('-createdAt')
          .limit(10)
          .lean();
        if (items.length) groups.push({ resource: otherName, label: other.label, items });
      }
      res.json(groups);
    })
  );

  router.post(
    '/',
    can('create'),
    asyncHandler(async (req, res) => {
      const data = sanitize(req.body, protectedKeys);
      await validateRefs(Model, data, req.tenant._id);
      const doc = new Model(data);
      doc.tenant = req.tenant._id;
      doc.createdBy = req.user._id;
      doc.updatedBy = req.user._id;
      if (def.beforeCreate) await def.beforeCreate(doc, req.user);
      if (def.beforeSave) await def.beforeSave(doc, req.user);
      if (def.prefix) doc.number = await nextNumber(req.tenant._id, def.prefix);
      if (doc.schema.path('activities')) doc.activities.push({ type: 'system', message: `${def.label} dibuat`, by: req.user._id, byName: req.user.name });
      await doc.save();
      await audit(req, 'create', name, doc);
      await notify(req, { event: 'create', resource: name, label: def.label, doc });
      await respond(req, res, doc, 201);
    })
  );

  router.put(
    '/:id',
    can('write'),
    asyncHandler(async (req, res) => {
      const doc = await load(req);
      const before = doc.toObject();
      const updates = sanitize(req.body, protectedKeys);
      await validateRefs(Model, updates, req.tenant._id);
      doc.set(updates);
      doc.updatedBy = req.user._id;
      if (def.beforeSave) await def.beforeSave(doc, req.user);
      const changes = diff(before, doc.toObject(), [...Object.keys(updates), 'priority']);
      await doc.save();
      if (Object.keys(changes).length) await audit(req, 'update', name, doc, changes);
      await notify(req, { event: 'update', resource: name, label: def.label, doc, before });
      await respond(req, res, doc);
    })
  );

  router.delete(
    '/:id',
    can('remove'),
    asyncHandler(async (req, res) => {
      const doc = await load(req);
      await doc.deleteOne();
      await audit(req, 'delete', name, doc, { snapshot: doc.toObject() });
      res.status(204).end();
    })
  );

  router.post(
    '/:id/comments',
    can('read'),
    asyncHandler(async (req, res) => {
      const doc = await load(req);
      if (!doc.schema.path('activities')) throw new HttpError(400, 'Record ini tidak mendukung komentar');
      const message = String(req.body.message || '').trim();
      if (!message) throw new HttpError(400, 'Pesan wajib diisi');
      // Worknote (internal) hanya untuk staf yang berhak mengubah record
      const type = req.body.type === 'worknote' && hasRole(req.user, perm(req).write) ? 'worknote' : 'comment';
      doc.activities.push({ type, message, by: req.user._id, byName: req.user.name });
      await doc.save();
      await respond(req, res, doc, 201);
    })
  );

  if (def.workflow) {
    router.post(
      '/:id/transition',
      can('read'),
      asyncHandler(async (req, res) => {
        const doc = await load(req);
        const { to, note, ...fields } = req.body || {};
        const canWrite = hasRole(req.user, perm(req).write);
        if (!(canWrite || def.canTransition?.(req.user, doc, to))) throw new HttpError(403, 'Anda tidak berwenang mengubah status');
        const before = doc.toObject();
        const updates = sanitize(fields, protectedKeys);
        if (canWrite) {
          await validateRefs(Model, updates, req.tenant._id);
          doc.set(updates);
        }
        const err = checkTransition(def.workflow, doc, to, req.user);
        if (err) throw new HttpError(422, err);
        await performTransition(req, def, doc, to, note);
        await audit(req, 'transition', name, doc, { status: { from: before.status, to }, ...diff(before, doc.toObject(), Object.keys(updates)) });
        await notify(req, { event: 'transition', resource: name, label: def.label, doc, before, to });
        await respond(req, res, doc);
      })
    );
  }

  // CAB approval untuk Change (segregation of duties + multi-approver untuk risiko tinggi)
  if (Model === Change) {
    router.post(
      '/:id/approve',
      can('read'),
      asyncHandler(async (req, res) => {
        const doc = await load(req);
        if (!hasRole(req.user, ['cab_member', 'change_manager'])) throw new HttpError(403, 'Hanya anggota CAB / Change Manager');
        if (doc.status !== 'cab_review') throw new HttpError(422, 'Change tidak sedang dalam CAB review');
        const me = String(req.user._id);
        if ([doc.requester, doc.createdBy, doc.assignee].some((u) => u && String(u) === me))
          throw new HttpError(422, 'Segregation of duties: pemohon/implementer tidak boleh menyetujui change ini');
        if (doc.approvals.some((a) => String(a.approver) === me)) throw new HttpError(409, 'Anda sudah memberikan keputusan');
        const before = doc.toObject();
        const decision = req.body.decision === 'rejected' ? 'rejected' : 'approved';
        doc.approvals.push({ approver: req.user._id, approverName: req.user.name, decision, comment: req.body.comment });
        const approvedCount = doc.approvals.filter((a) => a.decision === 'approved').length;
        let to = null;
        if (decision === 'rejected') to = 'rejected';
        else if (approvedCount >= (doc.requiredApprovals || 1)) to = 'approved';
        if (to) {
          const err = checkTransition(def.workflow, doc, to, req.user, { viaApproval: true });
          if (err) throw new HttpError(422, err);
          await performTransition(req, def, doc, to, `CAB: ${req.body.comment || decision}`);
          await notify(req, { event: 'transition', resource: name, label: def.label, doc, before, to });
        } else {
          doc.activities.push({ type: 'system', message: `CAB approval ${approvedCount}/${doc.requiredApprovals} oleh ${req.user.name}`, by: req.user._id, byName: req.user.name });
          await doc.save();
        }
        await audit(req, 'approval', name, doc, { decision, comment: req.body.comment });
        await respond(req, res, doc);
      })
    );
  }

  return router;
};

async function performTransition(req, def, doc, to, note) {
  const from = doc.status;
  const now = new Date();
  doc.status = to;
  def.workflow.onEnter?.[to]?.(doc, req.user, now);
  if (doc.sla) {
    doc.sla = applyTransition(doc.sla.toObject ? doc.sla.toObject() : doc.sla, from, to, now);
  }
  doc.updatedBy = req.user._id;
  if (def.beforeSave) await def.beforeSave(doc, req.user);
  doc.activities.push({ type: 'transition', from, to, message: note || undefined, by: req.user._id, byName: req.user.name });
  await doc.save();
}
