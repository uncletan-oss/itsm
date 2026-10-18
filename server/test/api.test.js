// Integration test — membutuhkan MongoDB (default mongodb://127.0.0.1:27017). Dilewati bila tidak tersedia.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const request = require('supertest');

const uri = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/itsm_test';

test('API ITSM end-to-end', async (t) => {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
  } catch {
    t.skip('MongoDB tidak tersedia');
    return;
  }
  await mongoose.connection.dropDatabase();
  const { createApp } = require('../src/app');
  const User = require('../src/models/User');
  const SlaPolicy = require('../src/models/SlaPolicy');
  const app = createApp();

  const mk = async (email, roles) => {
    const u = new User({ name: email, email, roles });
    await u.setPassword('Password123!');
    await u.save();
    const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
    return res.body.token;
  };
  const [admin, agent, cm, cab1, cab2, enduser] = await Promise.all([
    mk('admin@t.io', ['admin']),
    mk('agent@t.io', ['service_desk', 'technician']),
    mk('cm@t.io', ['change_manager']),
    mk('cab1@t.io', ['cab_member']),
    mk('cab2@t.io', ['cab_member']),
    mk('user@t.io', ['requester']),
  ]);
  await SlaPolicy.create({ name: 'P1', appliesTo: 'incident', priority: 1, responseMinutes: 15, resolutionMinutes: 240 });
  const auth = (tok) => ({ Authorization: `Bearer ${tok}` });

  await t.test('menolak request tanpa token', async () => {
    await request(app).get('/api/incidents').expect(401);
  });

  let inc;
  await t.test('end user membuat incident: nomor, prioritas & SLA terhitung', async () => {
    const res = await request(app).post('/api/incidents').set(auth(enduser)).send({ title: 'Core down', impact: 1, urgency: 1 }).expect(201);
    inc = res.body;
    assert.match(inc.number, /^INC\d{6}$/);
    assert.strictEqual(inc.priority, 1);
    assert.ok(inc.sla.resolutionDue);
    assert.strictEqual(inc.status, 'new');
  });

  await t.test('status tidak bisa diubah lewat PUT; end user tidak bisa edit', async () => {
    await request(app).put(`/api/incidents/${inc._id}`).set(auth(enduser)).send({ title: 'x' }).expect(403);
    const res = await request(app).put(`/api/incidents/${inc._id}`).set(auth(agent)).send({ status: 'closed', category: 'Aplikasi' }).expect(200);
    assert.strictEqual(res.body.status, 'new');
    assert.strictEqual(res.body.category, 'Aplikasi');
  });

  await t.test('operator injection pada filter diabaikan', async () => {
    const res = await request(app).get('/api/incidents?status[$ne]=x').set(auth(agent)).expect(200);
    assert.strictEqual(res.body.total, 1);
  });

  await t.test('transisi incident sesuai workflow', async () => {
    const me = (await request(app).get('/api/auth/me').set(auth(agent))).body;
    await request(app).post(`/api/incidents/${inc._id}/transition`).set(auth(agent)).send({ to: 'resolved' }).expect(422);
    let res = await request(app).post(`/api/incidents/${inc._id}/transition`).set(auth(agent)).send({ to: 'assigned', assignee: me._id }).expect(200);
    assert.ok(res.body.sla.respondedAt);
    res = await request(app)
      .post(`/api/incidents/${inc._id}/transition`)
      .set(auth(agent))
      .send({ to: 'resolved', resolutionCode: 'solved_permanent', resolutionNotes: 'Restart service' })
      .expect(200);
    assert.strictEqual(res.body.status, 'resolved');
    // pemohon mengonfirmasi penutupan
    res = await request(app).post(`/api/incidents/${inc._id}/transition`).set(auth(enduser)).send({ to: 'closed' }).expect(200);
    assert.strictEqual(res.body.status, 'closed');
  });

  await t.test('end user hanya melihat tiketnya sendiri', async () => {
    await request(app).post('/api/incidents').set(auth(agent)).send({ title: 'Internal', impact: 3, urgency: 3 }).expect(201);
    const res = await request(app).get('/api/incidents').set(auth(enduser)).expect(200);
    assert.strictEqual(res.body.total, 1);
    await request(app).get('/api/changes').set(auth(enduser)).expect(403);
  });

  await t.test('change high-risk butuh 2 approval CAB dengan segregation of duties', async () => {
    let res = await request(app)
      .post('/api/changes')
      .set(auth(agent))
      .send({
        title: 'Upgrade DB', risk: 'high', implementationPlan: 'a', backoutPlan: 'b',
        plannedStart: '2030-01-01T00:00:00Z', plannedEnd: '2030-01-01T02:00:00Z',
      })
      .expect(201);
    const id = res.body._id;
    await request(app).post(`/api/changes/${id}/transition`).set(auth(agent)).send({ to: 'submitted' }).expect(200);
    await request(app).post(`/api/changes/${id}/transition`).set(auth(agent)).send({ to: 'assessment' }).expect(422);
    await request(app).post(`/api/changes/${id}/transition`).set(auth(cm)).send({ to: 'assessment' }).expect(200);
    await request(app).post(`/api/changes/${id}/transition`).set(auth(cm)).send({ to: 'approved' }).expect(422);
    await request(app).post(`/api/changes/${id}/transition`).set(auth(cm)).send({ to: 'cab_review' }).expect(200);
    await request(app).post(`/api/changes/${id}/approve`).set(auth(agent)).send({ decision: 'approved' }).expect(403);
    res = await request(app).post(`/api/changes/${id}/approve`).set(auth(cab1)).send({ decision: 'approved' }).expect(200);
    assert.strictEqual(res.body.status, 'cab_review');
    await request(app).post(`/api/changes/${id}/approve`).set(auth(cab1)).send({ decision: 'approved' }).expect(409);
    res = await request(app).post(`/api/changes/${id}/approve`).set(auth(cab2)).send({ decision: 'approved' }).expect(200);
    assert.strictEqual(res.body.status, 'approved');
  });

  await t.test('compliance: ganti industri ke perbankan mengaktifkan PADK 1/2026', async () => {
    const s = await request(app).put('/api/settings').set(auth(admin)).send({ industry: 'banking' }).expect(200);
    assert.ok(s.body.enabledFrameworks.includes('padk1_2026'));
    await request(app).post('/api/compliance/sync').set(auth(agent)).expect(403);
    const sync = await request(app).post('/api/compliance/sync').set(auth(admin)).expect(200);
    assert.ok(sync.body.created > 0);
    const again = await request(app).post('/api/compliance/sync').set(auth(admin)).expect(200);
    assert.strictEqual(again.body.created, 0);
    const sum = await request(app).get('/api/compliance/summary').set(auth(agent)).expect(200);
    assert.ok(sum.body.summary.find((f) => f.id === 'padk1_2026').counts.total > 0);
  });

  await t.test('audit log tercatat dan immutable', async () => {
    const res = await request(app).get('/api/audit-logs?resource=changes').set(auth(admin)).expect(200);
    assert.ok(res.body.items.some((a) => a.action === 'approval'));
    await request(app).get('/api/audit-logs').set(auth(agent)).expect(403);
    const AuditLog = require('../src/models/AuditLog');
    await assert.rejects(AuditLog.deleteMany({}), /immutable/);
  });

  await t.test('dashboard', async () => {
    const res = await request(app).get('/api/dashboard').set(auth(agent)).expect(200);
    assert.strictEqual(res.body.role, 'staff');
    const u = await request(app).get('/api/dashboard').set(auth(enduser)).expect(200);
    assert.strictEqual(u.body.role, 'requester');
  });

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
