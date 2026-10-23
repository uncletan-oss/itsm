/**
 * Backend demo multi-tenant yang berjalan sepenuhnya di browser (untuk GitHub Pages / tanpa server).
 * Meniru kontrak REST API server/ dan memakai logika bisnis yang sama dari shared/
 * (workflow, SLA, prioritas, matriks hak akses, paket, notifikasi, dashboard & laporan).
 * Data disimpan di localStorage browser masing-masing pengunjung.
 */
import { ROLES, PLATFORM_ROLE } from '../../../shared/roles.mjs';
import { checkTransition } from '../../../shared/workflows.mjs';
import { computeDueDates, applyTransition, slaStatus } from '../../../shared/sla.mjs';
import { frameworks, industries } from '../../../shared/frameworks.mjs';
import { serviceStatuses, publicMaintenance, publicArticle, publicService } from '../../../shared/public.mjs';
import { DEFAULT_PERMISSIONS, PAGES, effectivePermissions, sanitizeOverrides, canPage } from '../../../shared/permissions.mjs';
import { PLANS, PLAN_KEYS, validateSlug } from '../../../shared/plans.mjs';
import { notificationsFor } from '../../../shared/notify.mjs';
import { computeDashboard, computeReports, computeMyWork } from '../../../shared/insights.mjs';
import { computeKpi } from '../../../shared/kpi.mjs';
import { APPROVALS, approvalError, decide, startRound } from '../../../shared/approvals.mjs';
import { CHECKS, EFFECTS, ON_SAVE, VALIDATE, spawnPrefill, spawnRule } from '../../../shared/effects.mjs';
import { ALL_MODULES } from '../../../shared/plans.mjs';
import { grantedModules, userLimit } from '../../../shared/permissions.mjs';
import { RESOURCES, hasRole, isRequesterOnly, same } from './registry.js';
import { seed, DEMO_PASSWORD } from './seed.js';

const KEY = 'itsm_demo_db_v5';
const NAME_KEYED = ['services', 'configuration-items', 'assets', 'vendors', 'continuity', 'architecture', 'projects', 'sprints', 'sla-policies'];
const ALWAYS_PROTECTED = ['_id', 'id', 'tenant', 'number', 'activities', 'approvals', 'approvalRound', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt', 'sla', '__v', 'allowedTransitions', 'slaStatus', '_spawnFrom'];
const DEFAULT_SLA = [[1, 15, 240], [2, 30, 480], [3, 120, 1440], [4, 480, 4320]];
const DEFAULT_CATALOG = [
  { name: 'Reset Password', requestCategory: 'Akun', description: 'Reset password akun domain/email' },
  { name: 'Permintaan Akses Aplikasi', requestCategory: 'Akses', description: 'Hak akses ke aplikasi bisnis', requiresApproval: true },
  { name: 'Permintaan Perangkat Baru', requestCategory: 'Perangkat Keras', description: 'Laptop, monitor, atau perangkat pendukung', requiresApproval: true },
];

class DemoError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
const idOf = (v) => (v && typeof v === 'object' ? v._id : v);
const nowIso = () => new Date().toISOString();

let db = null;
let ready = false;
let loading = null;
async function load() {
  if (ready) return db;
  if (loading) return loading;
  loading = (async () => {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(KEY));
    } catch {
      stored = null;
    }
    if (stored) db = stored;
    else {
      db = emptyDb();
      await seed(api);
      save();
    }
    ready = true;
    loading = null;
    return db;
  })();
  return loading;
}
function emptyDb() {
  return { tenants: [], users: [], counters: {}, audit: [], notifications: [], ...Object.fromEntries(Object.keys(RESOURCES).map((k) => [k, []])) };
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    console.warn('Gagal menyimpan data demo', e);
  }
}
export async function resetDemo() {
  localStorage.removeItem(KEY);
  db = null;
  ready = false;
  await load();
}

const nextNumber = (tenant, prefix) => {
  const k = `${tenant}:${prefix}`;
  db.counters[k] = (db.counters[k] || 0) + 1;
  return `${prefix}${String(db.counters[k]).padStart(6, '0')}`;
};

function audit(ctx, action, resource, record, changes) {
  db.audit.push({
    _id: newId(), tenant: ctx.tenant?._id ?? null, at: nowIso(), actor: ctx.user?._id, actorName: ctx.user?.name, action, resource,
    recordId: record?._id, recordNumber: record?.number || record?.slug || record?.name || record?.title, changes, ip: 'browser (demo)',
  });
}
function diff(before, after, keys) {
  const out = {};
  for (const k of keys) {
    if (['updatedAt', 'activities', 'updatedBy'].includes(k)) continue;
    if (JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null)) out[k] = { from: before?.[k] ?? null, to: after?.[k] ?? null };
  }
  return out;
}

function notify(ctx, event) {
  for (const n of notificationsFor({ ...event, actor: ctx.user })) {
    let ids = n.userIds || [];
    if (n.roles?.length) {
      ids = [...ids, ...db.users.filter((u) => u.tenant === ctx.tenant._id && u.active && u.roles.some((r) => n.roles.includes(r)) && u._id !== ctx.user._id).map((u) => u._id)];
    }
    for (const user of new Set(ids)) {
      db.notifications.push({ _id: newId(), tenant: ctx.tenant._id, user, title: n.title, body: n.body, kind: n.kind || 'info', link: n.link, read: false, createdAt: nowIso() });
    }
  }
}

const publicUser = (u) => u && { _id: u._id, name: u.name, email: u.email, department: u.department };
const fullUser = (u) => {
  const { password, ...rest } = u;
  return rest;
};

