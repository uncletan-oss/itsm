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

  // ---------------- E-Procurement: e-katalog, PR, RFQ/tender ----------------
  const vendor = (data) => make('vendors', { criticality: 'medium', dueDiligenceResult: 'passed', riskRating: 'low', dataLocation: 'Indonesia', status: 'active', ...data });
  const vHw = await vendor({ name: 'PT Mitra Perangkat Komputindo', category: 'hardware', contactName: 'Hendra', contactEmail: 'supplier@itsm.local', npwp: '02.345.678.9-012.000', nib: '8120009876543', phone: '021-4440987', address: 'Jl. Mangga Dua Raya No. 8, Jakarta Utara', bankName: 'Bank Mandiri', bankAccount: '1230004567890', bankAccountName: 'PT Mitra Perangkat Komputindo', certifications: ['ISO 9001'] });
  const vNet = await vendor({ name: 'PT Solusi Jaringan Prima', category: 'network', contactName: 'Yuni' });
  const vAudit = await vendor({ name: 'PT Siber Audit Indonesia', category: 'consulting', contactName: 'Fajar' });
  const fa = (data) => make('contracts', { contractType: 'msa', owner: id(u.vendor._id), startDate: days(-90), endDate: days(275), rightToAudit: true, dataLocation: 'Indonesia', status: 'active', legalNotes: 'Kontrak payung harga satuan (framework agreement)', slaTerms: 'Pengiriman sesuai lead time katalog; denda keterlambatan 1‰/hari', ...data });
  const faHw = await fa({ title: 'Kontrak payung perangkat end-user 2026–2027', vendor: id(vHw), value: 3000000000 });
  const faSoft = await fa({ title: 'Kontrak payung lisensi & subskripsi perangkat lunak', vendor: id(vSoft), contractType: 'license', value: 2000000000 });
  const published = { status: 'published', approvalRound: 1, approvals: [appr('IT Controller (kewajaran harga)', u.finance), appr('Enterprise Architect (standar teknologi)', u.architect)] };
  const cat = (data) => make('catalog-items', { unit: 'unit', minOrderQty: 1, validUntil: days(270), ...published, ...data });
  const C = {
    laptop: await cat({ name: 'Laptop standar pegawai 14" (i5, 16 GB, SSD 512 GB)', sku: 'HW-LT-STD', category: 'hardware', vendor: id(vHw), contract: id(faHw), unitPrice: 18500000, leadTimeDays: 14, tkdn: 40, warrantyMonths: 36, account: '1300', specification: 'Intel Core i5 / Ryzen 5, RAM 16 GB, SSD 512 GB, Windows 11 Pro, TPM 2.0, garansi on-site 3 tahun' }),
    laptopDev: await cat({ name: 'Laptop pengembang 16" (i7, 32 GB, SSD 1 TB)', sku: 'HW-LT-DEV', category: 'hardware', vendor: id(vHw), contract: id(faHw), unitPrice: 28000000, leadTimeDays: 21, tkdn: 35, warrantyMonths: 36, account: '1300', specification: 'Intel Core i7 / Ryzen 7, RAM 32 GB, SSD 1 TB, layar 16" QHD' }),
    monitor: await cat({ name: 'Monitor 27" QHD', sku: 'HW-MN-27', category: 'peripheral', vendor: id(vHw), contract: id(faHw), unitPrice: 3900000, leadTimeDays: 7, tkdn: 25, warrantyMonths: 36, specification: 'IPS 27", 2560×1440, USB-C 65 W', approvals: [appr('IT Controller (kewajaran harga)', u.finance)] }),
    dock: await cat({ name: 'Docking station USB-C', sku: 'HW-DK-USBC', category: 'peripheral', vendor: id(vHw), contract: id(faHw), unitPrice: 2600000, leadTimeDays: 7, warrantyMonths: 24, specification: 'Dual display, LAN gigabit, PD 100 W', approvals: [appr('IT Controller (kewajaran harga)', u.finance)] }),
    headset: await cat({ name: 'Headset call center noise-cancelling', sku: 'HW-HS-CC', category: 'peripheral', vendor: id(vHw), contract: id(faHw), unitPrice: 850000, minOrderQty: 5, leadTimeDays: 5, warrantyMonths: 12, specification: 'Binaural, USB, mikrofon noise-cancelling', approvals: [appr('IT Controller (kewajaran harga)', u.finance)] }),
    m365: await cat({ name: 'Lisensi Microsoft 365 E3 (per pengguna / tahun)', sku: 'SW-M365-E3', category: 'software', vendor: id(vSoft), contract: id(faSoft), unit: 'pengguna/tahun', unitPrice: 2000000, leadTimeDays: 2, account: '5110', specification: 'Subskripsi tahunan, termasuk Exchange, Teams, Intune' }),
    edr: await cat({ name: 'Lisensi EDR endpoint (per perangkat / tahun)', sku: 'SW-EDR', category: 'software', vendor: id(vSoft), contract: id(faSoft), unit: 'perangkat/tahun', unitPrice: 650000, minOrderQty: 10, leadTimeDays: 3, account: '5110', specification: 'Endpoint detection & response, konsol cloud region Indonesia' }),
  };
  await make('catalog-items', { name: 'Tablet operasional cabang 10"', sku: 'HW-TB-10', category: 'hardware', vendor: id(vHw), contract: id(faHw), unit: 'unit', unitPrice: 6200000, validUntil: days(270), leadTimeDays: 14, specification: 'Tablet 10", LTE, MDM-ready', status: 'pending_approval', approvalRound: 1, approvals: [appr('IT Controller (kewajaran harga)', u.finance)] });
  await make('catalog-items', { name: 'Printer laser A4 jaringan', sku: 'HW-PR-A4', category: 'peripheral', vendor: id(vHw), contract: id(faHw), unitPrice: 5400000, status: 'draft' });

  const line = (c, qty) => ({ catalogItem: id(c), vendor: id(c.vendor), sku: c.sku, description: c.name, qty, unit: c.unit, unitPrice: c.unitPrice });
  const prDone = await make('requisitions', {
    title: 'Perangkat kerja pegawai baru Divisi Digital Banking', requester: id(u.pm._id), department: 'Digital Banking', budget: id(B.infra), neededBy: days(20), deliveryLocation: 'Kantor pusat lt. 12',
    items: [line(C.laptopDev, 5), line(C.monitor, 5), line(C.dock, 5), line(C.m365, 5)], justification: 'Onboarding 5 pengembang baru program modernisasi core banking',
    status: 'approved', approvalRound: 1, createdAt: days(-5), approvals: [appr('Procurement (kebutuhan & anggaran)', u.vendor, { at: days(-4) }), appr('IT Controller (≥ Rp 100 jt)', u.finance, { at: days(-3) })],
  });
  await EFFECTS.requisitions.approved(prDone, store);
  await make('requisitions', {
    title: 'Headset & docking untuk tim service desk', requester: id(u.user._id), department: 'TI - Service Desk', approver: id(u.servicedesk._id), budget: id(B.infra), neededBy: days(10),
    items: [line(C.headset, 10), line(C.dock, 4)], justification: 'Penggantian headset rusak & penambahan agen shift malam',
    status: 'pending_approval', approvalRound: 1, approvals: [appr('Atasan pemohon', u.servicedesk)],
  });
  await make('requisitions', {
    title: 'Perangkat lab pengujian aplikasi', requester: id(u.tech._id), department: 'TI - Infrastruktur', neededBy: days(30),
    items: [line(C.laptop, 1), { description: 'Switch lab 24-port managed', qty: 2, unit: 'unit', unitPrice: 15000000 }], justification: 'Lingkungan uji terisolasi untuk regression test', status: 'draft',
  });

  // RFQ/tender: (1) sudah ditetapkan & PO terbit, (2) menunggu penetapan pemenang, (3) sedang diumumkan
  const rfq = (data) => make('rfqs', { chairman: id(u.architect._id), priceWeight: 70, minTechnicalScore: 60, evaluationCriteria: 'Kesesuaian spesifikasi 40%, pengalaman & referensi 30%, dukungan purna jual 30%', ...data });
  const quote = (r, v, price, tech, extra = {}) => make('quotations', { rfq: id(r), vendor: id(v), items: (r.items || []).map((l) => ({ description: l.description, qty: l.qty, unitPrice: price / (l.qty || 1) / (r.items.length || 1) })), taxRate: 11, technicalScore: tech, deliveryDays: 30, warrantyMonths: 36, validUntil: days(60), compliant: true, vendorReference: `SP/${v.name.split(' ')[1]}/${Math.floor(Math.random() * 900 + 100)}`, ...extra });
  const evaluate = async (r) => { await EFFECTS.rfqs.evaluation(r, store); return store.get('rfqs', id(r)); };

  let rBackup = await rfq({ title: 'Backup appliance immutable DC & DRC', method: 'limited_tender', budget: id(B.infra), hpsAmount: 800000000, closingDate: days(-40), invitedVendors: [id(vHw), id(vNet), id(vCloud)], items: [{ description: 'Backup appliance 200 TB usable + lisensi', qty: 2, unit: 'unit' }], status: 'evaluation', openedAt: days(-40), createdAt: days(-60) });
  await quote(rBackup, vHw, 690000000, 82, { submittedAt: days(-42) });
  await quote(rBackup, vNet, 720000000, 88, { submittedAt: days(-41) });
  await quote(rBackup, vCloud, 845000000, 90, { submittedAt: days(-41) });
  rBackup = await evaluate(rBackup);
  rBackup = await store.update('rfqs', id(rBackup), { status: 'awarded', evaluationNotes: 'BA evaluasi No. 07/PANITIA/2026: 3 penawaran, 1 gugur (di atas HPS)', approvalRound: 1, approvals: [appr('Ketua panitia', u.architect), appr('IT Controller (kesesuaian anggaran)', u.finance), appr('CIO / Direksi (≥ Rp 500 jt / penunjukan langsung)', u.executive)] });
  await EFFECTS.rfqs.awarded(rBackup, store);

  let rSwitch = await rfq({ title: 'Switch core data center Cikarang (HA pair)', method: 'limited_tender', budget: id(B.infra), hpsAmount: 1200000000, closingDate: days(-2), invitedVendors: [id(vNet), id(vHw), id(vSoft)], items: [{ description: 'Switch core 100G spine/leaf, HA pair, 3 tahun support', qty: 2, unit: 'unit' }], status: 'evaluation', openedAt: days(-1) });
  await quote(rSwitch, vNet, 1050000000, 86, { submittedAt: days(-3) });
  await quote(rSwitch, vHw, 980000000, 71, { submittedAt: days(-3) });
  await quote(rSwitch, vSoft, 1250000000, 80, { submittedAt: days(-2) });
  rSwitch = await evaluate(rSwitch);
  await store.update('rfqs', id(rSwitch), { status: 'pending_approval', evaluationNotes: 'Evaluasi harga 70% – teknis 30%; penawaran CV Solusi Perangkat Lunak gugur karena melebihi HPS', approvalRound: 1, approvals: [appr('Ketua panitia', u.architect)] });

  const rPentest = await rfq({ title: 'Jasa penetration test aplikasi mobile banking', method: 'rfq', budget: id(B.sec), hpsAmount: 250000000, closingDate: days(6), invitedVendors: [id(vAudit), id(vNet), id(vSoft)], items: [{ description: 'Pentest black/grey box aplikasi mobile & API', qty: 1, unit: 'paket' }], status: 'published' });
  await quote(rPentest, vAudit, 210000000, null, { technicalScore: undefined, deliveryDays: 21, warrantyMonths: 0 });
  await rfq({ title: 'Perangkat Wi-Fi kantor cabang (50 AP)', method: 'rfq', budget: id(B.infra), hpsAmount: 450000000, closingDate: days(4), invitedVendors: [id(vHw), id(vNet), id(vSoft)], items: [{ description: 'Access point Wi-Fi 6 enterprise + lisensi kontroler 3 tahun', qty: 50, unit: 'unit' }, { description: 'Jasa instalasi & site survey', qty: 1, unit: 'paket' }], status: 'published' });

  // Portal penyedia: PO pemenang tender sudah dikirim & diterima, lalu ditagih penyedia melalui portal
  const poBackup = (await store.find('purchase-orders', { rfq: id(rBackup) }))[0];
  if (poBackup) {
    await store.update('purchase-orders', id(poBackup), { status: 'received', supplierAckAt: days(-30), supplierPromisedDate: days(-15), shippedAt: days(-16), deliveryNote: 'SJ/MPK/2026/0412 — 2 unit backup appliance', receivedDate: days(-14), receivedNotes: 'BAST No. 131/IT/2026' });
    await make('invoices', { vendorInvoiceNo: 'MPK/INV/2026/0388', taxInvoiceNo: '010.000-26.00000388', purchaseOrder: id(poBackup), vendor: id(vHw), invoiceDate: days(-3), amount: 690000000, taxRate: 11, description: 'Backup appliance immutable (diajukan melalui portal penyedia)', status: 'received' });
  }
  const vNew = await make('vendors', { name: 'PT Digital Solusi Mandiri', category: 'software', npwp: '01.234.567.8-901.000', nib: '9120001234567', contactName: 'Rahmat', contactEmail: 'supplier3@itsm.local', phone: '021-5550123', address: 'Jl. Gatot Subroto No. 10, Jakarta', dataLocation: 'Indonesia', status: 'prospect', registeredVia: 'self_service', profileUpdatedAt: days(-2) });
  await rfq({ title: 'Lisensi SIEM & managed detection', method: 'direct', budget: id(B.sec), hpsAmount: 950000000, items: [{ description: 'Lisensi SIEM 1 tahun', qty: 1, unit: 'paket' }], status: 'draft', invitedVendors: [id(vSoft)], directJustification: 'Lanjutan implementasi platform yang sama (kompatibilitas teknis)' });

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
  return { vSec, vHw, vNet, vAudit, vNew };
}
