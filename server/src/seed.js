/* Seed data demo multi-tenant. Jalankan: npm run seed  (opsi: SEED_RESET=true) */
const mongoose = require('mongoose');
const config = require('./config');
const User = require('./models/User');
const resources = require('./resources');
const { nextNumber } = require('./models/Counter');
const { Service, } = require('./models/assets');
const { Control } = require('./models/governance');
const { provisionTenant } = require('./services/provision');
const { makeStore } = require('./services/records');
const { seedExtended } = require('../../shared/seed-extra.mjs');
const { PLATFORM_ROLE } = require('./constants');

const PW = process.env.SEED_PASSWORD || 'Password123!';
const days = (n) => new Date(Date.now() + n * 864e5);
const hours = (n) => new Date(Date.now() + n * 36e5);

const PEOPLE = [
  ['Sari Service Desk', 'servicedesk', ['service_desk'], 'TI - Service Desk'],
  ['Budi Teknisi', 'tech', ['technician'], 'TI - Infrastruktur'],
  ['Rina Incident Manager', 'incident', ['incident_manager', 'problem_manager'], 'TI - Operasi'],
  ['Agus Change Manager', 'change', ['change_manager', 'cab_member'], 'TI - Operasi'],
  ['Dewi CAB', 'cab', ['cab_member'], 'TI - Aplikasi'],
  ['Hendra Asset Manager', 'asset', ['asset_manager'], 'TI - Infrastruktur'],
  ['Lina Knowledge Manager', 'knowledge', ['knowledge_manager'], 'TI - Service Desk'],
  ['Yusuf Risk Officer', 'risk', ['risk_officer'], 'Manajemen Risiko'],
  ['Maya CISO', 'ciso', ['security_officer'], 'Keamanan Informasi'],
  ['Tono Enterprise Architect', 'architect', ['architect'], 'TI - Arsitektur'],
  ['Putri Project Manager', 'pm', ['project_manager'], 'PMO'],
  ['Joko Vendor Manager', 'vendor', ['vendor_manager'], 'Pengadaan'],
  ['Wati Auditor', 'auditor', ['auditor'], 'Audit Intern'],
  ['Fajar IT Controller', 'finance', ['finance_manager'], 'Keuangan TI'],
  ['Nadia Akuntan', 'accountant', ['accountant'], 'Akuntansi'],
  ['Tari Treasury', 'treasurer', ['treasurer'], 'Treasury'],
  ['Bambang CIO', 'executive', ['executive'], 'Direksi'],
  ['Doni DC Manager', 'dc', ['dc_manager'], 'Data Center'],
  ['Sinta BCM Coordinator', 'bcm', ['bcm_manager'], 'Manajemen Risiko'],
  ['Andi Pengguna', 'user', ['requester'], 'Unit Bisnis'],
];

function maker(tenant) {
  return async function make(name, data, user) {
    const def = resources[name];
    const doc = new def.model({ ...data, tenant: tenant._id });
    doc.createdBy = user._id;
    if (def.beforeCreate) await def.beforeCreate(doc, user);
    if (def.beforeSave) await def.beforeSave(doc, user);
    if (def.prefix) doc.number = await nextNumber(tenant._id, def.prefix);
    if (doc.activities) doc.activities.push({ type: 'system', message: 'Dibuat oleh seed data', by: user._id, byName: user.name });
    return doc.save();
  };
}

async function baseTenant({ slug, name, industry, plan, people }) {
  const { tenant, user: admin } = await provisionTenant({
    slug, name, industry, plan, status: 'active', admin: { name: 'Admin Sistem', email: 'admin@itsm.local', password: PW },
  });
  const u = { admin };
  for (const [pname, key, roles, department] of PEOPLE.filter(([, k]) => !people || people.includes(k))) {
    const user = new User({ tenant: tenant._id, name: pname, email: `${key}@itsm.local`, roles, department });
    await user.setPassword(PW);
    u[key] = await user.save();
  }
  const svc = Object.fromEntries((await Service.find({ tenant: tenant._id })).map((s) => [s.name, s]));
  return { tenant, u, svc, make: maker(tenant) };
}

