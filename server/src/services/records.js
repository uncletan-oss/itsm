/**
 * Operasi record yang dipakai router & efek lintas-record:
 * pembuatan (penomoran, hook), transisi (cek → status → efek → notifikasi), dan `store`
 * (antarmuka tenant-scoped untuk aturan di shared/effects.mjs).
 */
const mongoose = require('mongoose');
const { nextNumber } = require('../models/Counter');
const { audit } = require('./audit');
const { notify } = require('./notify');
const { applyTransition } = require('./sla');
const { HttpError } = require('../middleware/error');
const { CHECKS, EFFECTS, ON_SAVE } = require('../../../shared/effects.mjs');
const { startRound } = require('../../../shared/approvals.mjs');

const plain = (doc) => (doc?.toObject ? doc.toObject({ depopulate: true }) : doc);

function makeStore(req, registry) {
  const tenant = req.tenant._id;
  const model = (res) => registry[res].model;
  const toQuery = (filter = {}) => Object.fromEntries(Object.entries(filter).map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) && v.$in ? { $in: v.$in } : v]));
  return {
    get: async (res, id) => (id && mongoose.isValidObjectId(id) ? model(res).findOne({ _id: id, tenant }).lean() : null),
    find: async (res, filter) => model(res).find({ ...toQuery(filter), tenant }).lean(),
    update: async (res, id, patch, note) => {
      const update = { $set: patch };
      if (note && model(res).schema.path('activities')) update.$push = { activities: { type: 'system', message: note, byName: 'Sistem', at: new Date() } };
      const doc = await model(res).findOneAndUpdate({ _id: id, tenant }, update, { new: true }).lean();
      if (doc) await audit(req, 'effect', res, doc, patch);
      return doc;
    },
    create: async (res, data) => plain(await createDoc(req, registry, res, data, { trusted: true })),
  };
}

/** Buat record. trusted = dibuat sistem (boleh set status), tanpa validasi hak akses. */
async function createDoc(req, registry, name, data, { trusted = false } = {}) {
  const def = registry[name];
  const doc = new def.model(data);
  doc.tenant = req.tenant._id;
  doc.createdBy = req.user._id;
  doc.updatedBy = req.user._id;
  if (def.beforeCreate) await def.beforeCreate(doc, req.user);
  if (def.beforeSave) await def.beforeSave(doc, req.user);
  if (def.prefix) doc.number = await nextNumber(req.tenant._id, def.prefix);
  if (doc.schema.path('activities')) {
    doc.activities.push({ type: 'system', message: trusted ? `${def.label} dibuat otomatis oleh sistem` : `${def.label} dibuat`, by: req.user._id, byName: req.user.name });
  }
  await doc.save();
  await audit(req, 'create', name, doc);
  await notify(req, { event: 'create', resource: name, label: def.label, doc });
  await runOnSave(req, registry, name, doc);
  return doc;
}

async function runOnSave(req, registry, name, doc) {
  if (ON_SAVE[name]) await ON_SAVE[name](plain(doc), makeStore(req, registry));
}

/** Jalankan cek lintas-record sebelum transisi; perubahan yang dibuat cek (mis. hasil 3-way match) disalin ke dokumen. */
async function runCheck(req, registry, name, doc, to) {
  const check = CHECKS[name]?.[to];
  if (!check) return;
  const p = plain(doc);
  const before = JSON.stringify(p);
  const err = await check(p, makeStore(req, registry));
  if (err) throw new HttpError(422, err);
  if (JSON.stringify(p) !== before) {
    for (const k of ['vendor', 'matchResult']) if (p[k] !== undefined) doc.set(k, p[k]);
  }
}

/** Transisi status lengkap: cek → onEnter → SLA → putaran persetujuan → simpan → efek → notifikasi. */
async function transitionDoc(req, registry, name, doc, to, note, { before } = {}) {
  const def = registry[name];
  await runCheck(req, registry, name, doc, to);
  const from = doc.status;
  const now = new Date();
  doc.status = to;
  def.workflow.onEnter?.[to]?.(doc, req.user, now);
  if (doc.sla) doc.sla = applyTransition(doc.sla.toObject ? doc.sla.toObject() : doc.sla, from, to, now);
  startRound(def.approval, doc, to);
  doc.updatedBy = req.user._id;
  if (def.beforeSave) await def.beforeSave(doc, req.user);
  doc.activities.push({ type: 'transition', from, to, message: note || undefined, by: req.user._id, byName: req.user.name });
  await doc.save();
  if (EFFECTS[name]?.[to]) await EFFECTS[name][to](plain(doc), makeStore(req, registry));
  await notify(req, { event: 'transition', resource: name, label: def.label, doc, before: before || { status: from }, to });
  return doc;
}

module.exports = { makeStore, createDoc, transitionDoc, runOnSave, plain };
