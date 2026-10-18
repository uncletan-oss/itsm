// Integration test — membutuhkan MongoDB (default mongodb://127.0.0.1:27017). Dilewati bila tidak tersedia.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const request = require('supertest');

const uri = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/itsm_test';

test('API ITSM multi-tenant end-to-end', async (t) => {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
  } catch {
    t.skip('MongoDB tidak tersedia');
    return;
  }
  await mongoose.connection.dropDatabase();
  const { createApp } = require('../src/app');
  const User = require('../src/models/User');
  const Tenant = require('../src/models/Tenant');
  const { provisionTenant } = require('../src/services/provision');
  await Promise.all(mongoose.modelNames().map((m) => mongoose.model(m).syncIndexes()));
  const app = createApp();
  const PW = 'Password123!';

  const { tenant: A } = await provisionTenant({ slug: 'tenant-a', name: 'Bank A', industry: 'banking', plan: 'enterprise', status: 'active', admin: { name: 'Admin A', email: 'admin@a.io', password: PW } });
  const { tenant: B } = await provisionTenant({ slug: 'tenant-b', name: 'RS B', industry: 'healthcare', plan: 'starter', status: 'active', admin: { name: 'Admin B', email: 'admin@b.io', password: PW } });

  const login = async (workspace, email) => (await request(app).post('/api/auth/login').send({ workspace, email, password: PW })).body.token;
  const mk = async (tenant, email, roles) => {
    const u = new User({ tenant: tenant?._id || null, name: email, email, roles });
    await u.setPassword(PW);
    await u.save();
    return login(tenant?.slug || '', email);
  };
  const auth = (tok) => ({ Authorization: `Bearer ${tok}` });
  const adminA = await login('tenant-a', 'admin@a.io');
  const adminB = await login('tenant-b', 'admin@b.io');
  const [agent, cm, cab1, cab2, enduser, tech, risk] = await Promise.all([
    mk(A, 'agent@a.io', ['service_desk', 'technician']),
    mk(A, 'cm@a.io', ['change_manager']),
    mk(A, 'cab1@a.io', ['cab_member']),
    mk(A, 'cab2@a.io', ['cab_member']),
    mk(A, 'user@a.io', ['requester']),
    mk(A, 'tech@a.io', ['technician']),
    mk(A, 'risk@a.io', ['risk_officer']),
  ]);
  const agentB = await mk(B, 'agent@b.io', ['service_desk', 'technician']);
  const platform = await mk(null, 'ops@platform.io', ['platform_admin']);

  await t.test('login butuh workspace yang benar', async () => {
    await request(app).post('/api/auth/login').send({ workspace: 'tenant-b', email: 'admin@a.io', password: PW }).expect(401);
    await request(app).get('/api/incidents').expect(401);
    const me = await request(app).get('/api/auth/me').set(auth(adminA)).expect(200);
    assert.strictEqual(me.body.tenant.slug, 'tenant-a');
    assert.ok(me.body.permissions.incidents.enabled);
  });

  let inc;
  await t.test('incident: nomor per tenant, prioritas & SLA', async () => {
    const res = await request(app).post('/api/incidents').set(auth(enduser)).send({ title: 'Core down', impact: 1, urgency: 1 }).expect(201);
    inc = res.body;
    assert.strictEqual(inc.number, 'INC000001');
    assert.strictEqual(inc.priority, 1);
    assert.ok(inc.sla.resolutionDue);
    const b = await request(app).post('/api/incidents').set(auth(agentB)).send({ title: 'Lain tenant' }).expect(201);
    assert.strictEqual(b.body.number, 'INC000001'); // penomoran independen per tenant
  });

  await t.test('isolasi tenant: data tenant lain tidak terlihat & tidak bisa direferensikan', async () => {
    await request(app).get(`/api/incidents/${inc._id}`).set(auth(agentB)).expect(404);
    await request(app).put(`/api/incidents/${inc._id}`).set(auth(agentB)).send({ title: 'hack' }).expect(404);
    const list = await request(app).get('/api/incidents').set(auth(agentB)).expect(200);
    assert.ok(list.body.items.every((i) => i.title !== 'Core down'));
    const svcA = await request(app).get('/api/services').set(auth(adminA)).expect(200);
    await request(app).post('/api/incidents').set(auth(agentB)).send({ title: 'x', service: svcA.body.items[0]._id }).expect(400);
    await request(app).get('/api/incidents?tenant=' + A._id).set(auth(agentB)).expect(200).then((r) => assert.ok(r.body.items.every((i) => i.title !== 'Core down')));
  });

  await t.test('status tidak bisa diubah lewat PUT; end user tidak bisa edit', async () => {
    await request(app).put(`/api/incidents/${inc._id}`).set(auth(enduser)).send({ title: 'x' }).expect(403);
    const res = await request(app).put(`/api/incidents/${inc._id}`).set(auth(agent)).send({ status: 'closed', category: 'Aplikasi' }).expect(200);
    assert.strictEqual(res.body.status, 'new');
  });

  await t.test('transisi incident + notifikasi + Pekerjaan Saya', async () => {
    const me = (await request(app).get('/api/auth/me').set(auth(tech))).body.user;
    await request(app).post(`/api/incidents/${inc._id}/transition`).set(auth(agent)).send({ to: 'resolved' }).expect(422);
    await request(app).post(`/api/incidents/${inc._id}/transition`).set(auth(agent)).send({ to: 'assigned', assignee: me._id }).expect(200);
    const notif = await request(app).get('/api/notifications').set(auth(tech)).expect(200);
    assert.ok(notif.body.unread >= 1);
    const work = await request(app).get('/api/my-work').set(auth(tech)).expect(200);
    assert.ok(work.body.assigned.some((w) => w._id === inc._id));
    await request(app)
      .post(`/api/incidents/${inc._id}/transition`).set(auth(agent))
      .send({ to: 'resolved', resolutionCode: 'solved_permanent', resolutionNotes: 'Restart service' }).expect(200);
    const res = await request(app).post(`/api/incidents/${inc._id}/transition`).set(auth(enduser)).send({ to: 'closed' }).expect(200);
    assert.strictEqual(res.body.status, 'closed');
  });

  await t.test('work note internal tidak terlihat oleh end user', async () => {
    await request(app).post(`/api/incidents/${inc._id}/comments`).set(auth(agent)).send({ message: 'rahasia internal', type: 'worknote' }).expect(201);
    const res = await request(app).get(`/api/incidents/${inc._id}`).set(auth(enduser)).expect(200);
    assert.ok(!res.body.activities.some((a) => a.message === 'rahasia internal'));
  });

  await t.test('matriks hak akses per peran & override admin tenant', async () => {
    await request(app).get('/api/changes').set(auth(enduser)).expect(403);
    await request(app).get('/api/vendors').set(auth(tech)).expect(403);
    await request(app).get('/api/risks').set(auth(risk)).expect(200);
    await request(app).put('/api/tenant/access').set(auth(agent)).send({ overrides: {} }).expect(403);
    await request(app).put('/api/tenant/access').set(auth(adminA)).send({ overrides: { vendors: { read: ['vendor_manager', 'technician'] } } }).expect(200);
    await request(app).get('/api/vendors').set(auth(tech)).expect(200);
    const me = await request(app).get('/api/auth/me').set(auth(tech)).expect(200);
    assert.ok(me.body.permissions.vendors.read.includes('technician'));
  });

  await t.test('paket langganan membatasi modul', async () => {
    await request(app).get('/api/risks').set(auth(adminB)).expect(403);
    await request(app).get('/api/incidents').set(auth(adminB)).expect(200);
  });

  await t.test('change high-risk butuh 2 approval CAB dengan SoD', async () => {
    let res = await request(app).post('/api/changes').set(auth(agent)).send({
      title: 'Upgrade DB', risk: 'high', implementationPlan: 'a', backoutPlan: 'b', plannedStart: '2030-01-01T00:00:00Z', plannedEnd: '2030-01-01T02:00:00Z',
    }).expect(201);
    const id = res.body._id;
    await request(app).post(`/api/changes/${id}/transition`).set(auth(agent)).send({ to: 'submitted' }).expect(200);
    await request(app).post(`/api/changes/${id}/transition`).set(auth(agent)).send({ to: 'assessment' }).expect(422);
    await request(app).post(`/api/changes/${id}/transition`).set(auth(cm)).send({ to: 'assessment' }).expect(200);
    await request(app).post(`/api/changes/${id}/transition`).set(auth(cm)).send({ to: 'cab_review' }).expect(200);
    const work = await request(app).get('/api/my-work').set(auth(cab1)).expect(200);
    assert.ok(work.body.approvals.some((a) => a._id === id));
    await request(app).post(`/api/changes/${id}/approve`).set(auth(agent)).send({ decision: 'approved' }).expect(403);
    res = await request(app).post(`/api/changes/${id}/approve`).set(auth(cab1)).send({ decision: 'approved' }).expect(200);
    assert.strictEqual(res.body.status, 'cab_review');
    res = await request(app).post(`/api/changes/${id}/approve`).set(auth(cab2)).send({ decision: 'approved' }).expect(200);
    assert.strictEqual(res.body.status, 'approved');
    const rel = await request(app).get(`/api/changes/${id}/related`).set(auth(agent)).expect(200);
    assert.ok(Array.isArray(rel.body));
  });

  await t.test('kepatuhan per tenant (PADK 1/2026 untuk bank)', async () => {
    const sum = await request(app).get('/api/compliance/summary').set(auth(risk)).expect(200);
    assert.ok(sum.body.summary.find((f) => f.id === 'padk1_2026').counts.total > 0);
    await request(app).post('/api/compliance/sync').set(auth(agent)).expect(403);
  });

  await t.test('dashboard, laporan & pencarian', async () => {
    const d = await request(app).get('/api/dashboard').set(auth(agent)).expect(200);
    assert.strictEqual(d.body.role, 'staff');
    const r = await request(app).get('/api/reports?days=30').set(auth(agent)).expect(200);
    assert.strictEqual(r.body.incidentTrend.length, 30);
    await request(app).get('/api/reports').set(auth(enduser)).expect(403);
    const s = await request(app).get('/api/search?q=Core').set(auth(agent)).expect(200);
    assert.ok(s.body.some((g) => g.resource === 'incidents'));
  });

  await t.test('audit log per tenant & immutable', async () => {
    const res = await request(app).get('/api/audit-logs?resource=changes').set(auth(adminA)).expect(200);
    assert.ok(res.body.items.some((a) => a.action === 'approval'));
    const resB = await request(app).get('/api/audit-logs?resource=changes').set(auth(adminB)).expect(200);
    assert.strictEqual(resB.body.total, 0);
    const AuditLog = require('../src/models/AuditLog');
    await assert.rejects(AuditLog.deleteMany({}), /immutable/);
  });

  await t.test('situs publik per tenant tanpa data sensitif', async () => {
    const svc = await request(app).post('/api/services').set(auth(adminA)).send({ name: 'Core Banking', criticality: 'critical' }).expect(201);
    await request(app).post('/api/incidents').set(auth(agent)).send({ title: 'Down total', impact: 1, urgency: 1, service: svc.body._id }).expect(201);
    const st = await request(app).get('/api/public/t/tenant-a/status').expect(200);
    assert.strictEqual(st.body.services.find((s) => s.name === 'Core Banking').status, 'major_outage');
    assert.ok(!JSON.stringify(st.body).includes('Down total'));
    const stB = await request(app).get('/api/public/t/tenant-b/status').expect(200);
    assert.ok(!stB.body.services.some((s) => s.name === 'Core Banking'));
    await request(app).get('/api/public/t/tidak-ada/status').expect(404);
  });

  await t.test('signup SaaS & operator platform', async () => {
    await request(app).post('/api/public/signup').send({ slug: 'tenant-a', organizationName: 'X', adminName: 'X', adminEmail: 'x@x.io', password: PW }).expect(409);
    await request(app).post('/api/public/signup').send({ slug: 'admin', organizationName: 'X', adminName: 'X', adminEmail: 'x@x.io', password: PW }).expect(400);
    const s = await request(app).post('/api/public/signup').send({ slug: 'baru-co', organizationName: 'Baru Co', industry: 'retail', adminName: 'Nina', adminEmail: 'nina@baru.co', password: PW }).expect(201);
    const me = await request(app).get('/api/auth/me').set(auth(s.body.token)).expect(200);
    assert.strictEqual(me.body.tenant.slug, 'baru-co');
    await request(app).get('/api/incidents').set(auth(platform)).expect(403);
    await request(app).get('/api/platform/tenants').set(auth(adminA)).expect(403);
    const list = await request(app).get('/api/platform/tenants').set(auth(platform)).expect(200);
    assert.strictEqual(list.body.items.length, 3);
    await request(app).put(`/api/platform/tenants/${B._id}`).set(auth(platform)).send({ status: 'suspended' }).expect(200);
    await request(app).get('/api/incidents').set(auth(agentB)).expect(403);
    assert.strictEqual((await Tenant.findById(B._id)).status, 'suspended');
  });

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