async function assess(tenant, user, implemented, partial) {
  await Control.updateMany({ tenant: tenant._id, code: { $in: implemented } }, { status: 'implemented', lastAssessed: days(-10), owner: user._id });
  await Control.updateMany({ tenant: tenant._id, code: { $in: partial } }, { status: 'partial', lastAssessed: days(-10), owner: user._id });
}

async function seedBank() {
  const { tenant, u, svc, make } = await baseTenant({ slug: 'bank-nusantara', name: 'PT Bank Nusantara Sejahtera', industry: 'banking', plan: 'enterprise' });
  const vCloud = await make('vendors', {
    name: 'PT Awan Data Indonesia', category: 'cloud', criticality: 'critical', contractNumber: 'KTR/2025/014', contractStart: days(-300), contractEnd: days(60),
    dueDiligenceDate: days(-320), dueDiligenceResult: 'passed', certifications: ['ISO 27001', 'SOC 2 Type II'], dataLocation: 'Indonesia', rightToAudit: true,
    exitStrategy: 'Migrasi ke DC on-premise dalam 90 hari; data diekspor terenkripsi.', riskRating: 'medium', status: 'active',
  }, u.vendor);
  const vSoft = await make('vendors', { name: 'CV Solusi Perangkat Lunak', category: 'software', criticality: 'high', contractEnd: days(200), dueDiligenceResult: 'passed_with_findings', dataLocation: 'Indonesia', riskRating: 'high', status: 'active', exitStrategy: 'Migrasi ke vendor alternatif' }, u.vendor);

  const svcCore = await make('services', { name: 'Core Banking', type: 'business', criticality: 'critical', owner: u.architect._id, availabilityTarget: 99.9, rtoHours: 2, rpoHours: 0.25, supportHours: '24x7' }, u.admin);
  const svcMobile = await make('services', { name: 'Mobile Banking', type: 'business', criticality: 'critical', availabilityTarget: 99.8, rtoHours: 2, rpoHours: 0.25, supportHours: '24x7', dependsOn: [svcCore._id] }, u.admin);
  const svcEmail = await make('services', { name: 'Email & Kolaborasi', type: 'business', criticality: 'high', availabilityTarget: 99.5, rtoHours: 8, rpoHours: 4, supportHours: '24x7' }, u.admin);

  const astSrv = await make('assets', {
    name: 'Server DB Core Banking 01', assetTag: 'AST-SRV-001', category: 'hardware', status: 'deployed', manufacturer: 'Dell', model: 'PowerEdge R760',
    serialNumber: 'SN-R760-0001', purchaseDate: days(-700), purchaseCost: 450000000, depreciationYears: 5, warrantyEnd: days(20), location: 'DC Jakarta',
  }, u.asset);
  await make('assets', { name: 'Microsoft 365 E3', category: 'license', status: 'deployed', licenseType: 'subscription', licenseSeats: 500, licenseSeatsUsed: 487, licenseExpiry: days(25), purchaseCost: 1200000000, vendor: vSoft._id }, u.asset);
  await make('assets', { name: 'Laptop Lenovo T14', assetTag: 'AST-LPT-112', category: 'hardware', status: 'deployed', assignedTo: u.user._id, warrantyEnd: days(400) }, u.asset);

  const ciDb = await make('configuration-items', {
    name: 'cbs-db-prod-01', ciType: 'database', environment: 'production', hostname: 'cbs-db-prod-01', ipAddress: '10.10.1.11', dataCenter: 'primary_dc',
    hostingCountry: 'Indonesia', dataClassification: 'restricted', processesPersonalData: true, services: [svcCore._id], asset: astSrv._id, owner: u.tech._id, status: 'active',
  }, u.asset);
  const ciApp = await make('configuration-items', { status: 'active', owner: u.tech._id, name: 'cbs-app-prod', ciType: 'application', environment: 'production', dataCenter: 'primary_dc', dataClassification: 'restricted', processesPersonalData: true, services: [svcCore._id], dependsOn: [ciDb._id] }, u.asset);
  await make('configuration-items', { status: 'active', name: 'cbs-db-drc-01', ciType: 'database', environment: 'dr', dataCenter: 'drc', hostingCountry: 'Indonesia', dataClassification: 'restricted', services: [svcCore._id] }, u.asset);
  await make('configuration-items', { status: 'active', name: 'mail-saas', ciType: 'cloud_service', environment: 'production', dataCenter: 'cloud', hostingCountry: 'Singapura', services: [svcEmail._id], vendor: vSoft._id }, u.asset);

  const prb = await make('problems', { title: 'Degradasi performa core banking berulang saat awal hari', impact: 1, urgency: 2, service: svcCore._id, configurationItem: ciDb._id, assignee: u.incident._id, rcaMethod: '5_whys', status: 'investigating' }, u.incident);

  const inc1 = await make('incidents', {
    title: 'Transaksi teller lambat di seluruh cabang', description: 'Response time core banking > 30 detik sejak 08:15', impact: 1, urgency: 1, service: svcCore._id,
    configurationItem: ciApp._id, category: 'Aplikasi', channel: 'monitoring', majorIncident: true, assignmentGroup: 'Aplikasi Core', relatedProblem: prb._id,
  }, u.servicedesk);
  inc1.status = 'in_progress'; inc1.assignee = u.tech._id; inc1.sla.respondedAt = new Date(); await inc1.save();
  await make('incidents', { title: 'Notifikasi push mobile banking terlambat', impact: 2, urgency: 2, service: svcMobile._id, category: 'Aplikasi', assignee: u.tech._id, status: 'assigned' }, u.servicedesk);
  await make('incidents', { title: 'Tidak bisa login email', impact: 3, urgency: 2, service: svcEmail._id, category: 'Akun', requester: u.user._id }, u.user);
  await make('incidents', { title: 'Indikasi phishing ke beberapa pegawai', description: 'Email phishing mengatasnamakan HR', impact: 2, urgency: 1, category: 'Keamanan', securityIncident: true, assignmentGroup: 'SOC' }, u.servicedesk);
  // Riwayat 30 hari agar laporan & tren terisi
  const cats = ['Aplikasi', 'Jaringan', 'Akun', 'Perangkat', 'Keamanan'];
  for (let i = 0; i < 24; i += 1) {
    const created = days(-(i + 1) * 1.2);
    const p = [4, 3, 3, 2, 4, 3][i % 6];
    const resolveH = [3, 9, 20, 30, 50, 70][i % 6];
    const doc = await make('incidents', {
      title: `${cats[i % 5]}: gangguan #${i + 1}`, category: cats[i % 5], impact: p >= 3 ? 3 : 2, urgency: p === 4 ? 3 : p === 3 ? 2 : 1,
      service: [svcCore, svcMobile, svcEmail][i % 3]._id, assignee: u.tech._id, requester: u.user._id,
    }, u.servicedesk);
    const resolvedAt = new Date(created.getTime() + resolveH * 36e5);
    // collection.updateOne (driver native): createdAt bersifat immutable di Mongoose
    await resources.incidents.model.collection.updateOne({ _id: doc._id }, {
      $set: {
        createdAt: created, status: 'closed', resolvedAt, closedAt: resolvedAt, resolutionCode: 'solved_permanent', resolutionNotes: 'Diselesaikan',
        'sla.resolvedAt': resolvedAt, 'sla.respondedAt': created, 'sla.resolutionBreached': resolvedAt > new Date(created.getTime() + doc.sla.targetMinutes * 6e4),
      },
    });
  }
  await make('requests', { title: 'Laptop untuk pegawai baru', service: svc['Permintaan Perangkat Baru']._id, impact: 3, urgency: 3, quantity: 1, neededBy: days(7), approver: u.incident._id, requester: u.user._id }, u.user);
  await make('requests', { title: 'Akses modul pelaporan', service: svc['Permintaan Akses Aplikasi']._id, impact: 3, urgency: 2, requester: u.user._id }, u.user);

  await make('changes', {
    title: 'Penambahan index & tuning query batch EOD', type: 'normal', risk: 'high', impact: 1, service: svcCore._id, configurationItems: [ciDb._id],
    justification: `Mengatasi problem ${prb.number}`, plannedStart: days(3), plannedEnd: hours(3 * 24 + 2),
    implementationPlan: '1. Backup DB\n2. Buat index online\n3. Verifikasi execution plan', backoutPlan: 'Drop index baru dan restore konfigurasi sebelumnya',
    testPlan: 'Uji di staging dengan data produksi ter-masking', relatedProblem: prb._id, assignee: u.tech._id,
  }, u.tech);
  await make('changes', { title: 'Patch bulanan OS server non-kritis', type: 'standard', risk: 'low', impact: 3, service: svcEmail._id, plannedStart: days(5), plannedEnd: days(5.2), implementationPlan: 'Sesuai SOP patching', backoutPlan: 'Rollback snapshot VM', status: 'scheduled' }, u.tech);
  for (const [title, outcome, d] of [['Upgrade firmware switch core', 'successful', -20], ['Rilis mobile banking v5.2', 'successful_with_issues', -12], ['Migrasi sertifikat TLS', 'successful', -6], ['Perubahan konfigurasi firewall', 'backed_out', -3]]) {
    const c = await make('changes', { title, type: 'normal', risk: 'medium', impact: 2, plannedStart: days(d), plannedEnd: days(d + 0.1), implementationPlan: '-', backoutPlan: '-', outcome, pirNotes: 'PIR selesai', status: 'closed' }, u.change);
    await resources.changes.model.collection.updateOne({ _id: c._id }, { $set: { createdAt: days(d - 3), closedAt: days(d + 0.2) } });
  }

  await make('knowledge', { title: 'Cara reset password email secara mandiri', articleType: 'how_to', audience: 'public', category: 'Akun', content: '1. Buka portal SSO\n2. Klik "Lupa password"\n3. Ikuti verifikasi OTP', status: 'published', publishedAt: new Date(), service: svcEmail._id, author: u.knowledge._id }, u.knowledge);
  for (const [title, category, content] of [
    ['Cara mengajukan permintaan perangkat baru', 'Perangkat Keras', '1. Masuk ke Portal\n2. Pilih "Permintaan Perangkat Baru" di katalog\n3. Isi kebutuhan dan tanggal dibutuhkan\n4. Permintaan diteruskan ke atasan untuk persetujuan'],
    ['Mengenali email phishing', 'Keamanan', 'Waspadai pengirim tidak dikenal, tautan mendesak, dan permintaan data pribadi/OTP. Laporkan email mencurigakan melalui Portal → Laporkan Gangguan kategori Keamanan.'],
    ['Menghubungkan VPN kantor dari rumah', 'Jaringan', '1. Instal aplikasi VPN resmi\n2. Masuk menggunakan akun domain\n3. Setujui notifikasi MFA di ponsel'],
  ]) await make('knowledge', { title, category, content, articleType: 'how_to', audience: 'public', status: 'published', publishedAt: new Date() }, u.knowledge);
  await make('knowledge', { title: 'Workaround lambatnya transaksi teller', articleType: 'known_error', audience: 'it_only', relatedProblem: prb._id, content: 'Restart connection pool aplikasi.', status: 'review' }, u.incident);

  const riskCloud = await make('risks', { title: 'Ketergantungan pada penyedia cloud tunggal', category: 'third_party', nistFunction: 'GV', owner: u.risk._id, likelihood: 3, impact: 4, existingControls: 'Kontrak dengan SLA & right-to-audit', treatment: 'mitigate', relatedVendor: vCloud._id, status: 'assessed' }, u.risk);
  const riskRansom = await make('risks', { title: 'Ransomware pada server produksi', category: 'cyber_security', nistFunction: 'PR', owner: u.ciso._id, likelihood: 3, impact: 5, treatment: 'mitigate', treatmentPlan: 'EDR, immutable backup, segmentasi jaringan', residualLikelihood: 2, residualImpact: 4, status: 'treating' }, u.ciso);
  const riskData = await make('risks', { title: 'Data pribadi email disimpan di luar Indonesia', category: 'data_privacy', likelihood: 2, impact: 4, owner: u.risk._id }, u.risk);
  const plan = await make('continuity', { name: 'DRP Core Banking', planType: 'drp', status: 'tested', owner: u.tech._id, services: [svcCore._id], rtoHours: 2, rpoHours: 0.25, drSite: 'DRC Surabaya', lastTestDate: days(-200), lastTestResult: 'partial', testFindings: 'Replikasi tertinggal 25 menit', nextTestDate: days(-15) }, u.risk);
  await make('architecture', { name: 'Core Banking System', domain: 'application', buildingBlockType: 'sbb', admPhase: 'C', state: 'baseline', lifecycle: 'migrate', status: 'approved', relatedServices: [svcCore._id] }, u.architect);
  await make('architecture', { name: 'Platform API Gateway', domain: 'technology', buildingBlockType: 'abb', admPhase: 'D', state: 'target', lifecycle: 'invest', status: 'review' }, u.architect);
  const prj = await make('projects', {
    name: 'Modernisasi Core Banking', code: 'CBM-26', approach: 'hybrid', status: 'executing', health: 'amber', manager: u.pm._id, sponsor: 'Direktur Operasional & TI',
    objectives: 'Migrasi ke arsitektur microservices', scope: 'Modul tabungan & giro', startDate: days(-90), endDate: days(270), budget: 25000000000, actualCost: 6500000000,
    percentComplete: 28, regulatoryDriver: 'Rencana Strategis TI / RPTI',
  }, u.pm);
  const spr = await make('sprints', { name: 'Sprint 7', project: prj._id, goal: 'API rekening tabungan siap UAT', status: 'active', startDate: days(-5), endDate: days(9), capacityPoints: 40 }, u.pm);
  for (const [title, sp, status] of [['API buka rekening', 8, 'in_progress'], ['API mutasi rekening', 5, 'todo'], ['Pengujian keamanan API', 3, 'todo'], ['Dokumentasi OpenAPI', 2, 'done']]) {
    await make('backlog', { title, storyPoints: sp, status, project: prj._id, sprint: spr._id, itemType: 'story', assignee: u.tech._id }, u.pm);
  }
  await make('backlog', { title: 'Migrasi modul deposito', storyPoints: 13, itemType: 'epic', project: prj._id }, u.pm);
  await assess(tenant, u.risk, ['SM-INC', 'SM-CHG', 'SM-REQ', 'SM-ITAM', 'GV.RR', 'ID.AM', 'RS.MA', 'A.8.15', 'A.8.32', 'PADK-OPS', 'PADK-3P', 'TI-3P', 'TI-AUD'], ['SM-PRB', 'SM-SCON', 'ID.RA', 'PADK-RSK', 'PADK-BCP', 'TI-DRP', 'PDP-05', 'A.5.19']);
  // Modul lanjutan (keuangan, GRC & assurance, DCIM, BCM/DR, perencanaan) — data bersama dengan demo
  const store = makeStore({ tenant, user: u.admin, ip: 'seed' }, resources);
  await seedExtended(store, { u, refs: { vCloud, vSoft, svcCore, svcMobile, svcEmail, ciDb, ciApp, plan, project: prj, riskCloud, riskRansom, riskData } });
  return tenant;
}