function sanitize(body, protectedKeys, readonlyKeys = []) {
  const out = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (k.startsWith('$') || k.includes('.') || protectedKeys.includes(k) || readonlyKeys.includes(k)) continue;
    // baris (lines) disimpan apa adanya; referensi diubah ke id
    out[k] = v === '' ? undefined : Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' && !x._id ? x : idOf(x))) : idOf(v);
  }
  return out;
}

/** Antarmuka store untuk aturan lintas-record (shared/effects.mjs), terbatas pada tenant aktif. */
function makeStore(ctx) {
  const match = (d, filter) => Object.entries(filter || {}).every(([k, v]) => {
    const val = d[k];
    const vals = Array.isArray(val) ? val.map(String) : [String(val ?? '')];
    if (v && typeof v === 'object' && Array.isArray(v.$in)) return v.$in.map(String).some((x) => vals.includes(x));
    return vals.includes(String(v));
  });
  return {
    get: async (res, rid) => clone(db[res].find((d) => d._id === String(rid) && d.tenant === ctx.tenant._id) || null),
    find: async (res, filter) => clone(db[res].filter((d) => d.tenant === ctx.tenant._id && match(d, filter))),
    update: async (res, rid, patch, note) => {
      const d = db[res].find((x) => x._id === String(rid) && x.tenant === ctx.tenant._id);
      if (!d) return null;
      Object.assign(d, clone(patch), { updatedAt: nowIso() });
      if (note && d.activities) d.activities.push({ _id: newId(), type: 'system', message: note, byName: 'Sistem', at: nowIso() });
      audit(ctx, 'effect', res, d, patch);
      return clone(d);
    },
    create: async (res, data) => clone(await createRecord(ctx, res, data, { trusted: true })),
  };
}

/** Tolak referensi ke record tenant lain (cermin validateRefs di server). */
function validateRefs(name, updates, tenant) {
  for (const [k, coll] of Object.entries(RESOURCES[name].refs || {})) {
    const v = updates[k];
    if (v == null) continue;
    const ids = (Array.isArray(v) ? v : [v]).filter(Boolean);
    const pool = coll === 'users' ? db.users : db[coll];
    if (!ids.every((x) => pool.some((r) => r._id === x && r.tenant === tenant))) throw new DemoError(400, `Referensi tidak ditemukan pada ${k}`);
  }
}

function reviveSla(sla) {
  if (!sla) return sla;
  const s = { ...sla };
  for (const k of ['responseDue', 'resolutionDue', 'respondedAt', 'resolvedAt', 'pausedAt']) if (s[k]) s[k] = new Date(s[k]);
  return s;
}

function applySla(doc, appliesTo, priorityChanged) {
  if (!doc.priority || !priorityChanged) return;
  if (['resolved', 'fulfilled', 'closed', 'cancelled'].includes(doc.status)) return;
  const policy = db['sla-policies'].find((p) => p.tenant === doc.tenant && p.appliesTo === appliesTo && Number(p.priority) === doc.priority && p.active !== false);
  if (!policy) return;
  const due = computeDueDates(doc.createdAt || new Date(), policy);
  const pausedMs = (doc.sla?.pausedMinutes || 0) * 60000;
  doc.sla = { pausedMinutes: 0, responseBreached: false, resolutionBreached: false, ...doc.sla, ...due, resolutionDue: new Date(due.resolutionDue.getTime() + pausedMs) };
}

function populate(name, doc, canSeeWorknotes = true) {
  const def = RESOURCES[name];
  const out = clone(doc);
  for (const [field, coll] of Object.entries(def.refs || {})) {
    const resolve = (id) => {
      if (!id) return id;
      if (coll === 'users') return publicUser(db.users.find((u) => u._id === id)) || id;
      const ref = db[coll].find((r) => r._id === id);
      if (!ref) return id;
      const { activities, ...rest } = ref;
      return clone(rest);
    };
    if (Array.isArray(out[field])) out[field] = out[field].map(resolve);
    else if (out[field]) out[field] = resolve(out[field]);
  }
  if (out.sla) out.slaStatus = slaStatus(reviveSla(out.sla));
  if (out.activities && !canSeeWorknotes) out.activities = out.activities.filter((a) => a.type !== 'worknote');
  if (def.workflow) out.allowedTransitions = def.workflow.transitions[out.status] || [];
  out.id = out._id;
  return out;
}

function sortBy(items, spec) {
  const keys = spec.split(/\s+/).filter(Boolean).map((k) => (k.startsWith('-') ? [k.slice(1), -1] : [k, 1]));
  return [...items].sort((a, b) => {
    for (const [k, dir] of keys) {
      const x = a[k] ?? '';
      const y = b[k] ?? '';
      if (x < y) return -dir;
      if (x > y) return dir;
    }
    return 0;
  });
}

const tenantItems = (name, ctx) => db[name].filter((d) => d.tenant === ctx.tenant._id);
function scoped(name, ctx) {
  const fn = RESOURCES[name].scope?.(ctx.user);
  const items = tenantItems(name, ctx);
  return fn ? items.filter(fn) : items;
}
function findDoc(name, id, ctx) {
  const doc = scoped(name, ctx).find((d) => d._id === id);
  if (!doc) throw new DemoError(404, `${RESOURCES[name].label} tidak ditemukan`);
  return doc;
}
const canRead = (ctx, name) => ctx.perms[name]?.enabled && hasRole(ctx.user, ctx.perms[name].read);
function can(ctx, name, action) {
  const p = ctx.perms[name];
  if (!p.enabled) throw new DemoError(403, `Modul ${RESOURCES[name].label} tidak termasuk paket langganan workspace ini`);
  if (!hasRole(ctx.user, p[action])) throw new DemoError(403, `Anda tidak berwenang (${action}) pada ${RESOURCES[name].label}`);
}
const requirePage = (ctx, page) => {
  if (!canPage(ctx.user, page)) throw new DemoError(403, 'Akses ditolak untuk peran Anda');
};

