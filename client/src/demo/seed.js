// Data demo multi-tenant — padanan server/src/seed.js untuk mode GitHub Pages
export const DEMO_PASSWORD = 'Password123!';
const days = (n) => new Date(Date.now() + n * 864e5).toISOString();
const hours = (n) => new Date(Date.now() + n * 36e5).toISOString();

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
  ['Andi Pengguna', 'user', ['requester'], 'Unit Bisnis'],
];

function baseTenant(api, { slug, name, industry, plan, people }) {
  const { db, newId } = api;
  const { tenant, user: admin } = api.provisionTenant({ slug, name, industry, plan, status: 'active', admin: { name: 'Admin Sistem', email: 'admin@itsm.local', password: DEMO_PASSWORD } });
  const u = { admin };
  for (const [pname, key, roles, department] of PEOPLE.filter(([, k]) => !people || people.includes(k))) {
    u[key] = { _id: newId(), tenant: tenant._id, name: pname, email: `${key}@itsm.local`, password: DEMO_PASSWORD, roles, department, active: true, createdAt: new Date().toISOString() };
    db.users.push(u[key]);
  }
  const svc = Object.fromEntries(db.services.filter((s) => s.tenant === tenant._id).map((s) => [s.name, s]));
  const make = (name, data, user) => api.createRecord({ tenant, user }, name, data, { trusted: true });
  const moveTo = (name, doc, to, user) => api.performTransition(name, doc, to, undefined, user);
  const assess = (implemented, partial, owner) => {
    for (const c of db.controls.filter((x) => x.tenant === tenant._id)) {
      if (implemented.includes(c.code)) Object.assign(c, { status: 'implemented', lastAssessed: days(-10), owner: owner._id });
      if (partial.includes(c.code)) Object.assign(c, { status: 'partial', lastAssessed: days(-10), owner: owner._id });
    }
  };
  return { tenant, u, svc, make, moveTo, assess };
}

