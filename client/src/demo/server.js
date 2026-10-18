/**
 * Backend demo yang berjalan sepenuhnya di browser (untuk GitHub Pages / tanpa server).
 * Meniru kontrak REST API server/ dan memakai logika bisnis yang sama dari shared/.
 * Data disimpan di localStorage browser masing-masing pengguna.
 */
import { ROLES } from '../../../shared/roles.mjs';
import { checkTransition } from '../../../shared/workflows.mjs';
import { computeDueDates, applyTransition, slaStatus } from '../../../shared/sla.mjs';
import { frameworks, industries } from '../../../shared/frameworks.mjs';
import { RESOURCES, hasRole, isRequesterOnly, same } from './registry.js';
import { seed, DEMO_PASSWORD } from './seed.js';
import { serviceStatuses, publicMaintenance, publicArticle, publicService } from '../../../shared/public.mjs';

const KEY = 'itsm_demo_db_v2';
const NAME_KEYED = ['services', 'configuration-items', 'assets', 'vendors', 'continuity', 'architecture', 'projects', 'sprints', 'sla-policies'];
const ALWAYS_PROTECTED = ['_id', 'number', 'activities', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt', 'sla', '__v', 'allowedTransitions', 'slaStatus'];

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

let db = null;
function load() {
  if (db) return db;
  try {
    db = JSON.parse(localStorage.getItem(KEY));
  } catch {
    db = null;
  }
  if (!db) {
    db = emptyDb();
    seed(api);
    save();
  }
  return db;
}
function emptyDb() {
  return { users: [], counters: {}, audit: [], settings: { _id: 'org', organizationName: 'Organisasi Saya', industry: 'general', enabledFrameworks: [], timezone: 'Asia/Jakarta', dataResidency: 'Indonesia' }, ...Object.fromEntries(Object.keys(RESOURCES).map((k) => [k, []])) };
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    console.warn('Gagal menyimpan data demo', e);
  }
}
export function resetDemo() {
  localStorage.removeItem(KEY);
  db = null;
  load();
}

const nextNumber = (prefix) => {
  db.counters[prefix] = (db.counters[prefix] || 0) + 1;
  return `${prefix}${String(db.counters[prefix]).padStart(6, '0')}`;
};