const CHECK_SKIP = ['_id', 'tenant', 'status', 'approvals', 'activities', 'approvalRound', 'createdBy', 'createdAt', 'updatedAt', 'number'];
async function runCheck(ctx, name, doc, to) {
  const check = CHECKS[name]?.[to];
  if (!check) return;
  const p = clone(doc);
  const err = await check(p, makeStore(ctx));
  if (err) throw new DemoError(422, err);
  for (const [k, v] of Object.entries(p)) if (!CHECK_SKIP.includes(k) && JSON.stringify(v) !== JSON.stringify(doc[k])) doc[k] = v;
}

async function runValidate(ctx, name, doc, extra) {
  if (!VALIDATE[name]) return;
  const err = await VALIDATE[name](clone(doc), makeStore(ctx), extra);
  if (err) throw new DemoError(422, err);
}

/** Transisi lengkap: cek → status → efek → notifikasi (cermin server/src/services/records.js). */
async function transitionDoc(ctx, name, doc, to, note, before) {
  await runCheck(ctx, name, doc, to);
  performTransition(name, doc, to, note, ctx.user);
  if (EFFECTS[name]?.[to]) await EFFECTS[name][to](clone(doc), makeStore(ctx));
  notify(ctx, { event: 'transition', resource: name, label: RESOURCES[name].label, doc, before: before || { status: doc.status }, to });
}

function performTransition(name, doc, to, note, user) {
  const def = RESOURCES[name];
  const from = doc.status;
  const now = new Date();
  doc.status = to;
  def.workflow.onEnter?.[to]?.(doc, user, now);
  startRound(def.approval, doc, to);
  if (doc.sla) doc.sla = applyTransition(reviveSla(doc.sla), from, to, now);
  const prevPriority = doc.priority;
  def.beforeSave?.(doc, user, false);
  if (def.sla) applySla(doc, def.sla, doc.priority !== prevPriority);
  doc.updatedBy = user._id;
  doc.updatedAt = now.toISOString();
  doc.activities.push({ _id: newId(), type: 'transition', from, to, message: note || undefined, by: user._id, byName: user.name, at: now.toISOString() });
  Object.assign(doc, clone(doc)); // normalisasi Date -> ISO string
}

// ---------- Resource handlers ----------
async function createRecord(ctx, name, body, { trusted = false } = {}) {
  const def = RESOURCES[name];
  const { user, tenant } = ctx;
  if (!trusted) can(ctx, name, 'create');
  const protectedKeys = [...ALWAYS_PROTECTED, ...(def.protected || []), ...(def.workflow ? ['status'] : [])];
  const titleKey = def.titleKey !== undefined ? def.titleKey : NAME_KEYED.includes(name) ? 'name' : 'title';
  const data = trusted ? Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) : sanitize(body, protectedKeys, def.readonlyKeys);
  if (!trusted) validateRefs(name, data, tenant._id);
  const now = nowIso();
  const doc = { ...clone(def.defaults || {}), ...data, _id: newId(), tenant: tenant._id, activities: [], createdBy: (trusted && data.createdBy) || user._id, updatedBy: user._id, createdAt: data.createdAt || now, updatedAt: now };
  if (def.initial && !doc.status) doc.status = def.initial;
  if (titleKey && !doc[titleKey]) throw new DemoError(400, 'Validasi gagal', { [titleKey]: `${titleKey === 'name' ? 'Nama' : 'Judul'} wajib diisi` });
  for (const [k, msg] of Object.entries(def.required || {})) if (!doc[k]) throw new DemoError(400, 'Validasi gagal', { [k]: msg });
  def.beforeCreate?.(doc, user, db);
  def.beforeSave?.(doc, user, true);
  if (def.sla) applySla(doc, def.sla, true);
  if (!trusted) await runValidate(ctx, name, clone(doc), { isNew: true });
  if (def.prefix) doc.number = nextNumber(tenant._id, def.prefix);
  if (!def.noActivity) doc.activities.push({ _id: newId(), type: 'system', message: `${def.label} dibuat`, by: user._id, byName: user.name, at: now });
  const stored = clone(doc);
  db[name].push(stored);
  if (!trusted) {
    audit(ctx, 'create', name, stored);
    notify(ctx, { event: 'create', resource: name, label: def.label, doc: stored });
  }
  if (ON_SAVE[name] && ctx.tenant) await ON_SAVE[name](clone(stored), makeStore(ctx));
  return stored;
}

