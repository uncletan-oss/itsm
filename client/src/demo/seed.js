// Data demo — padanan server/src/seed.js untuk mode GitHub Pages
import { industries } from '../../../shared/frameworks.mjs';

export const DEMO_PASSWORD = 'Password123!';
const days = (n) => new Date(Date.now() + n * 864e5).toISOString();
const hours = (n) => new Date(Date.now() + n * 36e5).toISOString();

export function seed(api) {
  const { db, newId } = api;
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
    u[key] = { _id: newId(), name, email: `${key}@itsm.local`, password: DEMO_PASSWORD, roles, department, active: true, createdAt: new Date().toISOString() };
    db.users.push(u[key]);
  }
  const ind = industries.find((i) => i.id === 'banking');
  Object.assign(db.settings, { organizationName: 'PT Contoh Nusantara (Demo)', industry: ind.id, enabledFrameworks: ind.frameworks });

  const make = (name, data, user) => api.createRecord(name, data, user, { skipAuth: true });
  const moveTo = (name, doc, to, user) => api.performTransition(name, doc, to, user);

  for (const [p, r, res] of [[1, 15, 240], [2, 30, 480], [3, 120, 1440], [4, 480, 4320]]) {
    make('sla-policies', { name: `Incident P${p}`, appliesTo: 'incident', priority: p, responseMinutes: r, resolutionMinutes: res }, u.admin);
    make('sla-policies', { name: `Request P${p}`, appliesTo: 'request', priority: p, responseMinutes: r * 2, resolutionMinutes: res * 3 }, u.admin);
  }

  const vCloud = make('vendors', {
    name: 'PT Awan Data Indonesia', category: 'cloud', criticality: 'critical', contractNumber: 'KTR/2025/014', contractStart: days(-300), contractEnd: days(60),
    dueDiligenceDate: days(-320), dueDiligenceResult: 'passed', certifications: ['ISO 27001', 'SOC 2 Type II'], rightToAudit: true,
    exitStrategy: 'Migrasi ke DC on-premise dalam 90 hari; data diekspor terenkripsi.', riskRating: 'medium',
  }, u.vendor);
  const vSoft = make('vendors', { name: 'CV Solusi Perangkat Lunak', category: 'software', criticality: 'high', contractEnd: days(200), dueDiligenceResult: 'passed_with_findings', riskRating: 'high' }, u.vendor);

  const svcCore = make('services', { name: 'Core Banking', type: 'business', criticality: 'critical', owner: u.architect._id, availabilityTarget: 99.9, rtoHours: 2, rpoHours: 0.25, supportHours: '24x7' }, u.admin);
  const svcEmail = make('services', { name: 'Email & Kolaborasi', criticality: 'high', availabilityTarget: 99.5, rtoHours: 8, rpoHours: 4, supportHours: '24x7' }, u.admin);
  const svcLaptop = make('services', { name: 'Permintaan Laptop Baru', criticality: 'low', requestable: true, requestCategory: 'Perangkat Keras', requiresApproval: true, description: 'Laptop standar untuk pegawai' }, u.admin);
  const svcAccess = make('services', { name: 'Permintaan Akses Aplikasi', requestable: true, requestCategory: 'Akses', requiresApproval: true, description: 'Hak akses ke aplikasi bisnis' }, u.admin);
  make('services', { name: 'Reset Password', criticality: 'low', requestable: true, requestCategory: 'Akun', description: 'Reset password akun domain/email' }, u.admin);

  const astSrv = make('assets', {
    name: 'Server DB Core Banking 01', assetTag: 'AST-SRV-001', status: 'deployed', manufacturer: 'Dell', model: 'PowerEdge R760', serialNumber: 'SN-R760-0001',
    purchaseDate: days(-700), purchaseCost: 450000000, depreciationYears: 5, warrantyEnd: days(20), location: 'DC Jakarta',
  }, u.asset);
  make('assets', { name: 'Microsoft 365 E3', category: 'license', status: 'deployed', licenseType: 'subscription', licenseSeats: 500, licenseSeatsUsed: 487, licenseExpiry: days(25), purchaseCost: 1200000000, vendor: vSoft._id }, u.asset);
  make('assets', { name: 'Laptop Lenovo T14', assetTag: 'AST-LPT-112', status: 'deployed', assignedTo: u.user._id, warrantyEnd: days(400) }, u.asset);

  const ciDb = make('configuration-items', {
    name: 'cbs-db-prod-01', ciType: 'database', hostname: 'cbs-db-prod-01', ipAddress: '10.10.1.11', dataCenter: 'primary_dc', dataClassification: 'restricted',
    processesPersonalData: true, services: [svcCore._id], asset: astSrv._id, owner: u.tech._id,
  }, u.asset);
  const ciApp = make('configuration-items', { name: 'cbs-app-prod', ciType: 'application', dataCenter: 'primary_dc', dataClassification: 'restricted', processesPersonalData: true, services: [svcCore._id], dependsOn: [ciDb._id] }, u.asset);
  make('configuration-items', { name: 'cbs-db-drc-01', ciType: 'database', environment: 'dr', dataCenter: 'drc', dataClassification: 'restricted', services: [svcCore._id] }, u.asset);
  make('configuration-items', { name: 'mail-saas', ciType: 'cloud_service', dataCenter: 'cloud', hostingCountry: 'Singapura', services: [svcEmail._id], vendor: vSoft._id }, u.asset);

  const prb = make('problems', { title: 'Degradasi performa core banking berulang saat awal hari', impact: 1, urgency: 2, service: svcCore._id, configurationItem: ciDb._id, assignee: u.incident._id, rcaMethod: '5_whys' }, u.incident);
  moveTo('problems', prb, 'investigating', u.incident);

  const inc1 = make('incidents', {
    title: 'Transaksi teller lambat di seluruh cabang', description: 'Response time core banking > 30 detik sejak 08:15', impact: 1, urgency: 1,
    service: svcCore._id, configurationItem: ciApp._id, category: 'Aplikasi', channel: 'monitoring', majorIncident: true, assignmentGroup: 'Aplikasi Core',
    assignee: u.tech._id, relatedProblem: prb._id, createdAt: hours(-1),
  }, u.servicedesk);
  moveTo('incidents', inc1, 'in_progress', u.tech);
  make('incidents', { title: 'Tidak bisa login email', impact: 3, urgency: 2, service: svcEmail._id, category: 'Akun', requester: u.user._id }, u.user);
  make('incidents', { title: 'Indikasi phishing ke beberapa pegawai', description: 'Email phishing mengatasnamakan HR', impact: 2, urgency: 1, category: 'Keamanan', securityIncident: true, assignmentGroup: 'SOC' }, u.servicedesk);
  const incOld = make('incidents', { title: 'Printer lantai 3 offline', impact: 3, urgency: 3, category: 'Perangkat', assignee: u.tech._id, createdAt: days(-2) }, u.servicedesk);
  Object.assign(incOld, { resolutionCode: 'solved_permanent', resolutionNotes: 'Ganti kabel jaringan' });
  moveTo('incidents', incOld, 'assigned', u.tech);
  moveTo('incidents', incOld, 'resolved', u.tech);

  make('requests', { title: 'Laptop untuk pegawai baru', service: svcLaptop._id, quantity: 1, neededBy: days(7), approver: u.incident._id, requester: u.user._id }, u.user);
  make('requests', { title: 'Akses modul pelaporan', service: svcAccess._id, urgency: 2, requester: u.user._id }, u.user);

  make('changes', {
    title: 'Penambahan index & tuning query batch EOD', type: 'normal', risk: 'high', impact: 1, service: svcCore._id, configurationItems: [ciDb._id],
    justification: `Mengatasi problem ${prb.number}`, plannedStart: days(3), plannedEnd: hours(3 * 24 + 2),
    implementationPlan: '1. Backup DB\n2. Buat index online\n3. Verifikasi execution plan', backoutPlan: 'Drop index baru dan restore konfigurasi sebelumnya',
    testPlan: 'Uji di staging dengan data produksi ter-masking', relatedProblem: prb._id, assignee: u.tech._id, requester: u.tech._id,
  }, u.tech);
  const std = make('changes', { title: 'Patch bulanan OS server non-kritis', type: 'standard', risk: 'low', impact: 3, plannedStart: days(5), plannedEnd: days(5.2), implementationPlan: 'Sesuai SOP patching', backoutPlan: 'Rollback snapshot VM', requester: u.tech._id }, u.tech);
  for (const s of ['submitted', 'assessment', 'approved', 'scheduled']) moveTo('changes', std, s, u.change);

  make('knowledge', { title: 'Cara reset password email secara mandiri', articleType: 'how_to', audience: 'public', category: 'Akun', content: '1. Buka portal SSO\n2. Klik "Lupa password"\n3. Ikuti verifikasi OTP', status: 'published', publishedAt: new Date().toISOString(), service: svcEmail._id, author: u.knowledge._id }, u.knowledge);
  make('knowledge', { title: 'Workaround lambatnya transaksi teller', articleType: 'known_error', audience: 'it_only', relatedProblem: prb._id, content: 'Restart connection pool aplikasi.' }, u.incident);

  make('risks', { title: 'Ketergantungan pada penyedia cloud tunggal', category: 'third_party', nistFunction: 'GV', owner: u.risk._id, likelihood: 3, impact: 4, existingControls: 'Kontrak dengan SLA & right-to-audit', treatment: 'mitigate', relatedVendor: vCloud._id, status: 'assessed' }, u.risk);
  make('risks', { title: 'Ransomware pada server produksi', category: 'cyber_security', nistFunction: 'PR', owner: u.ciso._id, likelihood: 3, impact: 5, treatment: 'mitigate', treatmentPlan: 'EDR, immutable backup, segmentasi jaringan', residualLikelihood: 2, residualImpact: 4, status: 'treating' }, u.ciso);
  make('risks', { title: 'Data pribadi email disimpan di luar Indonesia', category: 'data_privacy', likelihood: 2, impact: 4, owner: u.risk._id }, u.risk);

  make('continuity', { name: 'DRP Core Banking', planType: 'drp', status: 'tested', owner: u.tech._id, services: [svcCore._id], rtoHours: 2, rpoHours: 0.25, drSite: 'DRC Surabaya', lastTestDate: days(-200), lastTestResult: 'partial', testFindings: 'Replikasi tertinggal 25 menit', nextTestDate: days(-15) }, u.risk);

  make('architecture', { name: 'Core Banking System', domain: 'application', admPhase: 'C', lifecycle: 'migrate', status: 'approved', relatedServices: [svcCore._id] }, u.architect);
  make('architecture', { name: 'Platform API Gateway', domain: 'technology', buildingBlockType: 'abb', admPhase: 'D', state: 'target', lifecycle: 'invest', status: 'review' }, u.architect);

  const prj = make('projects', {
    name: 'Modernisasi Core Banking', code: 'CBM-26', status: 'executing', health: 'amber', manager: u.pm._id, sponsor: 'Direktur Operasional & TI',
    objectives: 'Migrasi ke arsitektur microservices', scope: 'Modul tabungan & giro', startDate: days(-90), endDate: days(270), budget: 25000000000, actualCost: 6500000000,
    percentComplete: 28, regulatoryDriver: 'Rencana Strategis TI / RPTI',
  }, u.pm);
  const spr = make('sprints', { name: 'Sprint 7', project: prj._id, goal: 'API rekening tabungan siap UAT', status: 'active', startDate: days(-5), endDate: days(9), capacityPoints: 40 }, u.pm);
  for (const [title, sp, status] of [['API buka rekening', 8, 'in_progress'], ['API mutasi rekening', 5, 'todo'], ['Pengujian keamanan API', 3, 'todo'], ['Dokumentasi OpenAPI', 2, 'done']]) {
    make('backlog', { title, storyPoints: sp, status, project: prj._id, sprint: spr._id }, u.pm);
  }
  make('backlog', { title: 'Migrasi modul deposito', storyPoints: 13, itemType: 'epic', project: prj._id }, u.pm);

  api.syncControls(ind.frameworks, u.admin);
  // Contoh hasil self-assessment agar skor kepatuhan tidak kosong
  const assessed = { implemented: ['SM-INC', 'SM-CHG', 'SM-REQ', 'SM-ITAM', 'GV.RR', 'ID.AM', 'RS.MA', 'A.8.15', 'A.8.32', 'PADK-OPS', 'PADK-3P', 'TI-3P', 'TI-AUD'], partial: ['SM-PRB', 'SM-SCON', 'ID.RA', 'PADK-RSK', 'PADK-BCP', 'TI-DRP', 'PDP-05', 'A.5.19'] };
  for (const [status, codes] of Object.entries(assessed)) {
    for (const c of db.controls.filter((x) => codes.includes(x.code))) Object.assign(c, { status, lastAssessed: days(-10), owner: u.risk._id });
  }
}