function audit(user, action, resource, record, changes) {
  db.audit.push({
    _id: newId(), at: new Date().toISOString(), actor: user?._id, actorName: user?.name, action, resource,
    recordId: record?._id, recordNumber: record?.number || record?.name || record?.title, changes, ip: 'browser (demo)',
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

const publicUser = (u) => u && { _id: u._id, name: u.name, email: u.email, department: u.department };
const fullUser = (u) => {
  const { password, ...rest } = u;
  return rest;
};

function sanitize(body, protectedKeys) {
  const out = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (k.startsWith('$') || k.includes('.') || protectedKeys.includes(k)) continue;
    out[k] = v === '' ? undefined : Array.isArray(v) ? v.map(idOf) : idOf(v);
  }
  return out;
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
  const policy = db['sla-policies'].find((p) => p.appliesTo === appliesTo && Number(p.priority) === doc.priority && p.active !== false);
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

function scoped(name, user) {
  const def = RESOURCES[name];
  const fn = def.scope?.(user);
  return fn ? db[name].filter(fn) : db[name];
}

function findDoc(name, id, user) {
  const doc = scoped(name, user).find((d) => d._id === id);
  if (!doc) throw new DemoError(404, `${RESOURCES[name].label} tidak ditemukan`);
  return doc;
}

function can(def, action, user) {
  const roles = def[action] || (action === 'create' ? def.write : action === 'remove' ? [] : def.read);
  if (!hasRole(user, roles)) throw new DemoError(403, `Anda tidak berwenang (${action}) pada ${def.label}`);
}

function performTransition(name, doc, to, note, user) {
  const def = RESOURCES[name];
  const from = doc.status;
  const now = new Date();
  doc.status = to;
  def.workflow.onEnter?.[to]?.(doc, user, now);
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
function createRecord(name, body, user, { skipAuth = false, overrides = {} } = {}) {
  const def = RESOURCES[name];
  if (!skipAuth) can(def, 'create', user);
  const protectedKeys = [...ALWAYS_PROTECTED, ...(def.protected || []), ...(def.workflow ? ['status'] : [])];
  const titleKey = NAME_KEYED.includes(name) ? 'name' : 'title';
  const data = skipAuth ? { ...body } : sanitize(body, protectedKeys);
  const now = new Date().toISOString();
  const doc = { ...clone(def.defaults || {}), ...data, ...overrides, _id: newId(), activities: [], createdBy: user._id, updatedBy: user._id, createdAt: data.createdAt || now, updatedAt: now };
  if (def.initial && !doc.status) doc.status = def.initial;
  if (!doc[titleKey]) throw new DemoError(400, 'Validasi gagal', { [titleKey]: `${titleKey === 'name' ? 'Nama' : 'Judul'} wajib diisi` });
  for (const [k, msg] of Object.entries(def.required || {})) if (!doc[k]) throw new DemoError(400, 'Validasi gagal', { [k]: msg });
  def.beforeCreate?.(doc, user, db);
  def.beforeSave?.(doc, user, true);
  if (def.sla) applySla(doc, def.sla, true);
  if (def.prefix) doc.number = nextNumber(def.prefix);
  if (!def.noActivity) doc.activities.push({ _id: newId(), type: 'system', message: `${def.label} dibuat`, by: user._id, byName: user.name, at: now });
  const stored = clone(doc);
  db[name].push(stored);
  audit(user, 'create', name, stored);
  return stored;
}

function resourceRoute(name, method, rest, body, query, user) {
  const def = RESOURCES[name];
  const canWrite = hasRole(user, def.write);
  const protectedKeys = [...ALWAYS_PROTECTED, ...(def.protected || []), ...(def.workflow ? ['status'] : [])];
  const [id, action] = rest;

  if (!id && method === 'GET') {
    can(def, 'read', user);
    const { q, page = 1, limit = 25, sort, ...filters } = query;
    let items = scoped(name, user);
    for (const [k, v] of Object.entries(filters)) {
      if (typeof v !== 'string' || v === '') continue;
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
  if (!id && method === 'POST') return populate(name, createRecord(name, body, user), canWrite);

  const doc = findDoc(name, id, user);
  if (!action && method === 'GET') {
    can(def, 'read', user);
    return populate(name, doc, canWrite);
  }
  if (!action && method === 'PUT') {
    can(def, 'write', user);
    const before = clone(doc);
    const updates = sanitize(body, protectedKeys);
    Object.assign(doc, updates);
    for (const [k, v] of Object.entries(updates)) if (v === undefined) delete doc[k];
    const prevPriority = before.priority;
    def.beforeSave?.(doc, user, false);
    if (def.sla) applySla(doc, def.sla, doc.priority !== prevPriority);
    doc.updatedBy = user._id;
    doc.updatedAt = new Date().toISOString();
    Object.assign(doc, clone(doc));
    const changes = diff(before, doc, [...Object.keys(updates), 'priority']);
    if (Object.keys(changes).length) audit(user, 'update', name, doc, changes);
    return populate(name, doc, canWrite);
  }
  if (!action && method === 'DELETE') {
    can(def, 'remove', user);
    db[name] = db[name].filter((d) => d._id !== id);
    audit(user, 'delete', name, doc, { snapshot: doc });
    return null;
  }
  if (action === 'comments' && method === 'POST') {
    can(def, 'read', user);
    const message = String(body.message || '').trim();
    if (!message) throw new DemoError(400, 'Pesan wajib diisi');
    const type = body.type === 'worknote' && canWrite ? 'worknote' : 'comment';
    doc.activities.push({ _id: newId(), type, message, by: user._id, byName: user.name, at: new Date().toISOString() });
    return populate(name, doc, canWrite);
  }
  if (action === 'transition' && method === 'POST' && def.workflow) {
    can(def, 'read', user);
    const { to, note, ...fields } = body || {};
    if (!(canWrite || def.canTransition?.(user, doc, to))) throw new DemoError(403, 'Anda tidak berwenang mengubah status');
    const before = clone(doc);
    const updates = sanitize(fields, protectedKeys);
    const draft = { ...clone(doc), ...(canWrite ? updates : {}) };
    const err = checkTransition(def.workflow, draft, to, user);
    if (err) throw new DemoError(422, err);
    if (canWrite) Object.assign(doc, updates);
    performTransition(name, doc, to, note, user);
    audit(user, 'transition', name, doc, { status: { from: before.status, to }, ...diff(before, doc, Object.keys(updates)) });
    return populate(name, doc, canWrite);
  }
  if (name === 'changes' && action === 'approve' && method === 'POST') {
    if (!hasRole(user, ['cab_member', 'change_manager'])) throw new DemoError(403, 'Hanya anggota CAB / Change Manager');
    if (doc.status !== 'cab_review') throw new DemoError(422, 'Change tidak sedang dalam CAB review');
    if ([doc.requester, doc.createdBy, doc.assignee].some((u) => u && u === user._id))
      throw new DemoError(422, 'Segregation of duties: pemohon/implementer tidak boleh menyetujui change ini');
    if (doc.approvals.some((a) => a.approver === user._id)) throw new DemoError(409, 'Anda sudah memberikan keputusan');
    const decision = body.decision === 'rejected' ? 'rejected' : 'approved';
    doc.approvals.push({ _id: newId(), approver: user._id, approverName: user.name, decision, comment: body.comment, at: new Date().toISOString() });
    const approved = doc.approvals.filter((a) => a.decision === 'approved').length;
    const to = decision === 'rejected' ? 'rejected' : approved >= (doc.requiredApprovals || 1) ? 'approved' : null;
    if (to) {
      const err = checkTransition(def.workflow, doc, to, user, { viaApproval: true });
      if (err) throw new DemoError(422, err);
      performTransition(name, doc, to, `CAB: ${body.comment || decision}`, user);
    } else {
      doc.activities.push({ _id: newId(), type: 'system', message: `CAB approval ${approved}/${doc.requiredApprovals} oleh ${user.name}`, by: user._id, byName: user.name, at: new Date().toISOString() });
    }
    audit(user, 'approval', name, doc, { decision, comment: body.comment });
    return populate(name, doc, canWrite);
  }
  throw new DemoError(404, `Endpoint tidak ditemukan: ${method} ${name}/${rest.join('/')}`);
}

// ---------- Compliance & dashboard ----------
export function syncControls(frameworkIds, user) {
  let created = 0;
  for (const fw of frameworks.filter((f) => frameworkIds.includes(f.id))) {
    for (const ctl of fw.controls) {
      const existing = db.controls.find((c) => c.frameworkId === fw.id && c.code === ctl.code);
      const meta = { frameworkName: fw.name, title: ctl.title, domain: ctl.domain, nistFunction: ctl.nistFunction, guidance: ctl.guidance };
      if (existing) Object.assign(existing, meta);
      else {
        db.controls.push({ _id: newId(), frameworkId: fw.id, code: ctl.code, ...meta, status: 'not_assessed', activities: [], createdBy: user._id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        created += 1;
      }
    }
  }
  return created;
}

function complianceSummary() {
  const s = db.settings;
  return {
    industry: s.industry,
    summary: s.enabledFrameworks.map((id) => {
      const fw = frameworks.find((f) => f.id === id);
      const counts = { total: 0 };
      for (const c of db.controls.filter((x) => x.frameworkId === id)) {
        counts[c.status] = (counts[c.status] || 0) + 1;
        counts.total += 1;
      }
      const applicable = counts.total - (counts.not_applicable || 0);
      const score = applicable ? Math.round((((counts.implemented || 0) + (counts.partial || 0) * 0.5) / applicable) * 100) : 0;
      return { id, name: fw?.name, type: fw?.type, issuer: fw?.issuer, note: fw?.note, counts, score };
    }),
  };
}

const countBy = (items, field) => items.reduce((acc, d) => ({ ...acc, [d[field] ?? 'none']: (acc[d[field] ?? 'none'] || 0) + 1 }), {});
const OPEN_INC = ['new', 'assigned', 'in_progress', 'pending'];

function dashboard(user) {
  const now = new Date();
  const t = (v) => (v ? new Date(v).getTime() : null);
  const in30 = now.getTime() + 30 * 864e5;
  if (isRequesterOnly(user)) {
    const mine = (d) => same(d.requester, user) || same(d.createdBy, user);
    return { role: 'requester', incidents: { byStatus: countBy(db.incidents.filter(mine), 'status') }, requests: { byStatus: countBy(db.requests.filter(mine), 'status') } };
  }
  const openInc = db.incidents.filter((i) => OPEN_INC.includes(i.status));
  const resolved30 = db.incidents.filter((i) => t(i.sla?.resolvedAt) >= now.getTime() - 30 * 864e5);
  const between = (v, end) => v && t(v) >= now.getTime() && t(v) <= end;
  return {
    role: 'staff',
    incidents: {
      byStatus: countBy(db.incidents, 'status'),
      openByPriority: countBy(openInc, 'priority'),
      openBreached: openInc.filter((i) => i.sla?.resolutionDue && !i.sla.pausedAt && t(i.sla.resolutionDue) < now.getTime()).length,
      majorOpen: openInc.filter((i) => i.majorIncident).length,
      regulatoryPending: db.incidents.filter((i) => i.regulatoryReportable && !i.regulatorReportedAt && i.status !== 'cancelled').length,
      slaCompliance30d: resolved30.length ? Math.round((resolved30.filter((i) => !i.sla.resolutionBreached).length / resolved30.length) * 100) : null,
      resolved30d: resolved30.length,
      recent: sortBy(openInc, 'priority -createdAt').slice(0, 8).map((i) => populate('incidents', i)),
    },
    requests: { byStatus: countBy(db.requests, 'status') },
    problems: { byStatus: countBy(db.problems, 'status') },
    changes: {
      byStatus: countBy(db.changes, 'status'),
      upcoming: sortBy(db.changes.filter((c) => ['approved', 'scheduled'].includes(c.status) && t(c.plannedStart) >= now.getTime()), 'plannedStart').slice(0, 5),
    },
    risks: { openByLevel: countBy(db.risks.filter((r) => r.status !== 'closed'), 'inherentLevel') },
    assets: {
      byStatus: countBy(db.assets, 'status'),
      licensesExpiring30d: db.assets.filter((a) => between(a.licenseExpiry, in30)).length,
      warrantyExpiring30d: db.assets.filter((a) => between(a.warrantyEnd, in30)).length,
    },
    vendors: {
      contractsEnding90d: db.vendors.filter((v) => v.status === 'active' && between(v.contractEnd, now.getTime() + 90 * 864e5)).length,
      critical: db.vendors.filter((v) => v.criticality === 'critical' && v.status === 'active').length,
    },
    continuity: { testOverdue: db.continuity.filter((c) => c.status !== 'retired' && (!c.lastTestDate || t(c.nextTestDate) < now.getTime())).length },
    projects: { byHealth: countBy(db.projects.filter((p) => !['closed', 'cancelled'].includes(p.status)), 'health') },
    canSeeAudit: hasRole(user, ['auditor', 'risk_officer', 'security_officer']),
  };
}

// ---------- Endpoint publik (tanpa login) ----------
function publicRoute([what, id], query) {
  const kb = db.knowledge.filter((a) => a.status === 'published' && a.audience === 'public');
  if (what === 'info') return { organizationName: db.settings.organizationName, industry: db.settings.industry, enabledFrameworks: db.settings.enabledFrameworks };
  if (what === 'status') {
    const services = sortBy(db.services.filter((s) => s.status === 'live' && s.type !== 'supporting'), 'name');
    return { services: serviceStatuses(services, db.incidents, db.changes), maintenance: publicMaintenance(db.changes, services), updatedAt: new Date().toISOString() };
  }
  if (what === 'knowledge' && id) {
    const a = kb.find((x) => x._id === id);
    if (!a) throw new DemoError(404, 'Artikel tidak ditemukan');
    a.views = (a.views || 0) + 1;
    return publicArticle(a, true);
  }
  if (what === 'knowledge') {
    const q = (query.q || '').toLowerCase();
    const hit = (a) => !q || [a.title, a.content, a.category, ...(a.tags || [])].some((v) => String(v || '').toLowerCase().includes(q));
    return { items: sortBy(kb.filter(hit), '-publishedAt').map((a) => publicArticle(a)) };
  }
  if (what === 'catalog') return { items: sortBy(db.services.filter((s) => s.status === 'live' && s.requestable), 'requestCategory name').map(publicService) };
  throw new DemoError(404, 'Endpoint publik tidak ditemukan');
}

// ---------- Router ----------
function route(method, path, body, query, token) {
  const parts = path.split('/').filter(Boolean);
  if (path === '/health') return { status: 'ok', mode: 'demo' };
  if (parts[0] === 'public') return publicRoute(parts.slice(1), query);
  if (path === '/auth/login' && method === 'POST') {
    const email = String(body.email || '').toLowerCase().trim();
    const user = db.users.find((u) => u.email === email);
    if (!user || !user.active || user.password !== String(body.password || '')) {
      audit(user, 'login_failed', 'auth', null, { email });
      throw new DemoError(401, 'Email atau password salah');
    }
    user.lastLoginAt = new Date().toISOString();
    audit(user, 'login', 'auth', user);
    return { token: user._id, user: fullUser(user) };
  }
  const user = db.users.find((u) => u._id === token && u.active);
  if (!user) throw new DemoError(401, 'Autentikasi diperlukan');
  const requireRole = (...roles) => {
    if (!hasRole(user, roles)) throw new DemoError(403, 'Akses ditolak untuk peran Anda');
  };

  if (path === '/auth/me') return fullUser(user);
  if (path === '/auth/change-password') {
    if (user.password !== body.currentPassword) throw new DemoError(400, 'Password lama salah');
    if (!body.newPassword || body.newPassword.length < 8) throw new DemoError(400, 'Password minimal 8 karakter');
    user.password = body.newPassword;
    return { ok: true };
  }
  if (path === '/users/roles') return ROLES;
  if (parts[0] === 'users') {
    if (method === 'GET') {
      let items = db.users;
      if (query.active !== 'all') items = items.filter((u) => u.active);
      if (query.role) items = items.filter((u) => u.roles.includes(query.role));
      if (query.q) items = items.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(query.q.toLowerCase()));
      return { items: sortBy(items, 'name').map(fullUser), total: items.length };
    }
    requireRole('admin');
    const { name, email, password, roles, department, title, phone, active } = body;
    if (method === 'POST') {
      if (!password || password.length < 8) throw new DemoError(400, 'Password minimal 8 karakter');
      if (db.users.some((u) => u.email === String(email).toLowerCase())) throw new DemoError(409, 'Data duplikat');
      const u = { _id: newId(), name, email: String(email).toLowerCase(), password, roles: roles?.length ? roles : ['requester'], department, title, phone, active: true, createdAt: new Date().toISOString() };
      db.users.push(u);
      audit(user, 'create', 'users', u, { email, roles });
      return fullUser(u);
    }
    const target = db.users.find((u) => u._id === parts[1]);
    if (!target) throw new DemoError(404, 'User tidak ditemukan');
    const before = clone(target);
    Object.assign(target, Object.fromEntries(Object.entries({ name, email, roles, department, title, phone, active }).filter(([, v]) => v !== undefined)));
    if (target._id === user._id && (!target.active || !target.roles.includes('admin'))) {
      Object.assign(target, before);
      throw new DemoError(422, 'Tidak dapat menonaktifkan / mencabut peran admin dari akun sendiri');
    }
    if (password) target.password = password;
    audit(user, 'update', 'users', target, diff(before, target, ['name', 'email', 'roles', 'department', 'active']));
    return fullUser(target);
  }
  if (path === '/settings') {
    if (method === 'GET') return db.settings;
    requireRole('admin');
    const before = clone(db.settings);
    for (const k of ['organizationName', 'industry', 'enabledFrameworks', 'timezone', 'dataResidency', 'businessHours', 'regulatorContact'])
      if (body[k] !== undefined) db.settings[k] = body[k];
    if (!industries.some((i) => i.id === db.settings.industry)) throw new DemoError(400, 'Industri tidak dikenal');
    if (body.industry && body.industry !== before.industry && body.enabledFrameworks === undefined)
      db.settings.enabledFrameworks = industries.find((i) => i.id === db.settings.industry).frameworks;
    audit(user, 'update', 'settings', { number: 'org' }, diff(before, db.settings, Object.keys(body)));
    return db.settings;
  }
  if (path === '/compliance/catalog') return { industries, frameworks: frameworks.map(({ controls, ...f }) => ({ ...f, controlCount: controls.length })) };
  if (path === '/compliance/sync') {
    requireRole('risk_officer', 'security_officer');
    const created = syncControls(db.settings.enabledFrameworks, user);
    audit(user, 'sync_controls', 'controls', null, { frameworks: db.settings.enabledFrameworks, created });
    return { created, frameworks: db.settings.enabledFrameworks };
  }
  if (path === '/compliance/summary') return complianceSummary();
  if (path === '/dashboard') return dashboard(user);
  if (path === '/audit-logs') {
    requireRole('auditor', 'risk_officer', 'security_officer');
    let items = db.audit;
    for (const k of ['resource', 'action', 'recordNumber', 'recordId']) if (query[k]) items = items.filter((a) => String(a[k]) === query[k]);
    items = sortBy(items, '-at');
    return { items: items.slice(0, Number(query.limit) || 100), total: items.length, page: 1, limit: Number(query.limit) || 100 };
  }
  if (RESOURCES[parts[0]]) return resourceRoute(parts[0], method, parts.slice(1), body || {}, query, user);
  throw new DemoError(404, `Endpoint tidak ditemukan: ${method} ${path}`);
}

/** Antarmuka utama: dipanggil oleh client/src/api.js saat mode demo aktif. */
export async function handle(method, path, { body, query = {}, token } = {}) {
  load();
  const q = Object.fromEntries(Object.entries(query || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, String(v)]));
  try {
    const result = route(method, path, body || {}, q, token);
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
  createRecord,
  syncControls,
  performTransition: (name, doc, to, user) => performTransition(name, doc, to, undefined, user),
  DEMO_PASSWORD,
};

export { DemoError, DEMO_PASSWORD };