function seedBank(api) {
  const { u, svc, make, moveTo, assess } = baseTenant(api, { slug: 'bank-nusantara', name: 'PT Bank Nusantara Sejahtera', industry: 'banking', plan: 'enterprise' });
  const vCloud = make('vendors', {
    name: 'PT Awan Data Indonesia', category: 'cloud', criticality: 'critical', contractNumber: 'KTR/2025/014', contractStart: days(-300), contractEnd: days(60),
    dueDiligenceDate: days(-320), dueDiligenceResult: 'passed', certifications: ['ISO 27001', 'SOC 2 Type II'], rightToAudit: true,
    exitStrategy: 'Migrasi ke DC on-premise dalam 90 hari; data diekspor terenkripsi.', riskRating: 'medium',
  }, u.vendor);
  const vSoft = make('vendors', { name: 'CV Solusi Perangkat Lunak', category: 'software', criticality: 'high', contractEnd: days(200), dueDiligenceResult: 'passed_with_findings', riskRating: 'high' }, u.vendor);

  const svcCore = make('services', { name: 'Core Banking', type: 'business', criticality: 'critical', owner: u.architect._id, availabilityTarget: 99.9, rtoHours: 2, rpoHours: 0.25, supportHours: '24x7' }, u.admin);
  const svcMobile = make('services', { name: 'Mobile Banking', criticality: 'critical', availabilityTarget: 99.8, rtoHours: 2, rpoHours: 0.25, supportHours: '24x7', dependsOn: [svcCore._id] }, u.admin);
  const svcEmail = make('services', { name: 'Email & Kolaborasi', criticality: 'high', availabilityTarget: 99.5, rtoHours: 8, rpoHours: 4, supportHours: '24x7' }, u.admin);

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
  const inc2 = make('incidents', { title: 'Notifikasi push mobile banking terlambat', impact: 2, urgency: 2, service: svcMobile._id, category: 'Aplikasi', assignee: u.tech._id }, u.servicedesk);
  moveTo('incidents', inc2, 'assigned', u.servicedesk);
  make('incidents', { title: 'Tidak bisa login email', impact: 3, urgency: 2, service: svcEmail._id, category: 'Akun', requester: u.user._id }, u.user);
  make('incidents', { title: 'Indikasi phishing ke beberapa pegawai', description: 'Email phishing mengatasnamakan HR', impact: 2, urgency: 1, category: 'Keamanan', securityIncident: true, assignmentGroup: 'SOC' }, u.servicedesk);
  // Riwayat 30 hari agar laporan & tren terisi
  const cats = ['Aplikasi', 'Jaringan', 'Akun', 'Perangkat', 'Keamanan'];
  for (let i = 0; i < 24; i += 1) {
    const created = new Date(Date.now() - (i + 1) * 1.2 * 864e5);
    const p = [4, 3, 3, 2, 4, 3][i % 6];
    const resolveH = [3, 9, 20, 30, 50, 70][i % 6];
    const doc = make('incidents', {
      title: `${cats[i % 5]}: gangguan #${i + 1}`, category: cats[i % 5], impact: p >= 3 ? 3 : 2, urgency: p === 4 ? 3 : p === 3 ? 2 : 1,
      service: [svcCore, svcMobile, svcEmail][i % 3]._id, assignee: u.tech._id, requester: u.user._id, createdAt: created.toISOString(),
    }, u.servicedesk);
    const resolvedAt = new Date(created.getTime() + resolveH * 36e5);
    Object.assign(doc, {
      status: 'closed', resolvedAt: resolvedAt.toISOString(), closedAt: resolvedAt.toISOString(), resolutionCode: 'solved_permanent', resolutionNotes: 'Diselesaikan',
      sla: { ...doc.sla, respondedAt: created.toISOString(), resolvedAt: resolvedAt.toISOString(), resolutionBreached: resolvedAt > new Date(created.getTime() + doc.sla.targetMinutes * 6e4) },
    });
  }
  make('requests', { title: 'Laptop untuk pegawai baru', service: svc['Permintaan Perangkat Baru']._id, quantity: 1, neededBy: days(7), approver: u.incident._id, requester: u.user._id, requiresApproval: true }, u.user);
  make('requests', { title: 'Akses modul pelaporan', service: svc['Permintaan Akses Aplikasi']._id, urgency: 2, requester: u.user._id }, u.user);

  make('changes', {
    title: 'Penambahan index & tuning query batch EOD', type: 'normal', risk: 'high', impact: 1, service: svcCore._id, configurationItems: [ciDb._id],
    justification: `Mengatasi problem ${prb.number}`, plannedStart: days(3), plannedEnd: hours(3 * 24 + 2),
    implementationPlan: '1. Backup DB\n2. Buat index online\n3. Verifikasi execution plan', backoutPlan: 'Drop index baru dan restore konfigurasi sebelumnya',
    testPlan: 'Uji di staging dengan data produksi ter-masking', relatedProblem: prb._id, assignee: u.tech._id, requester: u.tech._id,
  }, u.tech);
  const std = make('changes', { title: 'Patch bulanan OS server non-kritis', type: 'standard', risk: 'low', impact: 3, service: svcEmail._id, plannedStart: days(5), plannedEnd: days(5.2), implementationPlan: 'Sesuai SOP patching', backoutPlan: 'Rollback snapshot VM', requester: u.tech._id }, u.tech);
  for (const s of ['submitted', 'assessment', 'approved', 'scheduled']) moveTo('changes', std, s, u.change);
  for (const [title, outcome, d] of [['Upgrade firmware switch core', 'successful', -20], ['Rilis mobile banking v5.2', 'successful_with_issues', -12], ['Migrasi sertifikat TLS', 'successful', -6], ['Perubahan konfigurasi firewall', 'backed_out', -3]]) {
    const c = make('changes', { title, type: 'normal', risk: 'medium', impact: 2, plannedStart: days(d), plannedEnd: days(d + 0.1), implementationPlan: '-', backoutPlan: '-', outcome, pirNotes: 'PIR selesai', createdAt: days(d - 3) }, u.change);
    Object.assign(c, { status: 'closed', closedAt: days(d + 0.2) });
  }

  make('knowledge', { title: 'Cara reset password email secara mandiri', articleType: 'how_to', audience: 'public', category: 'Akun', content: '1. Buka portal SSO\n2. Klik "Lupa password"\n3. Ikuti verifikasi OTP', status: 'published', publishedAt: new Date().toISOString(), service: svcEmail._id, author: u.knowledge._id }, u.knowledge);
  for (const [title, category, content] of [
    ['Cara mengajukan permintaan perangkat baru', 'Perangkat Keras', '1. Masuk ke Portal\n2. Pilih "Permintaan Perangkat Baru" di katalog\n3. Isi kebutuhan dan tanggal dibutuhkan\n4. Permintaan diteruskan ke atasan untuk persetujuan'],
    ['Mengenali email phishing', 'Keamanan', 'Waspadai pengirim tidak dikenal, tautan mendesak, dan permintaan data pribadi/OTP. Laporkan email mencurigakan melalui Portal → Laporkan Gangguan kategori Keamanan.'],
    ['Menghubungkan VPN kantor dari rumah', 'Jaringan', '1. Instal aplikasi VPN resmi\n2. Masuk menggunakan akun domain\n3. Setujui notifikasi MFA di ponsel'],
  ]) make('knowledge', { title, category, content, articleType: 'how_to', audience: 'public', status: 'published', publishedAt: new Date().toISOString(), author: u.knowledge._id }, u.knowledge);
  make('knowledge', { title: 'Workaround lambatnya transaksi teller', articleType: 'known_error', audience: 'it_only', relatedProblem: prb._id, content: 'Restart connection pool aplikasi.', status: 'review', author: u.incident._id }, u.incident);

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
    make('backlog', { title, storyPoints: sp, status, project: prj._id, sprint: spr._id, assignee: u.tech._id }, u.pm);
  }
  make('backlog', { title: 'Migrasi modul deposito', storyPoints: 13, itemType: 'epic', project: prj._id }, u.pm);
  assess(['SM-INC', 'SM-CHG', 'SM-REQ', 'SM-ITAM', 'GV.RR', 'ID.AM', 'RS.MA', 'A.8.15', 'A.8.32', 'PADK-OPS', 'PADK-3P', 'TI-3P', 'TI-AUD'], ['SM-PRB', 'SM-SCON', 'ID.RA', 'PADK-RSK', 'PADK-BCP', 'TI-DRP', 'PDP-05', 'A.5.19'], u.risk);
}

