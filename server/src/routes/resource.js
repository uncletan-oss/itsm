const express = require('express');
const mongoose = require('mongoose');
const { hasRole } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../middleware/error');
const { audit, diff } = require('../services/audit');
const { notify } = require('../services/notify');
const { checkTransition } = require('../services/workflows');
const { slaStatus } = require('../services/sla');
const { createDoc, transitionDoc, runOnSave, runValidate, plain } = require('../services/records');
const { approvalError, decide } = require('../../../shared/approvals.mjs');
const { spawnPrefill, spawnRule } = require('../../../shared/effects.mjs');

const USER_FIELDS = 'name email department';
const ALWAYS_PROTECTED = ['_id', 'id', 'tenant', 'number', 'activities', 'approvals', 'approvalRound', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt', 'sla', '__v', 'allowedTransitions', 'slaStatus', '_spawnFrom'];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function sanitize(body, protectedKeys, Model) {
  const out = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (k.startsWith('$') || k.includes('.') || protectedKeys.includes(k)) continue;
    if (Model && !Model.schema.path(k)) continue;
    out[k] = v === '' ? undefined : v;
  }
  // Field turunan (readonly) dihitung sistem, tidak boleh diisi klien
  for (const k of Model?.readonlyKeys || []) delete out[k];
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
  const clean = (body) => sanitize(body, protectedKeys, Model);

  const can = (action) => (req, res, next) => {
    const p = perm(req);
    if (!p.enabled) return next(new HttpError(403, `Modul ${def.label} tidak termasuk paket langganan workspace ini`));
    return hasRole(req.user, p[action]) ? next() : next(new HttpError(403, `Anda tidak berwenang (${action}) pada ${def.label}`));
  };
  const enabled = (req, res, next) =>
    perm(req).enabled ? next() : next(new HttpError(403, `Modul ${def.label} tidak termasuk paket langganan workspace ini`));
  // Penyetuju yang ditunjuk (mis. pemilik risiko / pemilik proses) boleh melihat & memutuskan walau tanpa akses modul
  const designated = (req, doc) => (def.approval?.steps || []).some((s) => s.field && doc[s.field] && String(doc[s.field]._id || doc[s.field]) === String(req.user._id));
  const assertView = (req, doc) => {
    if (!hasRole(req.user, perm(req).read) && !designated(req, doc)) throw new HttpError(403, `Anda tidak berwenang (read) pada ${def.label}`);
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

  router.get(
    '/:id',
    enabled,
    asyncHandler(async (req, res) => {
      const doc = await load(req);
      assertView(req, doc);
      await respond(req, res, doc);
    })
  );

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
      const data = clean(req.body);
      await validateRefs(Model, data, req.tenant._id);
      const doc = await createDoc(req, registry, name, data);
      // Dibuat dari aksi "buat record terkait": isi tautan balik di record sumber
      const from = typeof req.body?._spawnFrom === 'string' ? req.body._spawnFrom.split(':') : null;
      if (from && registry[from[0]] && mongoose.isValidObjectId(from[1])) {
        const rule = spawnRule(from[0], name);
        const src = rule?.backlink && (await registry[from[0]].model.findOne({ _id: from[1], tenant: req.tenant._id }));
        if (src) {
          src.set(rule.backlink, doc._id);
          src.activities?.push({ type: 'system', message: `${def.label} ${doc.number || ''} dibuat dari record ini`, by: req.user._id, byName: req.user.name });
          await src.save();
        }
      }
      await respond(req, res, doc, 201);
    })
  );

  router.put(
    '/:id',
    can('write'),
    asyncHandler(async (req, res) => {
      const doc = await load(req);
      const before = doc.toObject();
      const updates = clean(req.body);
      await validateRefs(Model, updates, req.tenant._id);
      doc.set(updates);
      doc.updatedBy = req.user._id;
      if (def.beforeSave) await def.beforeSave(doc, req.user);
      await runValidate(req, registry, name, doc, { isNew: false, before });
      const changes = diff(before, doc.toObject(), [...Object.keys(updates), 'priority']);
      await doc.save();
      if (Object.keys(changes).length) await audit(req, 'update', name, doc, changes);
      await notify(req, { event: 'update', resource: name, label: def.label, doc, before });
      await runOnSave(req, registry, name, doc);
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
        const updates = clean(fields);
        const allowed = canWrite ? updates : Object.fromEntries(Object.entries(updates).filter(([k]) => def.transitionFieldsFor?.(to).includes(k)));
        if (Object.keys(allowed).length) {
          await validateRefs(Model, allowed, req.tenant._id);
          doc.set(allowed);
          if (def.beforeSave) await def.beforeSave(doc, req.user);
        }
        const err = checkTransition(def.workflow, doc, to, req.user);
        if (err) throw new HttpError(422, err);
        await transitionDoc(req, registry, name, doc, to, note, { before });
        await audit(req, 'transition', name, doc, { status: { from: before.status, to }, ...diff(before, doc.toObject(), Object.keys(allowed)) });
        await respond(req, res, doc);
      })
    );
  }

  // Persetujuan multi-tahap generik (shared/approvals.mjs): CAB, PO, tagihan, pembayaran, vendor, BIA, dst.
  if (def.approval) {
    const policy = def.approval;
    router.post(
      '/:id/approve',
      enabled,
      asyncHandler(async (req, res) => {
        const doc = await load(req);
        assertView(req, doc);
        const snapshot = plain(doc);
        const err = approvalError(policy, snapshot, req.user);
        if (err) throw new HttpError(snapshot.status !== policy.status ? 422 : 403, err);
        const before = doc.toObject();
        const { record, outcome, next } = decide(policy, snapshot, req.user, req.body?.decision, req.body?.comment);
        doc.approvals.push(record);
        if (outcome === 'pending') {
          doc.activities.push({ type: 'system', message: `Disetujui tahap "${record.step}" oleh ${req.user.name}${record.comment ? ` — ${record.comment}` : ''}`, by: req.user._id, byName: req.user.name });
          await doc.save();
          await notify(req, { event: 'approval_step', resource: name, label: def.label, doc, next });
        } else {
          const to = outcome === 'approved' ? policy.approved : policy.rejected;
          const terr = checkTransition(def.workflow, doc, to, req.user, { viaApproval: true });
          if (terr) throw new HttpError(422, terr);
          await transitionDoc(req, registry, name, doc, to, `${policy.label} — ${record.step}: ${outcome === 'approved' ? 'disetujui' : 'ditolak'}${record.comment ? ` (${record.comment})` : ''}`, { before });
        }
        await audit(req, 'approval', name, doc, { step: record.step, decision: record.decision, comment: record.comment });
        await respond(req, res, doc);
      })
    );
  }

  // Aksi "buat record terkait": kembalikan nilai awal formulir target
  router.get(
    '/:id/spawn/:target',
    can('read'),
    asyncHandler(async (req, res) => {
      const doc = await load(req);
      const data = spawnPrefill(name, plain(doc), req.params.target);
      if (!data) throw new HttpError(404, 'Aksi tidak tersedia');
      res.json(data);
    })
  );

  return router;
};
