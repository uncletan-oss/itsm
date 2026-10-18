// Integration test alur end-to-end modul lanjutan — membutuhkan MongoDB; dilewati bila tidak tersedia.
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const request = require('supertest');

const uri = (process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/itsm_test') + '_flows';

test('Alur end-to-end: procure-to-pay, GRC assurance, BCM, DCIM, persetujuan & grant modul', async (t) => {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
  } catch {
    t.skip('MongoDB tidak tersedia');
    return;
  }
  await mongoose.connection.dropDatabase();
  const { createApp } = require('../src/app');
  const User = require('../src/models/User');
  const { provisionTenant } = require('../src/services/provision');
  await Promise.all(mongoose.modelNames().map((m) => mongoose.model(m).syncIndexes()));
  const app = createApp();
  const PW = 'Password123!';
  const { tenant: T } = await provisionTenant({ slug: 'bank-x', name: 'Bank X', industry: 'banking', plan: 'enterprise', status: 'active', admin: { name: 'Admin', email: 'admin@x.io', password: PW } });
  const { tenant: S } = await provisionTenant({ slug: 'small-x', name: 'Small X', industry: 'general', plan: 'starter', status: 'active', admin: { name: 'Admin S', email: 'admin@s.io', password: PW } });
  const login = async (ws, email) => (await request(app).post('/api/auth/login').send({ workspace: ws, email, password: PW })).body.token;
  const mk = async (tenant, email, roles) => {
    const u = new User({ tenant: tenant?._id || null, name: email.split('@')[0], email, roles });
    await u.setPassword(PW);
    await u.save();
    return { token: await login(tenant?.slug || '', email), id: String(u._id) };
  };
  const A = (x) => ({ Authorization: `Bearer ${x.token || x}` });
  const [fin, exec, proc, acct, treas, pm, risk, aud, owner, bcm, dc, tech] = await Promise.all([
    mk(T, 'fin@x.io', ['finance_manager']), mk(T, 'exec@x.io', ['executive']), mk(T, 'proc@x.io', ['vendor_manager']),
    mk(T, 'acct@x.io', ['accountant']), mk(T, 'treas@x.io', ['treasurer']), mk(T, 'pm@x.io', ['project_manager']),
    mk(T, 'risk@x.io', ['risk_officer']), mk(T, 'aud@x.io', ['auditor']), mk(T, 'owner@x.io', ['technician']),
    mk(T, 'bcm@x.io', ['bcm_manager']), mk(T, 'dc@x.io', ['dc_manager']), mk(T, 'tech@x.io', ['technician']),
  ]);
  const ops = await mk(null, 'ops@p.io', ['platform_admin']);
  const go = (who, id, to, extra = {}) => request(app).post(`/api/${id[0]}/${id[1]}/transition`).set(A(who)).send({ to, ...extra });
  const approve = (who, res, id, decision = 'approved') => request(app).post(`/api/${res}/${id}/approve`).set(A(who)).send({ decision, comment: 'ok' });

  let vendor, budget, po, inv, pay;
  await t.test('vendor onboarding: due diligence → persetujuan berjenjang → aktif', async () => {
    vendor = (await request(app).post('/api/vendors').set(A(proc)).send({ name: 'PT Vendor', criticality: 'critical', dataLocation: 'Indonesia' }).expect(201)).body;
    assert.strictEqual(vendor.status, 'prospect');
    await go(proc, ['vendors', vendor._id], 'due_diligence').expect(200);
    await go(proc, ['vendors', vendor._id], 'pending_approval').expect(422); // data due diligence belum lengkap
    await go(proc, ['vendors', vendor._id], 'pending_approval', { dueDiligenceDate: '2026-01-01', dueDiligenceResult: 'passed', riskRating: 'medium', exitStrategy: 'Exit 90 hari' }).expect(200);
    await approve(proc, 'vendors', vendor._id).expect(403); // SoD: pembuat
    const v2 = await mk(T, 'proc2@x.io', ['vendor_manager']);
    let r = await approve(v2, 'vendors', vendor._id).expect(200);
    assert.strictEqual(r.body.status, 'pending_approval');
    await approve(v2, 'vendors', vendor._id).expect(403); // sudah memutuskan
    await approve(risk, 'vendors', vendor._id).expect(200);
    const ciso = await mk(T, 'ciso@x.io', ['security_officer']);
    r = await approve(ciso, 'vendors', vendor._id).expect(200); // vendor kritikal → CISO
    assert.strictEqual(r.body.status, 'active');
  });

  await t.test('anggaran disahkan Controller & CIO', async () => {
    budget = (await request(app).post('/api/budgets').set(A(fin)).send({ name: 'Infra', fiscalYear: 2026, category: 'capex', amount: 1000000000, owner: fin.id, justification: 'RKA' }).expect(201)).body;
    await go(fin, ['budgets', budget._id], 'pending_approval').expect(200);
    await approve(fin, 'budgets', budget._id).expect(403); // pembuat
    const fin2 = await mk(T, 'fin2@x.io', ['finance_manager']);
    await approve(fin2, 'budgets', budget._id).expect(200);
    const r = await approve(exec, 'budgets', budget._id).expect(200);
    assert.strictEqual(r.body.status, 'active');
  });

  await t.test('PO: kontrol anggaran & persetujuan sesuai nilai', async () => {
    const tooBig = (await request(app).post('/api/purchase-orders').set(A(pm)).send({ title: 'Terlalu besar', vendor: vendor._id, budget: budget._id, justification: 'x', items: [{ description: 'Server', qty: 3, unitPrice: 400000000 }] }).expect(201)).body;
    assert.strictEqual(tooBig.subtotal, 1200000000);
    const r0 = await go(pm, ['purchase-orders', tooBig._id], 'pending_approval').expect(422);
    assert.match(r0.body.error, /anggaran/);
    po = (await request(app).post('/api/purchase-orders').set(A(pm)).send({ title: 'Server DB', vendor: vendor._id, budget: budget._id, justification: 'x', items: [{ description: 'Server', qty: 2, unitPrice: 300000000 }] }).expect(201)).body;
    assert.strictEqual(po.total, 666000000); // + PPN 11%
    await go(pm, ['purchase-orders', po._id], 'pending_approval').expect(200);
    await approve(proc, 'purchase-orders', po._id).expect(200);
    await approve(fin, 'purchase-orders', po._id).expect(200);
    let r = await request(app).get(`/api/purchase-orders/${po._id}`).set(A(pm)).expect(200);
    assert.strictEqual(r.body.status, 'pending_approval'); // ≥ 500 jt → perlu CIO
    r = await approve(exec, 'purchase-orders', po._id).expect(200);
    assert.strictEqual(r.body.status, 'approved');
    const b = await request(app).get(`/api/budgets/${budget._id}`).set(A(fin)).expect(200);
    assert.strictEqual(b.body.committedAmount, 600000000);
    await go(pm, ['purchase-orders', po._id], 'ordered').expect(200);
  });

  await t.test('tagihan: 3-way match, persetujuan, jurnal otomatis', async () => {
    const pre = await request(app).get(`/api/purchase-orders/${po._id}/spawn/invoices`).set(A(acct)).expect(200);
    assert.strictEqual(pre.body.purchaseOrder, po._id);
    inv = (await request(app).post('/api/invoices').set(A(acct)).send({ ...pre.body, vendorInvoiceNo: 'V-001' }).expect(201)).body;
    let r = await go(acct, ['invoices', inv._id], 'verified', { dueDate: '2026-12-31' }).expect(422);
    assert.match(r.body.error, /belum diterima/);
    await go(pm, ['purchase-orders', po._id], 'received', { receivedDate: '2026-10-01', receivedNotes: 'BAST' }).expect(200);
    r = await go(acct, ['invoices', inv._id], 'verified', { dueDate: '2026-12-31' }).expect(200);
    assert.match(r.body.matchResult, /Cocok/);
    await go(acct, ['invoices', inv._id], 'paid').expect(422); // hanya lewat pembayaran
    await go(acct, ['invoices', inv._id], 'pending_approval').expect(200);
    const acct2 = await mk(T, 'acct2@x.io', ['accountant']);
    await approve(acct2, 'invoices', inv._id).expect(200);
    r = await approve(fin, 'invoices', inv._id).expect(200);
    assert.strictEqual(r.body.status, 'approved');
    const j = await request(app).get('/api/journals?source=invoice').set(A(acct)).expect(200);
    assert.strictEqual(j.body.total, 1);
    assert.strictEqual(j.body.items[0].totalDebit, j.body.items[0].totalCredit);
    const b = await request(app).get(`/api/budgets/${budget._id}`).set(A(fin)).expect(200);
    assert.strictEqual(b.body.actualAmount, 600000000);
  });

  await t.test('pembayaran maker-checker → eksekusi treasury → tagihan lunas', async () => {
    pay = (await request(app).post('/api/payments').set(A(acct)).send({ invoice: inv._id, amount: inv.total + 1, paymentDate: '2026-10-10' }).expect(201)).body;
    await go(acct, ['payments', pay._id], 'pending_approval').expect(422); // melebihi tagihan
    await request(app).put(`/api/payments/${pay._id}`).set(A(acct)).send({ amount: inv.total }).expect(200);
    await go(acct, ['payments', pay._id], 'pending_approval').expect(200);
    await approve(acct, 'payments', pay._id).expect(403);
    await approve(treas, 'payments', pay._id).expect(200);
    let r = await approve(fin, 'payments', pay._id).expect(200);
    assert.strictEqual(r.body.status, 'approved');
    await go(acct, ['payments', pay._id], 'executed', { reference: 'TRX1' }).expect(422); // hanya treasury
    await go(treas, ['payments', pay._id], 'executed', { reference: 'TRX1' }).expect(200);
    r = await request(app).get(`/api/invoices/${inv._id}`).set(A(acct)).expect(200);
    assert.strictEqual(r.body.status, 'paid');
    const j = await request(app).get('/api/journals?source=payment').set(A(acct)).expect(200);
    assert.strictEqual(j.body.total, 1);
  });

  await t.test('assurance: uji kontrol → review independen → status kontrol & temuan otomatis', async () => {
    const ctl = (await request(app).get('/api/controls?code=A.8.8').set(A(risk)).expect(200)).body.items[0];
    const ct = (await request(app).post('/api/control-tests').set(A(aud)).send({ title: 'Uji patch', control: ctl._id }).expect(201)).body;
    const s1 = await go(aud, ['control-tests', ct._id], 'in_progress', { tester: aud.id, procedure: 'sampel 20' });
    assert.strictEqual(s1.status, 200, s1.body.error);
    const s2 = await go(aud, ['control-tests', ct._id], 'pending_approval', { results: '5 terlambat', conclusion: 'ineffective' });
    assert.strictEqual(s2.status, 200, s2.body.error);
    await approve(aud, 'control-tests', ct._id).expect(403); // penguji ≠ reviewer
    const r = await approve(risk, 'control-tests', ct._id).expect(200);
    assert.strictEqual(r.body.status, 'concluded');
    const c = await request(app).get(`/api/controls/${ctl._id}`).set(A(risk)).expect(200);
    assert.strictEqual(c.body.status, 'not_implemented');
    const f = (await request(app).get('/api/findings?source=control_test').set(A(aud)).expect(200)).body.items[0];
    assert.ok(f);
    // temuan: pemilik remediasi → validasi auditor (SoD)
    const ap = await go(aud, ['findings', f._id], 'action_plan', { owner: owner.id, managementResponse: 'Setuju', actionPlan: 'Patch', dueDate: '2026-12-01' });
    assert.strictEqual(ap.status, 200, ap.body.error);
    const ir = await go(owner, ['findings', f._id], 'in_remediation');
    assert.strictEqual(ir.status, 200, ir.body.error);
    const pv = await go(owner, ['findings', f._id], 'pending_approval', { remediationEvidence: 'Laporan scan bersih' });
    assert.strictEqual(pv.status, 200, pv.body.error);
    const done = await approve(aud, 'findings', f._id).expect(200);
    assert.strictEqual(done.body.status, 'closed');
  });

  await t.test('risk acceptance: pemilik risiko (penyetuju yang ditunjuk) → risk officer', async () => {
    const r = (await request(app).post('/api/risks').set(A(risk)).send({ title: 'Risiko diterima', owner: owner.id, likelihood: 2, impact: 2 }).expect(201)).body;
    await go(risk, ['risks', r._id], 'assessed').expect(200);
    await go(risk, ['risks', r._id], 'pending_approval', { treatment: 'mitigate' }).expect(422);
    await go(risk, ['risks', r._id], 'pending_approval', { treatment: 'accept', acceptanceRationale: 'Dampak kecil', reviewDate: '2027-01-01' }).expect(200);
    await approve(risk, 'risks', r._id).expect(403); // tahap 1 milik pemilik risiko
    await approve(owner, 'risks', r._id).expect(200); // technician tanpa akses modul, tetapi penyetuju yang ditunjuk
    const fin2 = await approve(risk, 'risks', r._id).expect(200);
    assert.strictEqual(fin2.body.status, 'monitoring');
  });

  await t.test('BCM: uji DR → rencana diperbarui & temuan bila RTO terlampaui', async () => {
    const plan = (await request(app).post('/api/continuity').set(A(bcm)).send({ name: 'DRP Core', rtoHours: 2, rpoHours: 1, owner: bcm.id, description: 'Prosedur' }).expect(201)).body;
    const pre = (await request(app).get(`/api/continuity/${plan._id}/spawn/dr-tests`).set(A(bcm)).expect(200)).body;
    const dt = (await request(app).post('/api/dr-tests').set(A(bcm)).send({ ...pre, testType: 'simulation' }).expect(201)).body;
    assert.strictEqual(dt.targetRtoHours, 2);
    await go(bcm, ['dr-tests', dt._id], 'pending_approval', { scenario: 'DC down', scheduledDate: '2026-11-01T00:00:00Z', coordinator: bcm.id }).expect(200);
    const bcm2 = await mk(T, 'bcm2@x.io', ['bcm_manager']);
    await approve(bcm2, 'dr-tests', dt._id).expect(200);
    await go(bcm, ['dr-tests', dt._id], 'executed', { actualRtoHours: 3, actualRpoHours: 0.5, result: 'success' }).expect(200);
    await go(bcm, ['dr-tests', dt._id], 'reported', { lessonsLearned: 'Percepat DNS failover' }).expect(200);
    const p = (await request(app).get(`/api/continuity/${plan._id}`).set(A(bcm)).expect(200)).body;
    assert.strictEqual(p.lastTestResult, 'success');
    const f = await request(app).get('/api/findings?source=dr_test').set(A(aud)).expect(200);
    assert.strictEqual(f.body.total, 1); // RTO 3 > target 2
  });

  await t.test('DCIM: utilisasi data center dari rak & akses DC dengan persetujuan', async () => {
    const d = (await request(app).post('/api/datacenters').set(A(dc)).send({ name: 'DC A', powerCapacityKw: 20 }).expect(201)).body;
    await request(app).post('/api/racks').set(A(dc)).send({ name: 'R1', datacenter: d._id, totalUnits: 42, usedUnits: 21, powerCapacityKw: 8, powerUsedKw: 5 }).expect(201);
    const after = (await request(app).get(`/api/datacenters/${d._id}`).set(A(dc)).expect(200)).body;
    assert.strictEqual(after.rackUnitsUsed, 21);
    assert.strictEqual(after.powerUsedKw, 5);
    const acc = (await request(app).post('/api/dc-access').set(A(tech)).send({ title: 'Ganti disk', datacenter: d._id, visitorName: 'Tech', plannedStart: '2026-11-01T01:00:00Z', plannedEnd: '2026-11-01T03:00:00Z' }).expect(201)).body;
    await go(tech, ['dc-access', acc._id], 'pending_approval').expect(200); // pemohon boleh mengajukan
    const r = await approve(dc, 'dc-access', acc._id).expect(200);
    assert.strictEqual(r.body.status, 'approved'); // pegawai: cukup DC manager
    await go(dc, ['dc-access', acc._id], 'checked_in').expect(422); // identitas belum diverifikasi
    await go(dc, ['dc-access', acc._id], 'checked_in', { idVerified: true }).expect(200);
  });

  await t.test('spawn & tautan balik: incident → problem', async () => {
    const inc = (await request(app).post('/api/incidents').set(A(tech)).send({ title: 'DB lambat', impact: 2, urgency: 2 }).expect(201)).body;
    const pre = (await request(app).get(`/api/incidents/${inc._id}/spawn/problems`).set(A(tech)).expect(200)).body;
    const prb = (await request(app).post('/api/problems').set(A(tech)).send({ ...pre, _spawnFrom: `incidents:${inc._id}` }).expect(201)).body;
    const back = (await request(app).get(`/api/incidents/${inc._id}`).set(A(tech)).expect(200)).body;
    assert.strictEqual(String(back.relatedProblem?._id || back.relatedProblem), prb._id);
  });

  await t.test('KPI & Pekerjaan Saya lintas modul', async () => {
    const k = await request(app).get('/api/kpi').set(A(exec)).expect(200);
    assert.ok(k.body.finance.totals.amount >= 1000000000);
    assert.strictEqual(k.body.months.length, 6);
    assert.ok(k.body.grc && k.body.dcim && k.body.bcm);
    await request(app).get('/api/kpi').set(A(tech)).expect(403);
    const po2 = (await request(app).post('/api/purchase-orders').set(A(pm)).send({ title: 'Kecil', vendor: vendor._id, budget: budget._id, justification: 'x', items: [{ description: 'Kabel', qty: 1, unitPrice: 1000000 }] }).expect(201)).body;
    await go(pm, ['purchase-orders', po2._id], 'pending_approval').expect(200);
    const w = await request(app).get('/api/my-work').set(A(proc)).expect(200);
    assert.ok(w.body.approvals.some((a) => a._id === po2._id));
  });

  await t.test('operator platform memberi/mencabut modul per tenant', async () => {
    const adminS = await login('small-x', 'admin@s.io');
    await request(app).get('/api/budgets').set(A(adminS)).expect(403); // starter: tidak termasuk
    await request(app).put(`/api/platform/tenants/${S._id}`).set(A(ops)).send({ modules: ['incidents', 'requests', 'budgets', 'purchase-orders'], maxUsers: 3 }).expect(200);
    await request(app).get('/api/budgets').set(A(adminS)).expect(200);
    await request(app).get('/api/changes').set(A(adminS)).expect(403); // tidak di-grant
    const me = (await request(app).get('/api/auth/me').set(A(adminS)).expect(200)).body;
    assert.ok(me.permissions.budgets.enabled && !me.permissions.changes.enabled);
    await request(app).post('/api/users').set(A(adminS)).send({ name: 'u1', email: 'u1@s.io', password: PW }).expect(201);
    await request(app).post('/api/users').set(A(adminS)).send({ name: 'u2', email: 'u2@s.io', password: PW }).expect(201);
    await request(app).post('/api/users').set(A(adminS)).send({ name: 'u3', email: 'u3@s.io', password: PW }).expect(402);
    await request(app).put(`/api/platform/tenants/${S._id}`).set(A(ops)).send({ modules: null }).expect(200);
    await request(app).get('/api/budgets').set(A(adminS)).expect(403);
  });

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
