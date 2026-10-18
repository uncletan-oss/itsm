/* Seed data demo. Jalankan: npm run seed  (opsi: SEED_INDUSTRY=banking SEED_RESET=true) */
const mongoose = require('mongoose');
const config = require('./config');
const User = require('./models/User');
const Setting = require('./models/Setting');
const SlaPolicy = require('./models/SlaPolicy');
const resources = require('./resources');
const { nextNumber } = require('./models/Counter');
const { industries } = require('./data/frameworks');
const { syncControls } = require('./routes/compliance');

const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'Password123!';
const days = (n) => new Date(Date.now() + n * 864e5);
const hours = (n) => new Date(Date.now() + n * 36e5);

async function make(name, data, user) {
  const def = resources[name];
  const doc = new def.model(data);
  doc.createdBy = user._id;
  if (def.beforeCreate) await def.beforeCreate(doc, user);
  if (def.beforeSave) await def.beforeSave(doc, user);
  if (def.prefix) doc.number = await nextNumber(def.prefix);
  doc.activities.push({ type: 'system', message: 'Dibuat oleh seed data', by: user._id, byName: user.name });
  return doc.save();
}

async function main() {
  await mongoose.connect(config.mongoUri);
  if (process.env.SEED_RESET === 'true') {
    await mongoose.connection.dropDatabase();
    console.log('Database di-reset');
  }
  if (await User.exists({ email: 'admin@itsm.local' })) {
    console.log('Seed sudah pernah dijalankan (admin@itsm.local ada). Gunakan SEED_RESET=true untuk mengulang.');
    return mongoose.disconnect();
  }

  const people = [
    ['Admin Sistem', 'admin', ['admin'], 'TI'],
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
    ['Andi Pengguna', 'user', ['requester'], 'Operasional Cabang'],
  ];
  const u = {};
  for (const [name, key, roles, department] of people) {
    const user = new User({ name, email: `${key}@itsm.local`, roles, department });
    await user.setPassword(DEMO_PASSWORD);
    u[key] = await user.save();
  }
  const admin = u.admin;

  const industry = process.env.SEED_INDUSTRY || 'banking';
  const ind = industries.find((i) => i.id === industry) || industries[0];
  await Setting.findByIdAndUpdate(
    'org',
    { organizationName: 'PT Contoh Nusantara', industry: ind.id, enabledFrameworks: ind.frameworks },
    { upsert: true }
  );

  const sla = [
    [1, 15, 240], [2, 30, 480], [3, 120, 1440], [4, 480, 4320],
  ];
  for (const [p, r, res] of sla) {
    await SlaPolicy.create({ name: `Incident P${p}`, appliesTo: 'incident', priority: p, responseMinutes: r, resolutionMinutes: res });
    await SlaPolicy.create({ name: `Request P${p}`, appliesTo: 'request', priority: p, responseMinutes: r * 2, resolutionMinutes: res * 3 });
  }

  const vCloud = await make('vendors', {
    name: 'PT Awan Data Indonesia', category: 'cloud', criticality: 'critical', contractNumber: 'KTR/2025/014',
    contractStart: days(-300), contractEnd: days(60), dueDiligenceDate: days(-320), dueDiligenceResult: 'passed',
    certifications: ['ISO 27001', 'SOC 2 Type II'], dataLocation: 'Indonesia', rightToAudit: true,
    exitStrategy: 'Migrasi ke DC on-premise dalam 90 hari; data diekspor terenkripsi.', riskRating: 'medium',
  }, u.vendor);
  const vSoft = await make('vendors', {
    name: 'CV Solusi Perangkat Lunak', category: 'software', criticality: 'high', contractEnd: days(200),
    dueDiligenceResult: 'passed_with_findings', dataLocation: 'Indonesia', rightToAudit: false, riskRating: 'high',
  }, u.vendor);

  const svcCore = await make('services', {
    name: 'Core Banking', type: 'business', criticality: 'critical', owner: u.architect._id,
    availabilityTarget: 99.9, rtoHours: 2, rpoHours: 0.25, supportHours: '24x7',
  }, admin);
  const svcEmail = await make('services', {
    name: 'Email & Kolaborasi', type: 'business', criticality: 'high', availabilityTarget: 99.5, rtoHours: 8, rpoHours: 4, supportHours: '24x7',
  }, admin);
  const svcLaptop = await make('services', {
    name: 'Permintaan Laptop Baru', type: 'business', criticality: 'low', requestable: true, requestCategory: 'Perangkat Keras', requiresApproval: true,
  }, admin);
  const svcAccess = await make('services', {
    name: 'Permintaan Akses Aplikasi', type: 'business', criticality: 'medium', requestable: true, requestCategory: 'Akses', requiresApproval: true,
  }, admin);
  await make('services', { name: 'Reset Password', type: 'business', criticality: 'low', requestable: true, requestCategory: 'Akun' }, admin);

  const astSrv = await make('assets', {
    name: 'Server DB Core Banking 01', assetTag: 'AST-SRV-001', category: 'hardware', status: 'deployed', manufacturer: 'Dell', model: 'PowerEdge R760',
    serialNumber: 'SN-R760-0001', purchaseDate: days(-700), purchaseCost: 450000000, depreciationYears: 5, warrantyEnd: days(20), location: 'DC Jakarta',
  }, u.asset);
  await make('assets', {
    name: 'Microsoft 365 E3', category: 'license', status: 'deployed', licenseType: 'subscription', licenseSeats: 500, licenseSeatsUsed: 487, licenseExpiry: days(25),
    purchaseCost: 1200000000, vendor: vSoft._id,
  }, u.asset);
  await make('assets', { name: 'Laptop Lenovo T14', assetTag: 'AST-LPT-112', category: 'hardware', status: 'deployed', assignedTo: u.user._id, warrantyEnd: days(400) }, u.asset);

  const ciDb = await make('configuration-items', {
    name: 'cbs-db-prod-01', ciType: 'database', environment: 'production', hostname: 'cbs-db-prod-01', ipAddress: '10.10.1.11', dataCenter: 'primary_dc',
    hostingCountry: 'Indonesia', dataClassification: 'restricted', processesPersonalData: true, services: [svcCore._id], asset: astSrv._id, owner: u.tech._id,
  }, u.asset);
  const ciApp = await make('configuration-items', {
    name: 'cbs-app-prod', ciType: 'application', environment: 'production', dataCenter: 'primary_dc', dataClassification: 'restricted',
    processesPersonalData: true, services: [svcCore._id], dependsOn: [ciDb._id],
  }, u.asset);
  await make('configuration-items', {
    name: 'cbs-db-drc-01', ciType: 'database', environment: 'dr', dataCenter: 'drc', hostingCountry: 'Indonesia', dataClassification: 'restricted', services: [svcCore._id],
  }, u.asset);
  await make('configuration-items', { name: 'mail-saas', ciType: 'cloud_service', environment: 'production', dataCenter: 'cloud', hostingCountry: 'Singapura', services: [svcEmail._id], vendor: vSoft._id }, u.asset);

  const inc1 = await make('incidents', {
    title: 'Transaksi teller lambat di seluruh cabang', description: 'Response time core banking > 30 detik sejak 08:15', impact: 1, urgency: 1,
    service: svcCore._id, configurationItem: ciApp._id, category: 'Aplikasi', channel: 'monitoring', majorIncident: true, assignmentGroup: 'Aplikasi Core',
  }, u.servicedesk);
  inc1.status = 'in_progress'; inc1.assignee = u.tech._id; inc1.sla.respondedAt = new Date(); await inc1.save();
  await make('incidents', { title: 'Tidak bisa login email', impact: 3, urgency: 2, service: svcEmail._id, category: 'Akun', requester: u.user._id }, u.user);
  await make('incidents', {
    title: 'Indikasi phishing ke beberapa pegawai', description: 'Email phishing mengatasnamakan HR', impact: 2, urgency: 1, category: 'Keamanan',
    securityIncident: true, assignmentGroup: 'SOC',
  }, u.servicedesk);
  await make('requests', { title: 'Laptop untuk pegawai baru', service: svcLaptop._id, impact: 3, urgency: 3, quantity: 1, neededBy: days(7), approver: u.incident._id }, u.user);
  await make('requests', { title: 'Akses modul pelaporan', service: svcAccess._id, impact: 3, urgency: 2 }, u.user);

  const prb = await make('problems', {
    title: 'Degradasi performa core banking berulang saat awal hari', impact: 1, urgency: 2, service: svcCore._id, configurationItem: ciDb._id,
    assignee: u.incident._id, rcaMethod: '5_whys',
  }, u.incident);
  inc1.relatedProblem = prb._id; await inc1.save();

  await make('changes', {
    title: 'Penambahan index & tuning query batch EOD', type: 'normal', risk: 'high', impact: 1, service: svcCore._id, configurationItems: [ciDb._id],
    justification: 'Mengatasi problem ' + prb.number, plannedStart: days(3), plannedEnd: hours(3 * 24 + 2),
    implementationPlan: '1. Backup DB\n2. Buat index online\n3. Verifikasi execution plan',
    backoutPlan: 'Drop index baru dan restore konfigurasi sebelumnya', testPlan: 'Uji di staging dengan data produksi ter-masking',
    relatedProblem: prb._id, assignee: u.tech._id,
  }, u.tech);
  await make('changes', {
    title: 'Patch bulanan OS server non-kritis', type: 'standard', risk: 'low', impact: 3, plannedStart: days(5), plannedEnd: days(5.2),
    implementationPlan: 'Sesuai SOP patching', backoutPlan: 'Rollback snapshot VM',
  }, u.tech);

  await make('knowledge', {
    title: 'Cara reset password email secara mandiri', articleType: 'how_to', audience: 'public', category: 'Akun',
    content: '1. Buka portal SSO\n2. Klik "Lupa password"\n3. Ikuti verifikasi OTP', status: 'published', publishedAt: new Date(), service: svcEmail._id,
  }, u.knowledge);
  await make('knowledge', { title: 'Workaround lambatnya transaksi teller', articleType: 'known_error', audience: 'it_only', relatedProblem: prb._id, content: 'Restart connection pool aplikasi.' }, u.incident);

  await make('risks', {
    title: 'Ketergantungan pada penyedia cloud tunggal', category: 'third_party', nistFunction: 'GV', owner: u.risk._id, likelihood: 3, impact: 4,
    existingControls: 'Kontrak dengan SLA & right-to-audit', treatment: 'mitigate', relatedVendor: vCloud._id, status: 'assessed',
  }, u.risk);
  await make('risks', {
    title: 'Ransomware pada server produksi', category: 'cyber_security', nistFunction: 'PR', owner: u.ciso._id, likelihood: 3, impact: 5,
    treatment: 'mitigate', treatmentPlan: 'EDR, immutable backup, segmentasi jaringan', residualLikelihood: 2, residualImpact: 4, status: 'treating',
  }, u.ciso);
  await make('risks', { title: 'Data pribadi email disimpan di luar Indonesia', category: 'data_privacy', likelihood: 2, impact: 4, owner: u.risk._id }, u.risk);

  await make('continuity', {
    name: 'DRP Core Banking', planType: 'drp', status: 'tested', owner: u.tech._id, services: [svcCore._id], rtoHours: 2, rpoHours: 0.25,
    drSite: 'DRC Surabaya', lastTestDate: days(-200), lastTestResult: 'partial', testFindings: 'Replikasi tertinggal 25 menit', nextTestDate: days(-15),
  }, u.risk);

  await make('architecture', { name: 'Core Banking System', domain: 'application', buildingBlockType: 'sbb', admPhase: 'C', state: 'baseline', lifecycle: 'migrate', status: 'approved', relatedServices: [svcCore._id] }, u.architect);
  await make('architecture', { name: 'Platform API Gateway', domain: 'technology', buildingBlockType: 'abb', admPhase: 'D', state: 'target', lifecycle: 'invest', status: 'review' }, u.architect);

  const prj = await make('projects', {
    name: 'Modernisasi Core Banking', code: 'CBM-26', approach: 'hybrid', status: 'executing', health: 'amber', manager: u.pm._id, sponsor: 'Direktur Operasional & TI',
    objectives: 'Migrasi ke arsitektur microservices', scope: 'Modul tabungan & giro', startDate: days(-90), endDate: days(270), budget: 25000000000, actualCost: 6500000000,
    percentComplete: 28, regulatoryDriver: 'Rencana Strategis TI / RPTI',
  }, u.pm);
  const spr = await make('sprints', { name: 'Sprint 7', project: prj._id, goal: 'API rekening tabungan siap UAT', status: 'active', startDate: days(-5), endDate: days(9), capacityPoints: 40 }, u.pm);
  for (const [title, sp, status] of [['API buka rekening', 8, 'in_progress'], ['API mutasi rekening', 5, 'todo'], ['Pengujian keamanan API', 3, 'todo'], ['Dokumentasi OpenAPI', 2, 'done']]) {
    await make('backlog', { title, storyPoints: sp, status, project: prj._id, sprint: spr._id, itemType: 'story' }, u.pm);
  }
  await make('backlog', { title: 'Migrasi modul deposito', storyPoints: 13, itemType: 'epic', project: prj._id }, u.pm);

  const created = await syncControls(ind.frameworks);
  console.log(`Seed selesai. Industri: ${ind.name}. Kontrol kepatuhan dibuat: ${created}.`);
  console.log(`Login: admin@itsm.local / ${DEMO_PASSWORD} (akun lain: servicedesk, tech, change, cab, risk, ciso, auditor, user @itsm.local)`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
