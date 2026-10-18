const express = require('express');
const mongoose = require('mongoose');
const { hasRole } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../middleware/error');
const { nextNumber } = require('../models/Counter');
const { audit, diff } = require('../services/audit');
const { checkTransition } = require('../services/workflows');
const { applyTransition, slaStatus } = require('../services/sla');
const { Change } = require('../models/itsm');

const USER_FIELDS = 'name email department';
const ALWAYS_PROTECTED = ['_id', 'number', 'activities', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt', 'sla', '__v'];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function sanitize(body, protectedKeys) {
  const out = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (k.startsWith('$') || k.includes('.') || protectedKeys.includes(k)) continue;
    out[k] = v === '' ? undefined : v;
  }
  return out;
}

function populateQuery(q, def) {
  for (const p of def.populate || []) {
    const refModel = def.model.schema.path(p)?.options?.ref || def.model.schema.path(p)?.caster?.options?.ref;
    q.populate(p, refModel === 'User' ? USER_FIELDS : undefined);
  }
  return q;
}

function decorate(doc, canSeeWorknotes = true) {
  const obj = doc.toJSON ? doc.toJSON() : doc;
  if (obj.sla) obj.slaStatus = slaStatus(obj.sla);
  // Work note bersifat internal: tidak dikirim ke pengguna non-staf
  if (obj.activities && !canSeeWorknotes) obj.activities = obj.activities.filter((a) => a.type !== 'worknote');
  return obj;
}