async function seedHospital() {
  const { tenant, u, make } = await baseTenant({
    slug: 'rs-sehat-sentosa', name: 'RS Sehat Sentosa', industry: 'healthcare', plan: 'professional',
    people: ['servicedesk', 'tech', 'incident', 'change', 'cab', 'asset', 'knowledge', 'risk', 'ciso', 'auditor', 'user'],
  });
  const simrs = await make('services', { name: 'SIMRS (Rekam Medis Elektronik)', criticality: 'critical', availabilityTarget: 99.9, rtoHours: 1, rpoHours: 0.25, supportHours: '24x7' }, u.admin);
  const pacs = await make('services', { name: 'PACS Radiologi', criticality: 'high', availabilityTarget: 99.5, supportHours: '24x7' }, u.admin);
  await make('services', { name: 'Integrasi SATUSEHAT', criticality: 'high', availabilityTarget: 99.0, supportHours: '07:00–22:00' }, u.admin);
  await make('incidents', { title: 'Gambar PACS lambat dimuat di IGD', impact: 2, urgency: 1, service: pacs._id, category: 'Aplikasi', assignee: u.tech._id, status: 'assigned' }, u.servicedesk);
  await make('incidents', { title: 'Printer gelang pasien rawat inap error', impact: 3, urgency: 2, category: 'Perangkat', requester: u.user._id }, u.user);
  await make('changes', { title: 'Upgrade SIMRS modul farmasi', type: 'normal', risk: 'medium', impact: 2, service: simrs._id, plannedStart: days(4), plannedEnd: days(4.1), implementationPlan: 'Deploy di luar jam poli', backoutPlan: 'Restore versi sebelumnya' }, u.tech);
  await make('risks', { title: 'Akses tidak sah ke rekam medis pasien', category: 'data_privacy', nistFunction: 'PR', owner: u.ciso._id, likelihood: 3, impact: 5, status: 'assessed' }, u.ciso);
  await make('knowledge', { title: 'Cara mengakses SIMRS dari ruang rawat', category: 'Aplikasi', content: 'Gunakan akun SSO rumah sakit dan kartu akses petugas.', articleType: 'how_to', audience: 'public', status: 'published', publishedAt: new Date() }, u.knowledge);
  await assess(tenant, u.risk, ['SM-INC', 'RME-02', 'RME-03', 'PDP-08'], ['RME-04', 'RME-06', 'A.8.13']);
  return tenant;
}