async function resourceRoute(ctx, name, method, rest, body, query) {
  const def = RESOURCES[name];
  const { user } = ctx;
  const canWrite = ctx.perms[name].enabled && hasRole(user, ctx.perms[name].write);
  const protectedKeys = [...ALWAYS_PROTECTED, ...(def.protected || []), ...(def.workflow ? ['status'] : [])];
  const [id, action] = rest;

  if (!id && method === 'GET') {
    can(ctx, name, 'read');
    const { q, page = 1, limit = 25, sort, ...filters } = query;
    let items = scoped(name, ctx);
    for (const [k, v] of Object.entries(filters)) {
      if (typeof v !== 'string' || v === '' || k === 'tenant') continue;
      const values = v.split(',');
      items = items.filter((d) => values.includes(String(d[k] ?? '')));
    }
    if (q && def.search) {
      const needle = q.trim().toLowerCase();
      items = items.filter((d) => def.search.some((f) => String(d[f] ?? '').toLowerCase().includes(needle)));
    }
    items = sortBy(items, typeof sort === 'string' && sort ? sort : def.defaultSort || '-createdAt');
    const lim = Math.min(Math.max(Number(limit) || 25, 1), 200);
    const pg = Math.max(Number(page) || 1, 1);
    return {
      items: items.slice((pg - 1) * lim, pg * lim).map((d) => {
        const { activities, ...r } = populate(name, d);
        return r;
      }),
      total: items.length, page: pg, limit: lim,
    };
  }
  if (!id && method === 'POST') {
    const created = await createRecord(ctx, name, body);
    // Dibuat dari aksi "buat record terkait": isi tautan balik di record sumber
    const from = typeof body._spawnFrom === 'string' ? body._spawnFrom.split(':') : null;
    const rule = from && RESOURCES[from[0]] && spawnRule(from[0], name);
    if (rule?.backlink) {
      const src = tenantItems(from[0], ctx).find((d) => d._id === from[1]);
      if (src) {
        src[rule.backlink] = created._id;
        src.activities?.push({ _id: newId(), type: 'system', message: `${def.label} ${created.number || ''} dibuat dari record ini`, by: user._id, byName: user.name, at: nowIso() });
      }
    }
    return populate(name, created, canWrite);
  }

  const doc = tenantItems(name, ctx).find((d) => d._id === id);
  if (!doc) throw new DemoError(404, `${def.label} tidak ditemukan`);
  // Penyetuju yang ditunjuk (mis. pemilik risiko) boleh melihat & memutuskan walau tanpa akses modul
  const designated = (def.approval?.steps || []).some((st) => st.field && same(doc[st.field], user));
  const scopeFn = def.scope?.(user);
  if (scopeFn && !scopeFn(doc)) throw new DemoError(404, `${def.label} tidak ditemukan`);
  const assertView = () => {
    if (!ctx.perms[name].enabled) throw new DemoError(403, `Modul ${def.label} tidak termasuk paket langganan workspace ini`);
    if (!hasRole(user, ctx.perms[name].read) && !designated) throw new DemoError(403, `Anda tidak berwenang (read) pada ${def.label}`);
  };
  if (!action && method === 'GET') {
    assertView();
    return populate(name, doc, canWrite);
  }
  if (action === 'spawn' && method === 'GET') {
    can(ctx, name, 'read');
    const data = spawnPrefill(name, clone(doc), rest[2]);
    if (!data) throw new DemoError(404, 'Aksi tidak tersedia');
    return data;
  }
  if (action === 'related' && method === 'GET') {
    can(ctx, name, 'read');
    const groups = [];
    for (const [other, odef] of Object.entries(RESOURCES)) {
      if (!canRead(ctx, other)) continue;
      const fields = Object.entries(odef.refs || {}).filter(([, c]) => c === name).map(([f]) => f);
      if (!fields.length) continue;
      const items = scoped(other, ctx)
        .filter((d) => fields.some((f) => (Array.isArray(d[f]) ? d[f].includes(id) : d[f] === id)))
        .slice(0, 10)
        .map(({ _id, number, title, name: n, status, priority }) => ({ _id, number, title, name: n, status, priority }));
      if (items.length) groups.push({ resource: other, label: odef.label, items });
    }
    return groups;
  }
  if (!action && method === 'PUT') {
    can(ctx, name, 'write');
    const before = clone(doc);
    const updates = sanitize(body, protectedKeys, def.readonlyKeys);
    validateRefs(name, updates, ctx.tenant._id);
    const draft = { ...clone(doc), ...updates };
    def.beforeSave?.(draft, user, false);
    await runValidate(ctx, name, draft, { isNew: false, before });
    Object.assign(doc, updates);
    for (const [k, v] of Object.entries(updates)) if (v === undefined) delete doc[k];
    const prevPriority = before.priority;
    def.beforeSave?.(doc, user, false);
    if (def.sla) applySla(doc, def.sla, doc.priority !== prevPriority);
    doc.updatedBy = user._id;
    doc.updatedAt = nowIso();
    Object.assign(doc, clone(doc));
    const changes = diff(before, doc, [...Object.keys(updates), 'priority']);
    if (Object.keys(changes).length) audit(ctx, 'update', name, doc, changes);
    notify(ctx, { event: 'update', resource: name, label: def.label, doc, before });
    if (ON_SAVE[name]) await ON_SAVE[name](clone(doc), makeStore(ctx));
    return populate(name, doc, canWrite);
  }
  if (!action && method === 'DELETE') {
    can(ctx, name, 'remove');
    db[name] = db[name].filter((d) => d._id !== id);
    audit(ctx, 'delete', name, doc, { snapshot: doc });
    return null;
  }
  if (action === 'comments' && method === 'POST') {
    can(ctx, name, 'read');
    const message = String(body.message || '').trim();
    if (!message) throw new DemoError(400, 'Pesan wajib diisi');
    const type = body.type === 'worknote' && canWrite ? 'worknote' : 'comment';
    doc.activities.push({ _id: newId(), type, message, by: user._id, byName: user.name, at: nowIso() });
    return populate(name, doc, canWrite);
  }
  if (action === 'transition' && method === 'POST' && def.workflow) {
    can(ctx, name, 'read');
    const { to, note, ...fields } = body || {};
    if (!(canWrite || def.canTransition?.(user, doc, to))) throw new DemoError(403, 'Anda tidak berwenang mengubah status');
    const before = clone(doc);
    const updates = sanitize(fields, protectedKeys, def.readonlyKeys);
    const allowed = canWrite ? updates : Object.fromEntries(Object.entries(updates).filter(([k]) => def.transitionFieldsFor?.(to).includes(k)));
    validateRefs(name, allowed, ctx.tenant._id);
    const draft = { ...clone(doc), ...allowed };
    def.beforeSave?.(draft, user, false);
    const err = checkTransition(def.workflow, draft, to, user);
    if (err) throw new DemoError(422, err);
    Object.assign(doc, allowed);
    def.beforeSave?.(doc, user, false);
    await transitionDoc(ctx, name, doc, to, note, before);
    audit(ctx, 'transition', name, doc, { status: { from: before.status, to }, ...diff(before, doc, Object.keys(allowed)) });
    return populate(name, doc, canWrite);
  }
  // Persetujuan multi-tahap generik (shared/approvals.mjs)
  if (action === 'approve' && method === 'POST' && def.approval) {
    assertView();
    const policy = def.approval;
    const err = approvalError(policy, doc, user);
    if (err) throw new DemoError(doc.status !== policy.status ? 422 : 403, err);
    const before = clone(doc);
    const { record, outcome, next } = decide(policy, doc, user, body.decision, body.comment);
    record._id = newId();
    if (outcome === 'pending') {
      doc.activities.push({ _id: newId(), type: 'system', message: `Disetujui tahap "${record.step}" oleh ${user.name}${record.comment ? ` — ${record.comment}` : ''}`, by: user._id, byName: user.name, at: nowIso() });
      notify(ctx, { event: 'approval_step', resource: name, label: def.label, doc, next });
    } else {
      const to = outcome === 'approved' ? policy.approved : policy.rejected;
      const terr = checkTransition(def.workflow, doc, to, user, { viaApproval: true });
      if (terr) {
        doc.approvals.pop();
        throw new DemoError(422, terr);
      }
      try {
        await transitionDoc(ctx, name, doc, to, `${policy.label} — ${record.step}: ${outcome === 'approved' ? 'disetujui' : 'ditolak'}${record.comment ? ` (${record.comment})` : ''}`, before);
      } catch (e) {
        doc.approvals.pop();
        throw e;
      }
    }
    audit(ctx, 'approval', name, doc, { step: record.step, decision: record.decision, comment: record.comment });
    return populate(name, doc, canWrite);
  }
  throw new DemoError(404, `Endpoint tidak ditemukan: ${method} ${name}/${rest.join('/')}`);
}