module.exports = function buildResourceRouter(name, def) {
  const router = express.Router();
  const { model: Model } = def;
  const protectedKeys = [...ALWAYS_PROTECTED, ...(def.protected || []), ...(def.workflow ? ['status'] : [])];

  const can = (action) => (req, res, next) => {
    const roles = def[action] || (action === 'create' ? def.write : action === 'remove' ? [] : def.read);
    return hasRole(req.user, roles) ? next() : next(new HttpError(403, `Anda tidak berwenang (${action}) pada ${def.label}`));
  };

  async function load(req) {
    if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'ID tidak valid');
    const filter = { _id: req.params.id, ...(def.scope ? def.scope(req.user) : {}) };
    const doc = await Model.findOne(filter);
    if (!doc) throw new HttpError(404, `${def.label} tidak ditemukan`);
    return doc;
  }

  const respond = async (req, res, doc, status = 200) => {
    const full = await populateQuery(Model.findById(doc._id), def);
    res.status(status).json({
      ...decorate(full, hasRole(req.user, def.write)),
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
        if (typeof v !== 'string' || !Model.schema.path(k)) continue; // tolak operator injection
        const values = v.split(',');
        filter[k] = values.length > 1 ? { $in: values } : v;
      }
      if (typeof q === 'string' && q.trim() && def.search?.length) {
        const rx = new RegExp(escapeRegex(q.trim()), 'i');
        filter.$or = def.search.map((f) => ({ [f]: rx }));
      }
      const scoped = def.scope ? { $and: [filter, def.scope(req.user)] } : filter;
      const lim = Math.min(Math.max(Number(limit) || 25, 1), 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * lim;
      const sortBy = typeof sort === 'string' && /^[-\w\s]+$/.test(sort) ? sort : def.defaultSort || '-createdAt';
      const [items, total] = await Promise.all([
        populateQuery(Model.find(scoped).sort(sortBy).skip(skip).limit(lim).select('-activities'), def),
        Model.countDocuments(scoped),
      ]);
      res.json({ items: items.map(decorate), total, page: Number(page) || 1, limit: lim });
    })
  );

  router.get(
    '/:id',
    can('read'),
    asyncHandler(async (req, res) => {
      const doc = await load(req);
      await respond(req, res, doc);
    })
  );

  router.post(
    '/',
    can('create'),
    asyncHandler(async (req, res) => {
      const doc = new Model(sanitize(req.body, protectedKeys));
      doc.createdBy = req.user._id;
      doc.updatedBy = req.user._id;
      if (def.beforeCreate) await def.beforeCreate(doc, req.user);
      if (def.beforeSave) await def.beforeSave(doc, req.user);
      if (def.prefix) doc.number = await nextNumber(def.prefix);
      doc.activities.push({ type: 'system', message: `${def.label} dibuat`, by: req.user._id, byName: req.user.name });
      await doc.save();
      await audit(req, 'create', name, doc);
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
      doc.set(updates);
      doc.updatedBy = req.user._id;
      if (def.beforeSave) await def.beforeSave(doc, req.user);
      const changes = diff(before, doc.toObject(), [...Object.keys(updates), 'priority']);
      await doc.save();
      if (Object.keys(changes).length) await audit(req, 'update', name, doc, changes);
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
      const message = String(req.body.message || '').trim();
      if (!message) throw new HttpError(400, 'Pesan wajib diisi');
      // Worknote (internal) hanya untuk staf IT
      const type = req.body.type === 'worknote' && hasRole(req.user, def.write) ? 'worknote' : 'comment';
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
        const allowedByRole = hasRole(req.user, def.write) || def.canTransition?.(req.user, doc, to);
        if (!allowedByRole) throw new HttpError(403, 'Anda tidak berwenang mengubah status');
        const before = doc.toObject();
        const updates = sanitize(fields, protectedKeys);
        if (hasRole(req.user, def.write)) doc.set(updates);
        const err = checkTransition(def.workflow, doc, to, req.user);
        if (err) throw new HttpError(422, err);
        await performTransition(req, name, def, doc, to, note);
        await audit(req, 'transition', name, doc, { status: { from: before.status, to }, ...diff(before, doc.toObject(), Object.keys(updates)) });
        await respond(req, res, doc);
      })
    );
  }

  // CAB approval untuk Change (segregation of duties + multi-approver untuk risiko tinggi)
  if (Model === Change) {
    router.post(
      '/:id/approve',
      asyncHandler(async (req, res) => {
        const doc = await load(req);
        if (!hasRole(req.user, ['cab_member', 'change_manager'])) throw new HttpError(403, 'Hanya anggota CAB / Change Manager');
        if (doc.status !== 'cab_review') throw new HttpError(422, 'Change tidak sedang dalam CAB review');
        const me = String(req.user._id);
        if ([doc.requester, doc.createdBy, doc.assignee].some((u) => u && String(u) === me))
          throw new HttpError(422, 'Segregation of duties: pemohon/implementer tidak boleh menyetujui change ini');
        if (doc.approvals.some((a) => String(a.approver) === me)) throw new HttpError(409, 'Anda sudah memberikan keputusan');
        const decision = req.body.decision === 'rejected' ? 'rejected' : 'approved';
        doc.approvals.push({ approver: req.user._id, approverName: req.user.name, decision, comment: req.body.comment });
        const approvedCount = doc.approvals.filter((a) => a.decision === 'approved').length;
        let to = null;
        if (decision === 'rejected') to = 'rejected';
        else if (approvedCount >= (doc.requiredApprovals || 1)) to = 'approved';
        if (to) {
          const err = checkTransition(def.workflow, doc, to, req.user, { viaApproval: true });
          if (err) throw new HttpError(422, err);
          await performTransition(req, name, def, doc, to, `CAB: ${req.body.comment || decision}`);
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

async function performTransition(req, name, def, doc, to, note) {
  const from = doc.status;
  const now = new Date();
  doc.status = to;
  def.workflow.onEnter?.[to]?.(doc, req.user, now);
  if (doc.sla) {
    doc.sla = applyTransition(doc.sla.toObject ? doc.sla.toObject() : doc.sla, from, to, now);
  }
  doc.updatedBy = req.user._id;
  if (def.beforeSave) await def.beforeSave(doc, req.user);
  doc.activities.push({
    type: 'transition',
    from,
    to,
    message: note || undefined,
    by: req.user._id,
    byName: req.user.name,
  });
  await doc.save();
}