async function seedGov() {
  const { tenant, u, make } = await baseTenant({
    slug: 'pemkot-harmoni', name: 'Pemerintah Kota Harmoni', industry: 'government', plan: 'starter',
    people: ['servicedesk', 'tech', 'change', 'asset', 'knowledge', 'user'],
  });
  const portal = await make('services', { name: 'Portal Layanan Publik', criticality: 'high', availabilityTarget: 99.5, supportHours: '24x7' }, u.admin);
  await make('services', { name: 'e-Office Persuratan', criticality: 'medium', availabilityTarget: 99.0, supportHours: '07:30–16:00' }, u.admin);
  await make('incidents', { title: 'Formulir izin usaha gagal diunggah', impact: 2, urgency: 2, service: portal._id, category: 'Aplikasi', assignee: u.tech._id, status: 'in_progress' }, u.servicedesk);
  await make('knowledge', { title: 'Panduan akun SSO pegawai', category: 'Akun', content: 'Aktivasi akun SSO melalui email dinas lalu atur MFA.', articleType: 'how_to', audience: 'public', status: 'published', publishedAt: new Date() }, u.knowledge);
  return tenant;
}

async function main() {
  await mongoose.connect(config.mongoUri);
  if (process.env.SEED_RESET === 'true') {
    await mongoose.connection.dropDatabase();
    console.log('Database di-reset');
  }
  await Promise.all(mongoose.modelNames().map((m) => mongoose.model(m).syncIndexes()));
  if (await User.exists({ tenant: null, email: 'platform@itsm.local' })) {
    console.log('Seed sudah pernah dijalankan. Gunakan SEED_RESET=true untuk mengulang.');
    return mongoose.disconnect();
  }
  const op = new User({ tenant: null, name: 'Operator Platform', email: 'platform@itsm.local', roles: [PLATFORM_ROLE] });
  await op.setPassword(PW);
  await op.save();
  const tenants = [await seedBank(), await seedHospital(), await seedGov()];
  console.log(`Seed selesai: ${tenants.map((t) => `${t.slug} (${t.plan})`).join(', ')}`);
  console.log(`Login portal: workspace "bank-nusantara" + admin@itsm.local / ${PW}`);
  console.log(`Operator platform: workspace kosong + platform@itsm.local / ${PW}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
