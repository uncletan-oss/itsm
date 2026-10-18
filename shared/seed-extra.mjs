/**
 * Data contoh modul lanjutan (keuangan, GRC & assurance, DCIM, BCM/DR, perencanaan) — dipakai seed server & demo
 * melalui antarmuka `store`. Status akhir dibuat langsung, lalu efek (jurnal, realisasi anggaran, utilisasi DC)
 * dijalankan dengan aturan yang sama seperti saat pengguna menjalankan workflow.
 */
import { EFFECTS, ON_SAVE } from './effects.mjs';

const id = (v) => (v && typeof v === 'object' ? String(v._id) : v ? String(v) : null);
const days = (n) => new Date(Date.now() + n * 864e5).toISOString();
const appr = (step, user, extra = {}) => ({ step, decision: 'approved', approver: id(user._id), approverName: user.name, round: 1, at: days(-1), ...extra });

export async function seedExtended(store, { u, refs }) {
  const year = new Date().getFullYear();
  const { vCloud, vSoft, svcCore, svcMobile, svcEmail, ciDb, ciApp, plan, project, riskCloud, riskRansom, riskData } = refs;
  const make = (res, data) => store.create(res, data);

  // ---------------- Vendor & kontrak ----------------
  const vSec = await make('vendors', { name: 'PT Keamanan Siber Nusantara', category: 'managed_service', criticality: 'high', status: 'due_diligence', contactName: 'Rudi', dataLocation: 'Indonesia' });
  await make('contracts', {
    title: 'Layanan cloud IaaS & DRaaS 2025–2028', vendor: id(vCloud), contractType: 'cloud', owner: id(u.vendor._id), value: 2400000000, startDate: days(-300), endDate: days(60),
    noticeDays: 90, material: true, regulatorReportedAt: days(-310), rightToAudit: true, dataLocation: 'Indonesia', status: 'active',
    slaTerms: 'Ketersediaan 99,95%; penalti 5% per 0,1% di bawah target', legalNotes: 'Disetujui legal', exitClause: 'Transisi 90 hari dengan ekspor data terenkripsi',
    approvals: [appr('Vendor Manager', u.vendor), appr('Risk & Compliance', u.risk), appr('Eksekutif (≥ Rp 1 M / material)', u.executive)], approvalRound: 1,
  });
  await make('contracts', { title: 'Pemeliharaan lisensi aplikasi kolaborasi', vendor: id(vSoft), contractType: 'license', value: 650000000, startDate: days(10), endDate: days(375), status: 'legal_review', owner: id(u.vendor._id) });
  await make('contracts', { title: 'Managed SOC 24x7', vendor: id(vSec), contractType: 'outsourcing', value: 1800000000, status: 'draft', material: true });

  // ---------------- Anggaran ----------------
  const B = {};
  for (const [k, data] of Object.entries({
    lic: { name: 'Lisensi & langganan perangkat lunak', category: 'opex', portfolio: 'run', account: '5110', amount: 3500000000 },
    infra: { name: 'Infrastruktur DC & jaringan', category: 'capex', portfolio: 'run', account: '1300', amount: 6000000000 },
    cloud: { name: 'Cloud & hosting', category: 'opex', portfolio: 'run', account: '5120', amount: 2000000000 },
    cbm: { name: 'Program modernisasi core banking', category: 'capex', portfolio: 'transform', account: '1310', amount: 12000000000 },
    sec: { name: 'Penguatan keamanan siber', category: 'opex', portfolio: 'grow', account: '5130', amount: 2500000000 },
  })) {
    B[k] = await make('budgets', { ...data, fiscalYear: year, costCenter: 'IT-OPS', owner: id(u.finance._id), justification: 'Rencana kerja & anggaran TI', status: 'active', approvals: [appr('IT Controller', u.finance), appr('CIO / Direksi', u.executive)], approvalRound: 1 });
  }
  await make('budgets', { name: 'Program data & analitik', fiscalYear: year + 1, category: 'opex', portfolio: 'grow', account: '5130', amount: 1500000000, owner: id(u.finance._id), justification: 'Usulan RKA tahun depan', status: 'pending_approval', approvals: [appr('IT Controller', u.finance)], approvalRound: 1 });

  // ---------------- Procure-to-pay ----------------
  const po = (data) => make('purchase-orders', { taxRate: 11, requester: id(u.pm._id), justification: 'Sesuai rencana anggaran', ...data });
  const poLic = await po({ title: 'Perpanjangan lisensi Microsoft 365 E3 (500 seat)', vendor: id(vSoft), budget: id(B.lic), items: [{ description: 'Lisensi M365 E3 / tahun', qty: 500, unitPrice: 2000000 }], status: 'closed', receivedDate: days(-150), receivedNotes: 'Lisensi aktif di tenant', approvals: [appr('Procurement', u.vendor), appr('IT Controller (cek anggaran)', u.finance), appr('CIO / Direksi (≥ Rp 500 jt)', u.executive)], approvalRound: 1 });
  const poSrv = await po({ title: 'Server database tambahan untuk core banking', vendor: id(vCloud), budget: id(B.infra), items: [{ description: 'Server rack 2U, 64 core, 1 TB RAM', qty: 2, unitPrice: 450000000 }], status: 'received', receivedDate: days(-25), receivedNotes: 'BAST No. 112/IT/2026', approvals: [appr('Procurement', u.vendor), appr('IT Controller (cek anggaran)', u.finance), appr('CIO / Direksi (≥ Rp 500 jt)', u.executive)], approvalRound: 1 });
  const poCloud = await po({ title: 'Langganan cloud hosting 12 bulan', vendor: id(vCloud), budget: id(B.cloud), items: [{ description: 'IaaS & DRaaS per bulan', qty: 12, unitPrice: 120000000 }], status: 'received', receivedDate: days(-170), receivedNotes: 'Layanan aktif', approvals: [appr('Procurement', u.vendor), appr('IT Controller (cek anggaran)', u.finance), appr('CIO / Direksi (≥ Rp 500 jt)', u.executive)], approvalRound: 1 });
  await po({ title: 'Cloud backup storage immutable', vendor: id(vCloud), budget: id(B.sec), items: [{ description: 'Object storage immutable 100 TB / bulan', qty: 12, unitPrice: 25000000 }], status: 'ordered', approvals: [appr('Procurement', u.vendor), appr('IT Controller (cek anggaran)', u.finance)], approvalRound: 1 });
  await po({ title: 'Next-gen firewall untuk DC & DRC', vendor: id(vSoft), budget: id(B.infra), items: [{ description: 'NGFW high availability pair', qty: 2, unitPrice: 350000000 }], status: 'pending_approval', approvals: [appr('Procurement', u.vendor)], approvalRound: 1 });
  await po({ title: 'Laptop pengembang (batch 2)', vendor: id(vSoft), budget: id(B.cbm), items: [{ description: 'Laptop 32 GB', qty: 10, unitPrice: 28000000 }], status: 'draft' });

  const inv = async (data, payment) => {
    const doc = await make('invoices', { taxRate: 11, account: undefined, ...data });
    await EFFECTS.invoices.approved(doc, store);
    if (payment) {
      const pay = await make('payments', { invoice: id(doc), amount: doc.total, method: 'transfer', bankAccount: 'Rek. operasional 001', reference: `TRX${Math.floor(Math.random() * 1e8)}`, approvals: [appr('Treasury', u.treasurer), appr('Finance Manager (≥ Rp 100 jt)', u.finance)], approvalRound: 1, ...payment });
      if (['executed', 'reconciled'].includes(pay.status)) await EFFECTS.payments.executed(pay, store);
    }
    return doc;
  };
  const apApproved = (by) => ({ status: 'approved', approvals: [appr('Accounts Payable', by), appr('IT Controller (≥ Rp 100 jt)', u.finance)], approvalRound: 1, matchResult: 'Cocok (3-way match)' });
  await inv({ vendorInvoiceNo: 'MSV/INV/2026/0412', taxInvoiceNo: '010.000-26.00000412', purchaseOrder: id(poLic), vendor: id(vSoft), invoiceDate: days(-140), dueDate: days(-110), amount: 1000000000, description: 'Lisensi M365 E3', ...apApproved(u.accountant) }, { status: 'reconciled', paymentDate: days(-112), reconciledAt: days(-100) });
  for (let m = 5; m >= 1; m -= 1) {
    await inv({ vendorInvoiceNo: `ADI/CLD/${m}`, purchaseOrder: id(poCloud), vendor: id(vCloud), invoiceDate: days(-m * 30), dueDate: days(-m * 30 + 30), amount: 120000000, description: `Cloud hosting bulan ke-${6 - m}`, ...apApproved(u.accountant) },
      m > 1 ? { status: 'executed', paymentDate: days(-m * 30 + 25) } : null);
  }
  const invSrv = await inv({ vendorInvoiceNo: 'ADI/HW/2026/088', purchaseOrder: id(poSrv), vendor: id(vCloud), invoiceDate: days(-20), dueDate: days(-5), amount: 900000000, description: 'Server database tambahan', ...apApproved(u.accountant) });
  await make('payments', { invoice: id(invSrv), amount: invSrv.total, method: 'rtgs', paymentDate: days(1), bankAccount: 'Rek. operasional 001', status: 'pending_approval', approvalRound: 1, approvals: [] });
  await make('invoices', { vendorInvoiceNo: 'ADI/CLD/6', purchaseOrder: id(poCloud), vendor: id(vCloud), invoiceDate: days(-2), dueDate: days(28), amount: 120000000, status: 'verified', matchResult: 'Cocok (3-way match)' });
  await make('journals', {
    date: days(-1), description: 'Akrual beban konsultan keamanan bulan berjalan', source: 'adjustment', status: 'pending_approval', approvalRound: 1,
    lines: [{ account: '5130', memo: 'Akrual konsultan', debit: 85000000, credit: 0 }, { account: '2100', memo: 'Utang akrual', debit: 0, credit: 85000000 }],
  });
  for (const b of Object.values(B)) await ON_SAVE.budgets(b, store);

  // ---------------- GRC & assurance ----------------
  if (riskRansom) {
    await make('risk-actions', { title: 'Implementasi immutable backup untuk server produksi', risk: id(riskRansom), actionType: 'preventive', owner: id(u.tech._id), dueDate: days(-20), status: 'verified', completionEvidence: 'Snapshot immutable 30 hari aktif', verificationNotes: 'Diverifikasi uji restore', completedAt: days(-25), verifiedBy: id(u.risk._id) });
    await make('risk-actions', { title: 'Deploy EDR ke seluruh server', risk: id(riskRansom), actionType: 'detective', owner: id(u.tech._id), dueDate: days(-5), status: 'in_progress' });
  }
  if (riskCloud) await make('risk-actions', { title: 'Uji coba exit strategy penyedia cloud', risk: id(riskCloud), actionType: 'corrective', owner: id(u.vendor._id), dueDate: days(45), status: 'open' });
  if (riskData) await store.update('risks', id(riskData), { treatment: 'accept', acceptanceRationale: 'Data hanya metadata email, terenkripsi, dan penyedia memiliki SOC 2; biaya migrasi tidak sebanding', reviewDate: days(180), status: 'pending_approval', approvalRound: 1, approvals: [] });

  const ctl = async (code) => (await store.find('controls', { code }))[0];
  const cBackup = await ctl('A.8.13');
  const cVuln = await ctl('A.8.8');
  const c3p = await ctl('PADK-3P');
  if (cBackup) {
    const t = await make('control-tests', { title: 'Uji efektivitas backup & restore Q2', control: id(cBackup), testType: 'operating', period: `Q2 ${year}`, tester: id(u.auditor._id), sampleSize: 25, procedure: 'Sampel 25 job backup; uji restore 3 sistem', results: 'Seluruh sampel berhasil', conclusion: 'effective', status: 'concluded', approvals: [appr('Reviewer (Audit / Risk)', u.risk)], approvalRound: 1 });
    await EFFECTS['control-tests'].concluded(t, store);
  }
  if (cVuln) {
    const t = await make('control-tests', { title: 'Uji manajemen kerentanan server produksi', control: id(cVuln), testType: 'operating', period: `Q2 ${year}`, tester: id(u.auditor._id), sampleSize: 40, procedure: 'Bandingkan hasil scan vs SLA patch', results: '9 dari 40 kerentanan kritikal melewati SLA patch 14 hari', conclusion: 'ineffective', status: 'concluded', approvals: [appr('Reviewer (Audit / Risk)', u.risk)], approvalRound: 1 });
    await EFFECTS['control-tests'].concluded(t, store);
  }
  if (c3p) await make('control-tests', { title: 'Uji pengelolaan penyedia jasa TI (PADK)', control: id(c3p), testType: 'design', period: `${year}`, tester: id(u.auditor._id), procedure: 'Review due diligence & kontrak vendor kritikal', results: 'Klausul right-to-audit tersedia; exit plan belum diuji', conclusion: 'partially_effective', status: 'pending_approval', approvalRound: 1, approvals: [] });
  await make('findings', {
    title: 'Uji DRP belum mencakup skenario failover penuh core banking', source: 'regulator', severity: 'high', owner: id(u.tech._id), dueDate: days(30),
    condition: 'Uji DRP terakhir hanya simulasi parsial', criteria: 'Rencana pemulihan bencana wajib diuji secara berkala (POJK 11/2022, PADK 1/2026)', cause: 'Keterbatasan jendela waktu operasional',
    effect: 'Kemampuan pemulihan aktual belum terbukti', recommendation: 'Jadwalkan uji failover penuh tahunan', managementResponse: 'Setuju', actionPlan: 'Uji failover penuh pada akhir kuartal', status: 'in_remediation',
  });
  await make('findings', { title: 'Akun privileged tidak direview berkala', source: 'internal_audit', severity: 'medium', owner: id(u.ciso._id), dueDate: days(60), condition: '12 akun admin tidak direview 6 bulan', criteria: 'ISO 27001 A.8.2', recommendation: 'Review akses privileged triwulanan', status: 'open' });
  await make('findings', { title: 'Log akses DC tidak ditandatangani pendamping', source: 'internal_audit', severity: 'low', owner: id(u.dc._id), dueDate: days(-30), managementResponse: 'Setuju', actionPlan: 'Form digital', remediationEvidence: 'Modul Akses DC diterapkan', status: 'closed', createdAt: days(-120) });

  // ---------------- DCIM ----------------
  const dcJkt = await make('datacenters', { name: 'DC Jakarta (Cikarang)', siteType: 'primary_dc', tier: 'III', location: 'Cikarang, Jawa Barat', country: 'Indonesia', manager: id(u.dc._id), powerCapacityKw: 60, coolingCapacityKw: 75, certifications: ['Uptime Tier III', 'ISO 27001'], status: 'operational' });
  const dcSby = await make('datacenters', { name: 'DRC Surabaya', siteType: 'drc', tier: 'III', location: 'Surabaya, Jawa Timur', country: 'Indonesia', provider: id(vCloud), manager: id(u.dc._id), powerCapacityKw: 30, coolingCapacityKw: 38, certifications: ['ISO 27001'], status: 'operational' });
  const rackSpecs = [
    [dcJkt, 'JKT-A01', 38, 7.2, 8, [ciDb, ciApp]], [dcJkt, 'JKT-A02', 30, 5.5, 8], [dcJkt, 'JKT-A03', 41, 7.8, 8], [dcJkt, 'JKT-B01', 22, 3.9, 8],
    [dcJkt, 'JKT-B02', 12, 2.1, 8], [dcJkt, 'JKT-B03', 0, 0, 8, null, 'planned'], [dcSby, 'SBY-A01', 30, 5.1, 6], [dcSby, 'SBY-A02', 26, 4.4, 6], [dcSby, 'SBY-A03', 10, 1.6, 6],
  ];
  for (const [dc, name, used, pw, cap, cis, status] of rackSpecs) {
    const r = await make('racks', { name, datacenter: id(dc), row: name.split('-')[1].slice(0, 1), totalUnits: 42, usedUnits: used, powerCapacityKw: cap, powerUsedKw: pw, status: status || (used >= 40 ? 'full' : 'active'), configurationItems: (cis || []).filter(Boolean).map(id) });
    await ON_SAVE.racks(r, store);
  }
  await make('dc-access', { title: 'Pemasangan server DB tambahan', datacenter: id(dcJkt), visitorName: 'Teknisi PT Awan Data', company: 'PT Awan Data Indonesia', visitorType: 'vendor', plannedStart: days(-24), plannedEnd: days(-24), escort: id(u.tech._id), idVerified: true, checkInAt: days(-24), checkOutAt: days(-24), status: 'checked_out', approvals: [appr('Data Center Manager', u.dc), appr('Keamanan informasi (pihak luar)', u.ciso)], approvalRound: 1 });
  await make('dc-access', { title: 'Audit fisik DRC oleh auditor eksternal', datacenter: id(dcSby), visitorName: 'Tim KAP', company: 'KAP Mitra', visitorType: 'auditor', plannedStart: days(3), plannedEnd: days(3), status: 'pending_approval', approvals: [appr('Data Center Manager', u.dc)], approvalRound: 1 });
  await make('dc-access', { title: 'Penggantian modul UPS', datacenter: id(dcJkt), visitorName: 'Budi Teknisi', visitorType: 'employee', plannedStart: days(1), plannedEnd: days(1), status: 'approved', approvals: [appr('Data Center Manager', u.dc)], approvalRound: 1 });

  // ---------------- BCM & DR ----------------
  await make('bia', { title: 'Transaksi teller & tabungan', businessUnit: 'Operasional Cabang', service: id(svcCore), processOwner: id(u.executive._id), mtpdHours: 8, rtoHours: 2, rpoHours: 0.25, financialImpact: 'critical', regulatoryImpact: 'critical', reputationalImpact: 'high', operationalImpact: 'critical', dependencies: 'Core banking, jaringan cabang, DRC', status: 'approved', nextReview: days(200), approvals: [appr('Pemilik proses', u.executive), appr('BCM Coordinator', u.bcm)], approvalRound: 1 });
  await make('bia', { title: 'Layanan mobile banking nasabah', businessUnit: 'Digital Banking', service: id(svcMobile), processOwner: id(u.executive._id), mtpdHours: 12, rtoHours: 4, rpoHours: 0.5, financialImpact: 'high', regulatoryImpact: 'high', reputationalImpact: 'critical', operationalImpact: 'high', status: 'review' });
  await make('bia', { title: 'Komunikasi email korporat', businessUnit: 'Seluruh unit', service: id(svcEmail), mtpdHours: 48, rtoHours: 8, rpoHours: 4, financialImpact: 'low', operationalImpact: 'medium', status: 'draft' });
  if (plan) {
    await make('dr-tests', { title: 'Simulasi DRP core banking semester 1', plan: id(plan), testType: 'partial_failover', scheduledDate: days(-200), coordinator: id(u.bcm._id), scenario: 'Kegagalan DC utama', targetRtoHours: 2, targetRpoHours: 0.25, actualRtoHours: 3.5, actualRpoHours: 0.4, result: 'partial', findingsSummary: 'Replikasi tertinggal 25 menit', lessonsLearned: 'Perlu monitoring lag replikasi', executedAt: days(-200), status: 'closed', approvals: [appr('BCM Coordinator', u.bcm)], approvalRound: 1, createdAt: days(-215) });
    await make('dr-tests', { title: 'Failover penuh core banking ke DRC', plan: id(plan), testType: 'full_failover', scheduledDate: days(25), coordinator: id(u.bcm._id), scenario: 'Shutdown terencana DC utama selama 4 jam', targetRtoHours: 2, targetRpoHours: 0.25, status: 'pending_approval', approvals: [appr('BCM Coordinator', u.bcm)], approvalRound: 1 });
  }

  // ---------------- Perencanaan (RPTI) ----------------
  const ini = (data) => make('initiatives', { owner: id(u.architect._id), sponsor: 'Direktur Operasional & TI', ...data });
  await ini({ title: 'Modernisasi core banking ke arsitektur microservices', category: 'transform', strategicAlignment: 5, businessValue: 5, urgency: 4, deliveryRisk: 4, estimatedCost: 25000000000, budget: id(B.cbm), project: id(project), targetQuarter: `${year}-Q1`, objective: 'Skalabilitas & time-to-market produk', businessCase: 'Penurunan biaya lisensi legacy 30%', architectureNotes: 'Selaras target state', status: 'in_execution' });
  await ini({ title: 'Zero trust network access untuk akses jarak jauh', category: 'grow', strategicAlignment: 4, businessValue: 4, urgency: 4, deliveryRisk: 2, estimatedCost: 1800000000, budget: id(B.sec), targetQuarter: `${year + 1}-Q1`, objective: 'Mengganti VPN lama', businessCase: 'Mengurangi risiko akses tidak sah', architectureNotes: 'Integrasi IdP', status: 'pending_approval', approvals: [appr('Enterprise Architect', u.architect)], approvalRound: 1 });
  await ini({ title: 'SIEM & SOC 24x7', category: 'regulatory', regulatoryDriver: 'POJK 11/2022 — ketahanan & keamanan siber', strategicAlignment: 5, businessValue: 4, urgency: 5, deliveryRisk: 3, estimatedCost: 3200000000, targetQuarter: `${year}-Q4`, objective: 'Deteksi & respons insiden 24x7', businessCase: 'Kepatuhan & penurunan dampak insiden', architectureNotes: 'Managed SOC + SIEM cloud', status: 'approved', approvals: [appr('Enterprise Architect', u.architect), appr('Finance (estimasi biaya)', u.finance), appr('IT Steering Committee', u.executive)], approvalRound: 1 });
  await ini({ title: 'Open API standar SNAP untuk mitra', category: 'regulatory', regulatoryDriver: 'Standar Nasional Open API Pembayaran (BI)', strategicAlignment: 4, businessValue: 4, urgency: 3, deliveryRisk: 3, estimatedCost: 2200000000, targetQuarter: `${year + 1}-Q2`, objective: 'Integrasi mitra fintech', businessCase: 'Pendapatan fee berbasis API', status: 'assessment' });
  await ini({ title: 'Otomasi pelaporan TI ke regulator', category: 'run', strategicAlignment: 3, businessValue: 3, urgency: 3, deliveryRisk: 2, estimatedCost: 450000000, targetQuarter: `${year + 1}-Q3`, objective: 'Mengurangi pekerjaan manual pelaporan', status: 'proposed' });
  return { vSec };
}