function seedHospital(api) {
  const { u, make, moveTo, assess } = baseTenant(api, {
    slug: 'rs-sehat-sentosa', name: 'RS Sehat Sentosa', industry: 'healthcare', plan: 'professional',
    people: ['servicedesk', 'tech', 'incident', 'change', 'cab', 'asset', 'knowledge', 'risk', 'ciso', 'auditor', 'user'],
  });
  const simrs = make('services', { name: 'SIMRS (Rekam Medis Elektronik)', criticality: 'critical', availabilityTarget: 99.9, rtoHours: 1, rpoHours: 0.25, supportHours: '24x7' }, u.admin);
  const pacs = make('services', { name: 'PACS Radiologi', criticality: 'high', availabilityTarget: 99.5, supportHours: '24x7' }, u.admin);
  make('services', { name: 'Integrasi SATUSEHAT', criticality: 'high', availabilityTarget: 99.0, supportHours: '07:00–22:00' }, u.admin);
  const i1 = make('incidents', { title: 'Gambar PACS lambat dimuat di IGD', impact: 2, urgency: 1, service: pacs._id, category: 'Aplikasi', assignee: u.tech._id }, u.servicedesk);
  moveTo('incidents', i1, 'assigned', u.servicedesk);
  make('incidents', { title: 'Printer gelang pasien rawat inap error', impact: 3, urgency: 2, category: 'Perangkat', requester: u.user._id }, u.user);
  make('changes', { title: 'Upgrade SIMRS modul farmasi', type: 'normal', risk: 'medium', impact: 2, service: simrs._id, plannedStart: days(4), plannedEnd: days(4.1), implementationPlan: 'Deploy di luar jam poli', backoutPlan: 'Restore versi sebelumnya' }, u.tech);
  make('risks', { title: 'Akses tidak sah ke rekam medis pasien', category: 'data_privacy', nistFunction: 'PR', owner: u.ciso._id, likelihood: 3, impact: 5, status: 'assessed' }, u.ciso);
  make('knowledge', { title: 'Cara mengakses SIMRS dari ruang rawat', category: 'Aplikasi', content: 'Gunakan akun SSO rumah sakit dan kartu akses petugas.', articleType: 'how_to', audience: 'public', status: 'published', publishedAt: new Date().toISOString() }, u.knowledge);
  assess(['SM-INC', 'RME-02', 'RME-03', 'PDP-08'], ['RME-04', 'RME-06', 'A.8.13'], u.risk);
}

function seedGov(api) {
  const { u, make, moveTo } = baseTenant(api, {
    slug: 'pemkot-harmoni', name: 'Pemerintah Kota Harmoni', industry: 'government', plan: 'starter',
    people: ['servicedesk', 'tech', 'change', 'asset', 'knowledge', 'user'],
  });
  const portal = make('services', { name: 'Portal Layanan Publik', criticality: 'high', availabilityTarget: 99.5, supportHours: '24x7' }, u.admin);
  make('services', { name: 'e-Office Persuratan', criticality: 'medium', availabilityTarget: 99.0, supportHours: '07:30–16:00' }, u.admin);
  const i1 = make('incidents', { title: 'Formulir izin usaha gagal diunggah', impact: 2, urgency: 2, service: portal._id, category: 'Aplikasi', assignee: u.tech._id }, u.servicedesk);
  moveTo('incidents', i1, 'in_progress', u.tech);
  make('knowledge', { title: 'Panduan akun SSO pegawai', category: 'Akun', content: 'Aktivasi akun SSO melalui email dinas lalu atur MFA.', articleType: 'how_to', audience: 'public', status: 'published', publishedAt: new Date().toISOString() }, u.knowledge);
}

export function seed(api) {
  api.db.users.push({ _id: api.newId(), tenant: null, name: 'Operator Platform', email: 'platform@itsm.local', password: DEMO_PASSWORD, roles: ['platform_admin'], active: true, createdAt: new Date().toISOString() });
  seedBank(api);
  seedHospital(api);
  seedGov(api);
}