// ---------- Tenant provisioning & kepatuhan ----------
function syncControls(tenantId, frameworkIds, user) {
  let created = 0;
  for (const fw of frameworks.filter((f) => frameworkIds.includes(f.id))) {
    for (const ctl of fw.controls) {
      const existing = db.controls.find((c) => c.tenant === tenantId && c.frameworkId === fw.id && c.code === ctl.code);
      const meta = { frameworkName: fw.name, title: ctl.title, domain: ctl.domain, nistFunction: ctl.nistFunction, guidance: ctl.guidance };
      if (existing) Object.assign(existing, meta);
      else {
        db.controls.push({ _id: newId(), tenant: tenantId, frameworkId: fw.id, code: ctl.code, ...meta, status: 'not_assessed', activities: [], createdBy: user?._id, createdAt: nowIso(), updatedAt: nowIso() });
        created += 1;
      }
    }
  }
  return created;
}

async function provisionTenant({ slug, name, industry = 'general', plan = 'professional', status = 'trial', admin }) {
  const slugErr = validateSlug(slug);
  if (slugErr) throw new DemoError(400, slugErr);
  if (!PLANS[plan]) throw new DemoError(400, 'Paket tidak dikenal');
  const ind = industries.find((i) => i.id === industry);
  if (!ind) throw new DemoError(400, 'Industri tidak dikenal');
  if (!name) throw new DemoError(400, 'Nama organisasi wajib diisi');
  if (db.tenants.some((t) => t.slug === slug)) throw new DemoError(409, 'Kode workspace sudah dipakai');
  if (!admin?.email || !admin?.name) throw new DemoError(400, 'Nama & email admin wajib diisi');
  if (!admin.password || admin.password.length < 8) throw new DemoError(400, 'Password minimal 8 karakter');
  const tenant = {
    _id: newId(), slug, name, industry, plan, status, enabledFrameworks: ind.frameworks, timezone: 'Asia/Jakarta', dataResidency: 'Indonesia',
    branding: {}, permissions: {}, createdAt: nowIso(), trialEndsAt: status === 'trial' ? new Date(Date.now() + 14 * 864e5).toISOString() : undefined,
  };
  db.tenants.push(tenant);
  const user = { _id: newId(), tenant: tenant._id, name: admin.name, email: admin.email.toLowerCase(), password: admin.password, roles: ['admin'], active: true, createdAt: nowIso() };
  db.users.push(user);
  const ctx = { tenant, user };
  for (const [p, r, res] of DEFAULT_SLA) {
    await createRecord(ctx, 'sla-policies', { name: `Incident P${p}`, appliesTo: 'incident', priority: p, responseMinutes: r, resolutionMinutes: res }, { trusted: true });
    await createRecord(ctx, 'sla-policies', { name: `Request P${p}`, appliesTo: 'request', priority: p, responseMinutes: r * 2, resolutionMinutes: res * 3 }, { trusted: true });
  }
  for (const svc of DEFAULT_CATALOG) await createRecord(ctx, 'services', { requestable: true, criticality: 'low', ...svc }, { trusted: true });
  syncControls(tenant._id, tenant.enabledFrameworks, user);
  return { tenant, user };
}

function complianceSummary(tenant) {
  return {
    industry: tenant.industry,
    summary: tenant.enabledFrameworks.map((id) => {
      const fw = frameworks.find((f) => f.id === id);
      const counts = { total: 0 };
      for (const c of db.controls.filter((x) => x.tenant === tenant._id && x.frameworkId === id)) {
        counts[c.status] = (counts[c.status] || 0) + 1;
        counts.total += 1;
      }
      const applicable = counts.total - (counts.not_applicable || 0);
      const score = applicable ? Math.round((((counts.implemented || 0) + (counts.partial || 0) * 0.5) / applicable) * 100) : 0;
      return { id, name: fw?.name, type: fw?.type, issuer: fw?.issuer, note: fw?.note, counts, score };
    }),
  };
}

const readable = (ctx, names, filter = () => true) =>
  Object.fromEntries(names.filter((n) => canRead(ctx, n)).map((n) => [n, scoped(n, ctx).filter(filter)]));

function session(ctx) {
  const t = ctx.tenant;
  return {
    user: fullUser(ctx.user),
    tenant: t && { _id: t._id, slug: t.slug, name: t.name, industry: t.industry, plan: t.plan, planName: PLANS[t.plan]?.name, status: t.status, trialEndsAt: t.trialEndsAt, branding: t.branding },
    permissions: ctx.perms || null,
  };
}

// ---------- Endpoint publik (tanpa login) ----------
async function publicRoute([what, slug, sub, id], method, body, query) {
  if (what === 'signup' && method === 'POST') {
    const plan = ['starter', 'professional'].includes(body.plan) ? body.plan : 'professional';
    const { tenant, user } = await provisionTenant({
      slug: String(body.slug || '').toLowerCase().trim(), name: String(body.organizationName || '').trim(), industry: body.industry, plan,
      admin: { name: String(body.adminName || '').trim(), email: String(body.adminEmail || '').toLowerCase().trim(), password: String(body.password || '') },
    });
    audit({ tenant, user }, 'signup', 'tenant', tenant, { plan, industry: tenant.industry });
    return { token: user._id, workspace: tenant.slug };
  }
  if (what === 'workspaces') {
    // Khusus demo: daftar workspace contoh untuk dipilih di halaman login & situs publik
    return {
      items: db.tenants.filter((t) => t.status !== 'suspended').map(({ _id, slug, name, industry, plan }) => ({
        slug, name, industry, plan, accounts: db.users.filter((u) => u.tenant === _id && u.active).map((u) => u.email.split('@')[0]),
      })),
    };
  }
  if (what !== 't') throw new DemoError(404, 'Endpoint publik tidak ditemukan');
  const tenant = db.tenants.find((t) => t.slug === String(slug).toLowerCase() && t.status !== 'suspended');
  if (!tenant) throw new DemoError(404, 'Workspace tidak ditemukan');
  const mine = (coll) => db[coll].filter((d) => d.tenant === tenant._id);
  const kb = mine('knowledge').filter((a) => a.status === 'published' && a.audience === 'public');
  if (sub === 'info') return { slug: tenant.slug, name: tenant.name, industry: tenant.industry, enabledFrameworks: tenant.enabledFrameworks, branding: tenant.branding };
  if (sub === 'status') {
    const services = sortBy(mine('services').filter((s) => s.status === 'live' && s.type !== 'supporting'), 'name');
    return { services: serviceStatuses(services, mine('incidents'), mine('changes')), maintenance: publicMaintenance(mine('changes'), services), updatedAt: nowIso() };
  }
  if (sub === 'knowledge' && id) {
    const a = kb.find((x) => x._id === id);
    if (!a) throw new DemoError(404, 'Artikel tidak ditemukan');
    a.views = (a.views || 0) + 1;
    return publicArticle(a, true);
  }
  if (sub === 'knowledge') {
    const q = (query.q || '').toLowerCase();
    const hit = (a) => !q || [a.title, a.content, a.category, ...(a.tags || [])].some((v) => String(v || '').toLowerCase().includes(q));
    return { items: sortBy(kb.filter(hit), '-publishedAt').map((a) => publicArticle(a)) };
  }
  if (sub === 'catalog') return { items: sortBy(mine('services').filter((s) => s.status === 'live' && s.requestable), 'requestCategory name').map(publicService) };
  throw new DemoError(404, 'Endpoint publik tidak ditemukan');
}

// ---------- Router ----------
async function route(method, path, body, query, token) {
  const parts = path.split('/').filter(Boolean);
  if (path === '/health') return { status: 'ok', mode: 'demo' };
  if (parts[0] === 'public') return publicRoute(parts.slice(1), method, body, query);
  if (path === '/auth/login' && method === 'POST') {
    const workspace = String(body.workspace || '').toLowerCase().trim();
    const email = String(body.email || '').toLowerCase().trim();
    const tenant = workspace ? db.tenants.find((t) => t.slug === workspace) : null;
    const user = (!workspace || tenant) && db.users.find((u) => (u.tenant ?? null) === (tenant?._id ?? null) && u.email === email);
    if (!user || !user.active || user.password !== String(body.password || '')) {
      if (tenant) audit({ tenant, user }, 'login_failed', 'auth', null, { workspace, email });
      throw new DemoError(401, 'Workspace, email, atau password salah');
    }
    if (tenant?.status === 'suspended') throw new DemoError(403, 'Workspace ditangguhkan. Hubungi administrator platform.');
    user.lastLoginAt = nowIso();
    audit({ tenant, user }, 'login', 'auth', user);
    return { token: user._id };
  }

  const user = db.users.find((u) => u._id === token && u.active);
  if (!user) throw new DemoError(401, 'Autentikasi diperlukan');
  const tenant = user.tenant ? db.tenants.find((t) => t._id === user.tenant) : null;
  if (tenant?.status === 'suspended') throw new DemoError(403, 'Workspace ditangguhkan. Hubungi administrator platform.');
  const ctx = { user, tenant, perms: tenant ? effectivePermissions(tenant) : null };
  const requireRole = (...roles) => {
    if (!hasRole(user, roles)) throw new DemoError(403, 'Akses ditolak untuk peran Anda');
  };

  if (path === '/auth/me') return session(ctx);
  if (path === '/auth/change-password') {
    if (user.password !== body.currentPassword) throw new DemoError(400, 'Password lama salah');
    if (!body.newPassword || body.newPassword.length < 8) throw new DemoError(400, 'Password minimal 8 karakter');
    user.password = body.newPassword;
    return { ok: true };
  }

  // ---- Konsol operator platform ----
  if (parts[0] === 'platform') {
    if (tenant || !user.roles.includes(PLATFORM_ROLE)) throw new DemoError(403, 'Hanya operator platform');
    if (method === 'GET') {
      return {
        items: sortBy(db.tenants, '-createdAt').map(({ permissions, ...t }) => ({
          ...t,
          activeUsers: db.users.filter((u) => u.tenant === t._id && u.active).length,
          incidents: db.incidents.filter((i) => i.tenant === t._id).length,
          grantedModules: grantedModules(t), customModules: !!t.modules?.length, userLimit: userLimit(t),
        })),
      };
    }
    if (method === 'POST') {
      const { tenant: t } = await provisionTenant({
        slug: String(body.slug || '').toLowerCase().trim(), name: body.name, industry: body.industry, plan: body.plan, status: body.status || 'active',
        admin: { name: body.adminName, email: String(body.adminEmail || '').toLowerCase().trim(), password: body.adminPassword },
      });
      audit({ user }, 'create', 'tenants', t, { plan: t.plan });
      return t;
    }
    const t = db.tenants.find((x) => x._id === parts[2]);
    if (!t) throw new DemoError(404, 'Tenant tidak ditemukan');
    if (body.plan !== undefined && !PLAN_KEYS.includes(body.plan)) throw new DemoError(400, 'Paket tidak dikenal');
    if (body.status !== undefined && !['trial', 'active', 'suspended'].includes(body.status)) throw new DemoError(400, 'Status tidak dikenal');
    const before = { plan: t.plan, status: t.status, modules: t.modules || null, maxUsers: t.maxUsers ?? null };
    if (body.plan) t.plan = body.plan;
    if (body.status) t.status = body.status;
    // Grant modul per tenant (override paket) & kuota pengguna
    if (body.modules !== undefined) {
      const mods = Array.isArray(body.modules) ? body.modules.filter((m) => ALL_MODULES.includes(m)) : null;
      if (mods?.length) t.modules = mods;
      else delete t.modules;
    }
    if (body.maxUsers !== undefined) {
      const n = body.maxUsers === null || body.maxUsers === '' ? null : Number(body.maxUsers);
      if (n !== null && (!Number.isInteger(n) || n < 1)) throw new DemoError(400, 'Batas pengguna harus bilangan bulat ≥ 1');
      t.maxUsers = n;
    }
    audit({ user }, 'update', 'tenants', t, diff(before, { ...t, modules: t.modules || null, maxUsers: t.maxUsers ?? null }, ['plan', 'status', 'modules', 'maxUsers']));
    return t;
  }
  if (!tenant) throw new DemoError(403, 'Rute ini hanya untuk pengguna workspace');

  if (path === '/users/roles') return ROLES;
  if (parts[0] === 'users') {
    const mine = db.users.filter((u) => u.tenant === tenant._id);
    if (method === 'GET') {
      let items = mine;
      if (query.active !== 'all') items = items.filter((u) => u.active);
      if (query.role) items = items.filter((u) => u.roles.includes(query.role));
      if (query.q) items = items.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(query.q.toLowerCase()));
      return { items: sortBy(items, 'name').map(fullUser), total: items.length, limit: userLimit(tenant), used: mine.filter((u) => u.active).length };
    }
    requireRole('admin');
    const { name, email, password, roles, department, title, phone, active } = body;
    const validRoles = Array.isArray(roles) ? roles.filter((r) => ROLES[r]) : undefined;
    if (method === 'POST') {
      const max = userLimit(tenant);
      if (max && mine.filter((u) => u.active).length >= max) throw new DemoError(402, `Batas ${max} pengguna aktif untuk workspace ini tercapai. Hubungi operator platform untuk menambah kuota.`);
      if (!password || password.length < 8) throw new DemoError(400, 'Password minimal 8 karakter');
      if (mine.some((u) => u.email === String(email).toLowerCase())) throw new DemoError(409, 'Data duplikat');
      const u = { _id: newId(), tenant: tenant._id, name, email: String(email).toLowerCase(), password, roles: validRoles?.length ? validRoles : ['requester'], department, title, phone, active: true, createdAt: nowIso() };
      db.users.push(u);
      audit(ctx, 'create', 'users', u, { email, roles: u.roles });
      return fullUser(u);
    }
    const target = mine.find((u) => u._id === parts[1]);
    if (!target) throw new DemoError(404, 'User tidak ditemukan');
    const before = clone(target);
    Object.assign(target, Object.fromEntries(Object.entries({ name, email, roles: validRoles, department, title, phone, active }).filter(([, v]) => v !== undefined)));
    if (target._id === user._id && (!target.active || !target.roles.includes('admin'))) {
      Object.assign(target, before);
      throw new DemoError(422, 'Tidak dapat menonaktifkan / mencabut peran admin dari akun sendiri');
    }
    if (password) target.password = password;
    audit(ctx, 'update', 'users', target, diff(before, target, ['name', 'email', 'roles', 'department', 'active']));
    return fullUser(target);
  }

  if (path === '/tenant') {
    if (method === 'GET') return tenant;
    requirePage(ctx, 'settings');
    const before = clone(tenant);
    for (const k of ['name', 'industry', 'enabledFrameworks', 'timezone', 'dataResidency', 'regulatorContact', 'branding']) if (body[k] !== undefined) tenant[k] = body[k];
    if (!industries.some((i) => i.id === tenant.industry)) throw new DemoError(400, 'Industri tidak dikenal');
    if (body.industry && body.industry !== before.industry && body.enabledFrameworks === undefined) tenant.enabledFrameworks = industries.find((i) => i.id === tenant.industry).frameworks;
    audit(ctx, 'update', 'tenant', tenant, diff(before, tenant, Object.keys(body)));
    return tenant;
  }
  if (path === '/tenant/access') {
    requirePage(ctx, 'access');
    if (method === 'PUT') {
      const before = tenant.permissions || {};
      tenant.permissions = sanitizeOverrides(body.overrides || {});
      audit(ctx, 'update_access', 'tenant', tenant, { permissions: { from: before, to: tenant.permissions } });
      return { overrides: tenant.permissions, effective: effectivePermissions(tenant) };
    }
    return { roles: ROLES, defaults: DEFAULT_PERMISSIONS, pages: PAGES, overrides: tenant.permissions || {}, effective: ctx.perms };
  }
  if (path === '/compliance/catalog') return { industries, frameworks: frameworks.map(({ controls, ...f }) => ({ ...f, controlCount: controls.length })) };
  if (path === '/compliance/sync') {
    requireRole('risk_officer', 'security_officer');
    const created = syncControls(tenant._id, tenant.enabledFrameworks, user);
    audit(ctx, 'sync_controls', 'controls', null, { frameworks: tenant.enabledFrameworks, created });
    return { created, frameworks: tenant.enabledFrameworks };
  }
  if (path === '/compliance/summary') {
    requirePage(ctx, 'compliance');
    return complianceSummary(tenant);
  }
  if (path === '/dashboard') {
    if (isRequesterOnly(user)) {
      const mine = (d) => same(d.requester, user) || same(d.createdBy, user);
      const count = (xs) => xs.reduce((a, d) => ({ ...a, [d.status]: (a[d.status] || 0) + 1 }), {});
      return { role: 'requester', incidents: { byStatus: count(tenantItems('incidents', ctx).filter(mine)) }, requests: { byStatus: count(tenantItems('requests', ctx).filter(mine)) } };
    }
    const data = readable(ctx, ['incidents', 'requests', 'problems', 'changes', 'risks', 'assets', 'vendors', 'continuity', 'projects']);
    const names = Object.fromEntries(db.users.map((u) => [u._id, u.name]));
    return { ...computeDashboard(data, { userName: (id) => names[id] }), visible: Object.keys(data) };
  }
  if (path === '/reports') {
    requirePage(ctx, 'reports');
    const days = Math.min(Math.max(Number(query.days) || 30, 7), 365);
    const data = readable(ctx, ['incidents', 'requests', 'changes', 'problems']);
    const svc = Object.fromEntries(tenantItems('services', ctx).map((s) => [s._id, s.name]));
    return computeReports(data, { days, serviceName: (id) => svc[id] });
  }
  if (path === '/kpi') {
    requirePage(ctx, 'kpi');
    const data = readable(ctx, ['incidents', 'changes', 'requests', 'problems', 'budgets', 'invoices', 'payments', 'risks', 'controls', 'findings', 'risk-actions', 'control-tests', 'datacenters', 'racks', 'dc-access', 'continuity', 'bia', 'dr-tests', 'services', 'assets', 'vendors', 'contracts', 'purchase-orders', 'catalog-items', 'requisitions', 'rfqs']);
    return computeKpi(data, { period: Math.min(Math.max(Number(query.months) || 6, 3), 12) });
  }
  if (path === '/my-work') {
    const data = readable(ctx, [...new Set(['incidents', 'requests', 'problems', 'changes', 'backlog', 'risks', 'knowledge', 'risk-actions', 'findings', ...Object.keys(APPROVALS)])]);
    return computeMyWork(data, user, { hasRole, canRead: (n) => !!data[n] });
  }
  if (path === '/search') {
    const q = String(query.q || '').trim().toLowerCase();
    if (q.length < 2) return [];
    const groups = [];
    for (const [name, def] of Object.entries(RESOURCES)) {
      if (!canRead(ctx, name) || !def.search) continue;
      const items = sortBy(scoped(name, ctx).filter((d) => def.search.some((f) => String(d[f] ?? '').toLowerCase().includes(q))), '-updatedAt')
        .slice(0, 5)
        .map(({ _id, number, title, name: n, status, code }) => ({ _id, number, title, name: n, status, code }));
      if (items.length) groups.push({ resource: name, label: def.label, items });
    }
    return groups;
  }
  if (parts[0] === 'notifications') {
    const mine = db.notifications.filter((n) => n.tenant === tenant._id && n.user === user._id);
    if (method === 'GET') return { items: sortBy(mine, '-createdAt').slice(0, 30), unread: mine.filter((n) => !n.read).length };
    if (parts[1] === 'read-all') mine.forEach((n) => { n.read = true; });
    else {
      const n = mine.find((x) => x._id === parts[1]);
      if (n) n.read = true;
    }
    return { ok: true };
  }
  if (path === '/audit-logs') {
    requirePage(ctx, 'audit');
    let items = db.audit.filter((a) => a.tenant === tenant._id);
    for (const k of ['resource', 'action', 'recordNumber', 'recordId']) if (query[k]) items = items.filter((a) => String(a[k]) === query[k]);
    items = sortBy(items, '-at');
    return { items: items.slice(0, Number(query.limit) || 100), total: items.length, page: 1, limit: Number(query.limit) || 100 };
  }
  if (RESOURCES[parts[0]]) return resourceRoute(ctx, parts[0], method, parts.slice(1), body || {}, query);
  throw new DemoError(404, `Endpoint tidak ditemukan: ${method} ${path}`);
}

/** Antarmuka utama: dipanggil oleh client/src/api.js saat mode demo aktif. */
export async function handle(method, path, { body, query = {}, token } = {}) {
  await load();
  const q = Object.fromEntries(Object.entries(query || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, String(v)]));
  try {
    const result = await route(method, path, body || {}, q, token);
    save();
    return result === null ? null : clone(result);
  } catch (err) {
    save();
    throw err;
  }
}

// API internal untuk seed
const api = {
  get db() { return db; },
  newId,
  provisionTenant,
  createRecord,
  performTransition,
  makeStore,
  DEMO_PASSWORD,
};

export { DemoError, DEMO_PASSWORD };
