/**
 * Definisi deklaratif modul (DSL) — satu sumber untuk:
 *  - skema MongoDB (server/src/models/dynamic.js),
 *  - registry resource server & backend demo,
 *  - konfigurasi UI (field, kolom, bagian formulir, alur status).
 * Tipe field: text | textarea | number | date | datetime | select | bool | ref | refs | user | tags | lines | readonly
 */
import { ACCOUNTS, DEFAULT_TAX_RATE, round2 } from './finance.mjs';
import { riskScore } from './priority.mjs';

const o = (spec) => spec.split('|').map((p) => { const [v, l] = p.split(':'); return [v, l ?? v]; });
const SEV = o('critical:Kritis|high:Tinggi|medium:Sedang|low:Rendah');
const CAT_CATEGORY = o('hardware:Perangkat keras|software:Lisensi perangkat lunak|cloud:Layanan cloud|network:Jaringan & keamanan|services:Jasa TI|peripheral:Periferal & aksesori|consumable:Habis pakai');
const RFQ_METHOD = o('rfq:Permintaan penawaran (RFQ)|limited_tender:Tender terbatas / seleksi|open_tender:Tender terbuka|direct:Penunjukan langsung');
const LEVEL5 = o('1:1 - Sangat rendah|2:2 - Rendah|3:3 - Sedang|4:4 - Tinggi|5:5 - Sangat tinggi');
const sumLines = (lines = [], fn) => round2(lines.reduce((s, l) => s + fn(l), 0));
const withTax = (doc, base) => {
  doc.taxRate = doc.taxRate ?? DEFAULT_TAX_RATE;
  doc.taxAmount = round2((base * Number(doc.taxRate || 0)) / 100);
  doc.total = round2(base + doc.taxAmount);
};

export const MODULE_DEFS = {
  // ======================= Vendor & Keuangan TI =======================
  contracts: {
    model: 'Contract', prefix: 'CTR', label: 'Kontrak', plural: 'Kontrak Vendor', group: 'Vendor & Keuangan TI', icon: 'scroll', titleField: 'title',
    description: 'Siklus kontrak penyedia jasa TI: review legal, persetujuan berjenjang, aktif, perpanjangan, hingga pengakhiran (POJK 11/2022, PADK 1/2026).',
    columns: ['number', 'title', 'vendor', 'contractType', 'value', 'endDate', 'status'],
    search: ['number', 'title'],
    permissions: { read: ['vendor_manager', 'risk_officer', 'finance_manager', 'executive', 'auditor', 'security_officer', 'project_manager', 'asset_manager', 'accountant'], write: ['vendor_manager'] },
    fields: [
      { key: 'title', label: 'Judul kontrak', type: 'text', required: true, full: true },
      { key: 'vendor', label: 'Vendor', type: 'ref', resource: 'vendors', required: true },
      { key: 'contractType', label: 'Jenis kontrak', type: 'select', options: o('msa:Master Service Agreement|sla:Service Level Agreement|license:Lisensi|maintenance:Pemeliharaan|cloud:Layanan Cloud|outsourcing:Alih daya TI|nda:NDA') },
      { key: 'owner', label: 'Pemilik kontrak', type: 'user' },
      { key: 'value', label: 'Nilai kontrak (Rp)', type: 'number' },
      { key: 'startDate', label: 'Mulai', type: 'date' },
      { key: 'endDate', label: 'Berakhir', type: 'date' },
      { key: 'noticeDays', label: 'Pemberitahuan perpanjangan (hari)', type: 'number', default: 90 },
      { key: 'autoRenew', label: 'Perpanjangan otomatis', type: 'bool' },
      { key: 'material', label: 'Alih daya material (wajib lapor regulator)', type: 'bool' },
      { key: 'regulatorReportedAt', label: 'Dilaporkan ke regulator', type: 'date' },
      { key: 'rightToAudit', label: 'Klausul hak audit', type: 'bool' },
      { key: 'dataLocation', label: 'Lokasi data', type: 'text', default: 'Indonesia' },
      { key: 'slaTerms', label: 'Ketentuan SLA & penalti', type: 'textarea', full: true },
      { key: 'legalNotes', label: 'Catatan review legal', type: 'textarea', full: true },
      { key: 'exitClause', label: 'Klausul exit / transisi', type: 'textarea', full: true },
      { key: 'documentUrl', label: 'Tautan dokumen', type: 'text', full: true },
    ],
    initial: 'draft',
    statusFlow: ['draft', 'legal_review', 'pending_approval', 'active', 'renewal_review', 'expired'],
    workflow: {
      transitions: {
        draft: ['legal_review', 'cancelled'], legal_review: ['pending_approval', 'draft'], pending_approval: ['active', 'rejected'],
        rejected: ['draft'], active: ['renewal_review', 'terminated', 'expired'], renewal_review: ['active', 'expired', 'terminated'],
        expired: [], terminated: [], cancelled: [],
      },
      required: {
        legal_review: [['vendor', 'Vendor'], ['value', 'Nilai'], ['startDate', 'Mulai'], ['endDate', 'Berakhir']],
        pending_approval: [['legalNotes', 'Catatan review legal'], ['slaTerms', 'Ketentuan SLA']],
        terminated: [['exitClause', 'Klausul exit']],
      },
    },
    transitionFields: { pending_approval: ['legalNotes', 'slaTerms'], terminated: ['exitClause'] },
  },
  budgets: {
    model: 'Budget', prefix: 'BGT', label: 'Anggaran', plural: 'Anggaran TI', group: 'Vendor & Keuangan TI', icon: 'wallet', titleField: 'name',
    description: 'Perencanaan & pengendalian anggaran TI (CAPEX/OPEX, Run-Grow-Transform) dengan persetujuan Controller & CIO; realisasi terhitung otomatis dari PO & tagihan.',
    columns: ['number', 'name', 'fiscalYear', 'category', 'amount', 'committedAmount', 'actualAmount', 'availableAmount', 'status'],
    search: ['number', 'name', 'costCenter'],
    permissions: { read: ['finance_manager', 'accountant', 'treasurer', 'executive', 'vendor_manager', 'project_manager', 'auditor'], write: ['finance_manager'] },
    fields: [
      { key: 'name', label: 'Nama mata anggaran', type: 'text', required: true, full: true },
      { key: 'fiscalYear', label: 'Tahun anggaran', type: 'number', required: true },
      { key: 'costCenter', label: 'Cost center', type: 'text' },
      { key: 'category', label: 'Kategori', type: 'select', options: o('opex:OPEX|capex:CAPEX'), default: 'opex' },
      { key: 'portfolio', label: 'Portofolio (Run-Grow-Transform)', type: 'select', options: o('run:Run the business|grow:Grow the business|transform:Transform the business'), default: 'run' },
      { key: 'account', label: 'Akun beban/aset default', type: 'select', options: ACCOUNTS },
      { key: 'owner', label: 'Pemilik anggaran', type: 'user' },
      { key: 'amount', label: 'Pagu anggaran (Rp)', type: 'number', required: true },
      { key: 'committedAmount', label: 'Terkomitmen (PO)', type: 'readonly', store: 'number', format: 'money' },
      { key: 'actualAmount', label: 'Realisasi (tagihan)', type: 'readonly', store: 'number', format: 'money' },
      { key: 'availableAmount', label: 'Sisa tersedia', type: 'readonly', store: 'number', format: 'money' },
      { key: 'justification', label: 'Justifikasi', type: 'textarea', full: true },
    ],
    initial: 'draft',
    statusFlow: ['draft', 'pending_approval', 'active', 'closed'],
    workflow: {
      transitions: { draft: ['pending_approval'], pending_approval: ['active', 'rejected'], rejected: ['draft'], active: ['closed'], closed: [] },
      required: { pending_approval: [['amount', 'Pagu'], ['justification', 'Justifikasi'], ['owner', 'Pemilik']] },
    },
    compute: (d) => { d.availableAmount = round2((d.amount || 0) - (d.committedAmount || 0)); },
  },
  // ======================= E-Procurement =======================
  'catalog-items': {
    model: 'CatalogItem', prefix: 'CAT', label: 'Item Katalog', plural: 'E-Katalog', group: 'E-Procurement', icon: 'grid', titleField: 'name',
    description: 'Katalog elektronik barang/jasa TI berdasarkan kontrak payung (framework agreement): harga terkunci, validasi harga oleh Controller & standar teknologi oleh arsitek sebelum tayang.',
    columns: ['number', 'name', 'category', 'vendor', 'unitPrice', 'unit', 'validUntil', 'status'],
    search: ['number', 'name', 'sku', 'specification'],
    permissions: { read: ['*'], write: ['vendor_manager'] },
    fields: [
      { key: 'name', label: 'Nama barang/jasa', type: 'text', required: true, full: true },
      { key: 'sku', label: 'SKU / kode katalog', type: 'text' },
      { key: 'category', label: 'Kategori', type: 'select', options: CAT_CATEGORY, default: 'hardware' },
      { key: 'vendor', label: 'Penyedia', type: 'ref', resource: 'vendors', required: true },
      { key: 'contract', label: 'Kontrak payung', type: 'ref', resource: 'contracts' },
      { key: 'unit', label: 'Satuan', type: 'text', default: 'unit' },
      { key: 'unitPrice', label: 'Harga satuan kontrak (Rp, sebelum PPN)', type: 'number', required: true },
      { key: 'minOrderQty', label: 'Minimum pemesanan', type: 'number', default: 1 },
      { key: 'leadTimeDays', label: 'Waktu kirim (hari)', type: 'number' },
      { key: 'validUntil', label: 'Harga berlaku s.d.', type: 'date' },
      { key: 'tkdn', label: 'TKDN (%)', type: 'number' },
      { key: 'warrantyMonths', label: 'Garansi (bulan)', type: 'number' },
      { key: 'account', label: 'Akun pembebanan', type: 'select', options: ACCOUNTS },
      { key: 'specification', label: 'Spesifikasi', type: 'textarea', full: true },
    ],
    initial: 'draft',
    statusFlow: ['draft', 'pending_approval', 'published'],
    workflow: {
      transitions: {
        draft: ['pending_approval', 'retired'], pending_approval: ['published', 'rejected'], rejected: ['draft'],
        published: ['draft', 'suspended', 'retired'], suspended: ['draft', 'retired'], retired: [],
      },
      required: { pending_approval: [['contract', 'Kontrak payung'], ['validUntil', 'Masa berlaku harga'], ['specification', 'Spesifikasi']] },
    },
  },
  requisitions: {
    model: 'Requisition', prefix: 'PR', label: 'Permintaan Pembelian', plural: 'Permintaan Pembelian', group: 'E-Procurement', icon: 'basket', titleField: 'title',
    description: 'Purchase requisition dari keranjang e-katalog atau kebutuhan non-katalog: persetujuan atasan, procurement & controller; item katalog otomatis menjadi PO per penyedia, item non-katalog otomatis menjadi RFQ/tender.',
    columns: ['number', 'title', 'requester', 'subtotal', 'neededBy', 'status'],
    search: ['number', 'title', 'department'],
    permissions: { read: ['*'], create: ['*'], write: ['vendor_manager'] },
    ownScope: true,
    fields: [
      { key: 'title', label: 'Keperluan', type: 'text', required: true, full: true },
      { key: 'requester', label: 'Pemohon', type: 'user' },
      { key: 'department', label: 'Unit kerja', type: 'text' },
      { key: 'approver', label: 'Atasan penyetuju', type: 'user' },
      { key: 'budget', label: 'Mata anggaran', type: 'ref', resource: 'budgets' },
      { key: 'neededBy', label: 'Dibutuhkan tanggal', type: 'date' },
      { key: 'deliveryLocation', label: 'Lokasi pengiriman', type: 'text' },
      { key: 'items', label: 'Rincian kebutuhan', type: 'lines', full: true, lines: [
        { key: 'catalogItem', type: 'text', hidden: true }, { key: 'vendor', type: 'text', hidden: true },
        { key: 'sku', label: 'SKU', type: 'text' }, { key: 'description', label: 'Barang/jasa', type: 'text' }, { key: 'qty', label: 'Qty', type: 'number' },
        { key: 'unit', label: 'Satuan', type: 'text' }, { key: 'unitPrice', label: 'Harga/estimasi satuan', type: 'number' },
      ] },
      { key: 'catalogTotal', label: 'Nilai item katalog', type: 'readonly', store: 'number', format: 'money' },
      { key: 'nonCatalogTotal', label: 'Estimasi item non-katalog', type: 'readonly', store: 'number', format: 'money' },
      { key: 'subtotal', label: 'Estimasi total (sebelum PPN)', type: 'readonly', store: 'number', format: 'money' },
      { key: 'justification', label: 'Justifikasi kebutuhan', type: 'textarea', full: true },
      { key: 'processingNotes', label: 'Hasil pemrosesan', type: 'readonly', store: 'string', full: true },
    ],
    initial: 'draft',
    statusFlow: ['draft', 'pending_approval', 'approved', 'in_procurement', 'completed'],
    workflow: {
      transitions: {
        draft: ['pending_approval', 'cancelled'], pending_approval: ['approved', 'rejected'], rejected: ['draft', 'cancelled'],
        approved: ['in_procurement'], in_procurement: ['completed'], completed: [], cancelled: [],
      },
      required: { pending_approval: [['justification', 'Justifikasi'], ['subtotal', 'Rincian kebutuhan']] },
      canOwner: ['pending_approval', 'cancelled', 'draft'],
      viaEffect: ['in_procurement'],
    },
    sections: [['Permintaan', ['title', 'requester', 'department', 'approver', 'budget', 'neededBy', 'deliveryLocation', 'justification']], ['Rincian', ['items', 'catalogTotal', 'nonCatalogTotal', 'subtotal', 'processingNotes']]],
    compute: (d) => {
      const val = (l) => Number(l.qty || 0) * Number(l.unitPrice || 0);
      d.catalogTotal = sumLines((d.items || []).filter((l) => l.catalogItem), val);
      d.nonCatalogTotal = sumLines((d.items || []).filter((l) => !l.catalogItem), val);
      d.subtotal = round2(d.catalogTotal + d.nonCatalogTotal);
    },
  },
  rfqs: {
    model: 'Rfq', prefix: 'RFQ', label: 'RFQ / Tender', plural: 'RFQ & Tender', group: 'E-Procurement', icon: 'gavel', titleField: 'title',
    description: 'Pemilihan penyedia secara kompetitif: undangan (min. 3 penyedia, penunjukan langsung wajib justifikasi), HPS, batas waktu, pembukaan penawaran, evaluasi harga–teknis berbobot, persetujuan pemenang oleh panitia & PO otomatis.',
    columns: ['number', 'title', 'method', 'hpsAmount', 'closingDate', 'quotationCount', 'recommendedAmount', 'status'],
    search: ['number', 'title'],
    permissions: { read: ['vendor_manager', 'finance_manager', 'executive', 'auditor', 'project_manager', 'asset_manager', 'risk_officer', 'architect'], write: ['vendor_manager'] },
    fields: [
      { key: 'title', label: 'Paket pengadaan', type: 'text', required: true, full: true },
      { key: 'method', label: 'Metode pemilihan', type: 'select', options: RFQ_METHOD, default: 'rfq' },
      { key: 'requisition', label: 'Permintaan pembelian', type: 'ref', resource: 'requisitions' },
      { key: 'budget', label: 'Mata anggaran', type: 'ref', resource: 'budgets', required: true },
      { key: 'chairman', label: 'Ketua panitia / pejabat pengadaan', type: 'user' },
      { key: 'hpsAmount', label: 'HPS / owner estimate (Rp, sebelum PPN)', type: 'number', required: true },
      { key: 'closingDate', label: 'Batas pemasukan penawaran', type: 'datetime' },
      { key: 'invitedVendors', label: 'Penyedia diundang', type: 'refs', resource: 'vendors', full: true },
      { key: 'items', label: 'Lingkup & kuantitas', type: 'lines', full: true, lines: [
        { key: 'description', label: 'Barang/jasa', type: 'text' }, { key: 'qty', label: 'Qty', type: 'number' }, { key: 'unit', label: 'Satuan', type: 'text' },
      ] },
      { key: 'priceWeight', label: 'Bobot harga (%)', type: 'number', default: 70 },
      { key: 'technicalWeight', label: 'Bobot teknis (%)', type: 'readonly', store: 'number', format: 'percent' },
      { key: 'minTechnicalScore', label: 'Ambang lulus teknis', type: 'number', default: 60 },
      { key: 'evaluationCriteria', label: 'Kriteria evaluasi teknis', type: 'textarea', full: true },
      { key: 'directJustification', label: 'Justifikasi penunjukan langsung', type: 'textarea', full: true },
      { key: 'quotationCount', label: 'Penawaran masuk', type: 'readonly', store: 'number' },
      { key: 'recommendedQuotation', label: 'Usulan pemenang', type: 'readonly', store: 'ref', resource: 'quotations' },
      { key: 'recommendedVendor', label: 'Penyedia usulan', type: 'readonly', store: 'ref', resource: 'vendors' },
      { key: 'recommendedAmount', label: 'Nilai penawaran usulan', type: 'readonly', store: 'number', format: 'money' },
      { key: 'savingsAmount', label: 'Penghematan vs HPS', type: 'readonly', store: 'number', format: 'money' },
      { key: 'savingsPct', label: 'Penghematan (%)', type: 'readonly', store: 'number', format: 'percent' },
      { key: 'evaluationNotes', label: 'Berita acara evaluasi', type: 'textarea', full: true },
      { key: 'openedAt', label: 'Penawaran dibuka', type: 'readonly', store: 'date', format: 'datetime' },
      { key: 'purchaseOrder', label: 'PO diterbitkan', type: 'readonly', store: 'ref', resource: 'purchase-orders' },
    ],
    initial: 'draft',
    statusFlow: ['draft', 'published', 'evaluation', 'pending_approval', 'awarded'],
    workflow: {
      transitions: {
        draft: ['published', 'cancelled'], published: ['evaluation', 'cancelled'], evaluation: ['pending_approval', 'failed'],
        pending_approval: ['awarded', 'evaluation'], failed: ['draft', 'cancelled'], awarded: [], cancelled: [],
      },
      required: {
        published: [['closingDate', 'Batas pemasukan penawaran'], ['evaluationCriteria', 'Kriteria evaluasi']],
        pending_approval: [['evaluationNotes', 'Berita acara evaluasi']],
      },
      stamp: { evaluation: 'openedAt' },
    },
    transitionFields: { published: ['closingDate', 'evaluationCriteria', 'invitedVendors', 'directJustification'], pending_approval: ['evaluationNotes'] },
    sections: [
      ['Paket', ['title', 'method', 'requisition', 'budget', 'chairman', 'hpsAmount', 'closingDate', 'items']],
      ['Undangan & evaluasi', ['invitedVendors', 'directJustification', 'priceWeight', 'technicalWeight', 'minTechnicalScore', 'evaluationCriteria']],
      ['Hasil', ['openedAt', 'quotationCount', 'recommendedQuotation', 'recommendedVendor', 'recommendedAmount', 'savingsAmount', 'savingsPct', 'evaluationNotes', 'purchaseOrder']],
    ],
    compute: (d) => {
      d.priceWeight = Math.min(Math.max(Number(d.priceWeight ?? 70), 0), 100);
      d.technicalWeight = 100 - d.priceWeight;
    },
  },
  quotations: {
    model: 'Quotation', prefix: 'QUO', label: 'Penawaran', plural: 'Penawaran Vendor', group: 'E-Procurement', icon: 'inbox', titleField: 'number',
    description: 'Penawaran penyedia atas RFQ/tender: harga per item, waktu kirim & garansi; setelah pembukaan, harga terkunci dan skor harga, teknis, total & peringkat dihitung otomatis.',
    columns: ['number', 'rfq', 'vendor', 'subtotal', 'technicalScore', 'totalScore', 'rank', 'status'],
    search: ['number', 'vendorReference'],
    defaultSort: '-totalScore -createdAt',
    permissions: { read: ['vendor_manager', 'finance_manager', 'executive', 'auditor', 'project_manager', 'asset_manager', 'risk_officer', 'architect'], write: ['vendor_manager'] },
    fields: [
      { key: 'rfq', label: 'RFQ / tender', type: 'ref', resource: 'rfqs', required: true },
      { key: 'vendor', label: 'Penyedia', type: 'ref', resource: 'vendors', required: true },
      { key: 'vendorReference', label: 'No. surat penawaran', type: 'text' },
      { key: 'submittedAt', label: 'Diterima', type: 'datetime' },
      { key: 'items', label: 'Rincian harga', type: 'lines', full: true, lines: [
        { key: 'description', label: 'Barang/jasa', type: 'text' }, { key: 'qty', label: 'Qty', type: 'number' }, { key: 'unitPrice', label: 'Harga satuan', type: 'number' },
      ] },
      { key: 'subtotal', label: 'Harga penawaran (sebelum PPN)', type: 'readonly', store: 'number', format: 'money' },
      { key: 'taxRate', label: 'PPN (%)', type: 'number', default: DEFAULT_TAX_RATE },
      { key: 'taxAmount', label: 'PPN', type: 'readonly', store: 'number', format: 'money' },
      { key: 'total', label: 'Total', type: 'readonly', store: 'number', format: 'money' },
      { key: 'deliveryDays', label: 'Waktu penyerahan (hari)', type: 'number' },
      { key: 'warrantyMonths', label: 'Garansi (bulan)', type: 'number' },
      { key: 'validUntil', label: 'Masa berlaku penawaran', type: 'date' },
      { key: 'compliant', label: 'Administrasi lengkap & memenuhi syarat', type: 'bool', default: true },
      { key: 'technicalScore', label: 'Nilai teknis (0–100)', type: 'number' },
      { key: 'technicalNotes', label: 'Catatan evaluasi teknis', type: 'textarea', full: true },
      { key: 'priceScore', label: 'Skor harga', type: 'readonly', store: 'number' },
      { key: 'totalScore', label: 'Skor akhir', type: 'readonly', store: 'number' },
      { key: 'rank', label: 'Peringkat', type: 'readonly', store: 'number' },
      { key: 'evaluationResult', label: 'Hasil evaluasi', type: 'readonly', store: 'string', full: true },
      { key: 'documentUrl', label: 'Tautan dokumen penawaran', type: 'text', full: true },
    ],
    initial: 'submitted',
    statusFlow: ['submitted', 'evaluated', 'awarded'],
    workflow: {
      transitions: {
        submitted: ['evaluated', 'withdrawn', 'disqualified'], evaluated: ['awarded', 'lost', 'disqualified'],
        disqualified: [], withdrawn: [], awarded: [], lost: [],
      },
      required: { disqualified: [['technicalNotes', 'Alasan diskualifikasi']] },
      viaEffect: ['evaluated', 'awarded', 'lost'],
    },
    transitionFields: { disqualified: ['technicalNotes'] },
    compute: (d) => {
      d.subtotal = sumLines(d.items, (l) => Number(l.qty || 0) * Number(l.unitPrice || 0));
      withTax(d, d.subtotal);
      if (!d.submittedAt) d.submittedAt = new Date().toISOString();
    },
  },
  'purchase-orders': {
    model: 'PurchaseOrder', prefix: 'PO', label: 'Purchase Order', plural: 'Purchase Order', group: 'E-Procurement', icon: 'cart', titleField: 'title',
    description: 'Procure-to-pay: PO dengan kontrol ketersediaan anggaran (commitment control), persetujuan berjenjang sesuai nilai, pemesanan & penerimaan barang/jasa.',
    columns: ['number', 'title', 'vendor', 'budget', 'total', 'status', 'neededBy'],
    search: ['number', 'title'],
    permissions: { read: ['vendor_manager', 'finance_manager', 'accountant', 'executive', 'asset_manager', 'project_manager', 'auditor'], write: ['vendor_manager', 'asset_manager', 'project_manager'] },
    fields: [
      { key: 'title', label: 'Judul pengadaan', type: 'text', required: true, full: true },
      { key: 'vendor', label: 'Vendor', type: 'ref', resource: 'vendors', required: true },
      { key: 'contract', label: 'Kontrak', type: 'ref', resource: 'contracts' },
      { key: 'budget', label: 'Mata anggaran', type: 'ref', resource: 'budgets', required: true },
      { key: 'sourcing', label: 'Metode pengadaan', type: 'select', options: o('catalog:E-katalog|rfq:RFQ|limited_tender:Tender terbatas|open_tender:Tender terbuka|direct:Penunjukan langsung|contract:Kontrak berjalan'), default: 'contract' },
      { key: 'requisition', label: 'Permintaan pembelian', type: 'ref', resource: 'requisitions' },
      { key: 'rfq', label: 'RFQ / tender', type: 'ref', resource: 'rfqs' },
      { key: 'requester', label: 'Pemohon', type: 'user' },
      { key: 'neededBy', label: 'Dibutuhkan tanggal', type: 'date' },
      { key: 'items', label: 'Rincian barang/jasa', type: 'lines', full: true, lines: [
        { key: 'description', label: 'Deskripsi', type: 'text' }, { key: 'qty', label: 'Qty', type: 'number' }, { key: 'unitPrice', label: 'Harga satuan', type: 'number' },
      ] },
      { key: 'subtotal', label: 'Subtotal', type: 'readonly', store: 'number', format: 'money' },
      { key: 'taxRate', label: 'PPN (%)', type: 'number', default: DEFAULT_TAX_RATE },
      { key: 'taxAmount', label: 'PPN', type: 'readonly', store: 'number', format: 'money' },
      { key: 'total', label: 'Total', type: 'readonly', store: 'number', format: 'money' },
      { key: 'justification', label: 'Justifikasi kebutuhan', type: 'textarea', full: true },
      { key: 'receivedDate', label: 'Tanggal diterima', type: 'date' },
      { key: 'receivedNotes', label: 'Berita acara penerimaan', type: 'textarea', full: true },
    ],
    initial: 'draft',
    statusFlow: ['draft', 'pending_approval', 'approved', 'ordered', 'received', 'closed'],
    workflow: {
      transitions: {
        draft: ['pending_approval', 'cancelled'], pending_approval: ['approved', 'rejected'], rejected: ['draft'],
        approved: ['ordered', 'cancelled'], ordered: ['received', 'cancelled'], received: ['closed'], closed: [], cancelled: [],
      },
      required: { pending_approval: [['justification', 'Justifikasi'], ['total', 'Rincian & total']], received: [['receivedDate', 'Tanggal diterima'], ['receivedNotes', 'Berita acara penerimaan']] },
    },
    transitionFields: { received: ['receivedDate', 'receivedNotes'] },
    compute: (d) => {
      d.subtotal = sumLines(d.items, (l) => Number(l.qty || 0) * Number(l.unitPrice || 0));
      withTax(d, d.subtotal);
    },
  },
  invoices: {
    model: 'Invoice', prefix: 'INV', label: 'Tagihan', plural: 'Tagihan Vendor', group: 'Vendor & Keuangan TI', icon: 'receipt', titleField: 'vendorInvoiceNo',
    description: 'Accounts payable: verifikasi 3-way match (PO–penerimaan–tagihan), persetujuan, jurnal otomatis, dan status pembayaran.',
    columns: ['number', 'vendorInvoiceNo', 'vendor', 'purchaseOrder', 'total', 'dueDate', 'status'],
    search: ['number', 'vendorInvoiceNo', 'taxInvoiceNo'],
    permissions: { read: ['accountant', 'finance_manager', 'treasurer', 'vendor_manager', 'executive', 'auditor'], write: ['accountant'] },
    fields: [
      { key: 'vendorInvoiceNo', label: 'No. invoice vendor', type: 'text', required: true },
      { key: 'taxInvoiceNo', label: 'No. faktur pajak', type: 'text' },
      { key: 'purchaseOrder', label: 'Purchase order', type: 'ref', resource: 'purchase-orders', required: true },
      { key: 'vendor', label: 'Vendor', type: 'ref', resource: 'vendors' },
      { key: 'invoiceDate', label: 'Tanggal invoice', type: 'date' },
      { key: 'dueDate', label: 'Jatuh tempo', type: 'date' },
      { key: 'amount', label: 'Nilai sebelum pajak (Rp)', type: 'number', required: true },
      { key: 'taxRate', label: 'PPN (%)', type: 'number', default: DEFAULT_TAX_RATE },
      { key: 'taxAmount', label: 'PPN', type: 'readonly', store: 'number', format: 'money' },
      { key: 'total', label: 'Total tagihan', type: 'readonly', store: 'number', format: 'money' },
      { key: 'paidAmount', label: 'Sudah dibayar', type: 'readonly', store: 'number', format: 'money' },
      { key: 'account', label: 'Akun pembebanan', type: 'select', options: ACCOUNTS },
      { key: 'matchResult', label: 'Hasil 3-way match', type: 'readonly', store: 'string' },
      { key: 'description', label: 'Keterangan', type: 'textarea', full: true },
      { key: 'disputeReason', label: 'Alasan sengketa', type: 'textarea', full: true },
    ],
    initial: 'received',
    statusFlow: ['received', 'verified', 'pending_approval', 'approved', 'paid'],
    workflow: {
      transitions: {
        received: ['verified', 'disputed', 'cancelled'], verified: ['pending_approval', 'disputed'], disputed: ['received', 'cancelled'],
        pending_approval: ['approved', 'rejected'], rejected: ['received'], approved: ['paid'], paid: [], cancelled: [],
      },
      required: { verified: [['invoiceDate', 'Tanggal invoice'], ['dueDate', 'Jatuh tempo']], disputed: [['disputeReason', 'Alasan sengketa']] },
      viaEffect: ['paid'],
    },
    transitionFields: { verified: ['invoiceDate', 'dueDate', 'account'], disputed: ['disputeReason'] },
    compute: (d) => withTax(d, Number(d.amount || 0)),
  },
  payments: {
    model: 'Payment', prefix: 'PAY', label: 'Pembayaran', plural: 'Pembayaran', group: 'Vendor & Keuangan TI', icon: 'card', titleField: 'number',
    description: 'Pembayaran tagihan dengan maker-checker (pembuat ≠ penyetuju), eksekusi oleh treasury, jurnal otomatis & rekonsiliasi bank.',
    columns: ['number', 'invoice', 'amount', 'method', 'paymentDate', 'status'],
    search: ['number', 'reference'],
    permissions: { read: ['treasurer', 'accountant', 'finance_manager', 'executive', 'auditor'], write: ['accountant', 'treasurer'] },
    fields: [
      { key: 'invoice', label: 'Tagihan', type: 'ref', resource: 'invoices', required: true },
      { key: 'amount', label: 'Jumlah dibayar (Rp)', type: 'number', required: true },
      { key: 'paymentDate', label: 'Tanggal bayar', type: 'date' },
      { key: 'method', label: 'Metode', type: 'select', options: o('transfer:Transfer bank|rtgs:RTGS|skn:SKN / BI-FAST|giro:Giro|va:Virtual account'), default: 'transfer' },
      { key: 'bankAccount', label: 'Rekening sumber', type: 'text' },
      { key: 'reference', label: 'No. referensi bank', type: 'text' },
      { key: 'reconciledAt', label: 'Direkonsiliasi', type: 'date' },
      { key: 'notes', label: 'Catatan', type: 'textarea', full: true },
    ],
    initial: 'draft',
    statusFlow: ['draft', 'pending_approval', 'approved', 'executed', 'reconciled'],
    workflow: {
      transitions: {
        draft: ['pending_approval', 'cancelled'], pending_approval: ['approved', 'rejected'], rejected: ['draft'],
        approved: ['executed', 'cancelled'], executed: ['reconciled'], reconciled: [], cancelled: [],
      },
      required: { pending_approval: [['paymentDate', 'Tanggal bayar']], executed: [['reference', 'No. referensi bank']], reconciled: [['reconciledAt', 'Tanggal rekonsiliasi']] },
      roles: { executed: ['treasurer'], reconciled: ['accountant', 'treasurer'] },
    },
    transitionFields: { executed: ['reference', 'bankAccount'], reconciled: ['reconciledAt'] },
  },
  journals: {
    model: 'Journal', prefix: 'JRN', label: 'Jurnal', plural: 'Jurnal Akuntansi', group: 'Vendor & Keuangan TI', icon: 'ledger', titleField: 'description',
    description: 'Buku besar TI: jurnal otomatis dari tagihan & pembayaran, jurnal manual dengan persetujuan, validasi debit = kredit, dan jurnal balik.',
    columns: ['number', 'date', 'description', 'source', 'totalDebit', 'status'],
    search: ['number', 'description', 'sourceRef'],
    defaultSort: '-date -createdAt',
    permissions: { read: ['accountant', 'finance_manager', 'treasurer', 'auditor', 'executive'], write: ['accountant'] },
    fields: [
      { key: 'date', label: 'Tanggal', type: 'date', required: true },
      { key: 'description', label: 'Keterangan', type: 'text', required: true, full: true },
      { key: 'source', label: 'Sumber', type: 'select', options: o('manual:Manual|invoice:Tagihan|payment:Pembayaran|reversal:Jurnal balik|adjustment:Penyesuaian'), default: 'manual' },
      { key: 'sourceRef', label: 'Referensi sumber', type: 'text' },
      { key: 'lines', label: 'Baris jurnal', type: 'lines', full: true, lines: [
        { key: 'account', label: 'Akun', type: 'select', options: ACCOUNTS }, { key: 'memo', label: 'Memo', type: 'text' },
        { key: 'debit', label: 'Debit', type: 'number' }, { key: 'credit', label: 'Kredit', type: 'number' },
      ] },
      { key: 'totalDebit', label: 'Total debit', type: 'readonly', store: 'number', format: 'money' },
      { key: 'totalCredit', label: 'Total kredit', type: 'readonly', store: 'number', format: 'money' },
      { key: 'period', label: 'Periode', type: 'readonly', store: 'string' },
    ],
    initial: 'draft',
    statusFlow: ['draft', 'pending_approval', 'posted'],
    workflow: {
      transitions: { draft: ['pending_approval', 'cancelled'], pending_approval: ['posted', 'rejected'], rejected: ['draft'], posted: ['reversed'], reversed: [], cancelled: [] },
      roles: { reversed: ['finance_manager'] },
    },
    compute: (d) => {
      d.totalDebit = sumLines(d.lines, (l) => Number(l.debit || 0));
      d.totalCredit = sumLines(d.lines, (l) => Number(l.credit || 0));
      if (d.date) d.period = new Date(d.date).toISOString().slice(0, 7);
    },
  },

  // ======================= GRC & Assurance =======================
  'risk-actions': {
    model: 'RiskAction', prefix: 'RMA', label: 'Tindakan Mitigasi', plural: 'Mitigasi Risiko', group: 'GRC & Assurance', icon: 'target', titleField: 'title',
    description: 'Rencana aksi penanganan risiko & remediasi temuan: pelaksanaan oleh pemilik, bukti penyelesaian, lalu verifikasi independen.',
    columns: ['number', 'title', 'risk', 'finding', 'owner', 'dueDate', 'status'],
    search: ['number', 'title'],
    permissions: { read: ['risk_officer', 'security_officer', 'auditor', 'executive', 'technician', 'asset_manager', 'vendor_manager', 'architect', 'bcm_manager', 'dc_manager'], write: ['risk_officer', 'security_officer', 'technician', 'asset_manager', 'vendor_manager', 'bcm_manager', 'dc_manager'] },
    fields: [
      { key: 'title', label: 'Tindakan', type: 'text', required: true, full: true },
      { key: 'risk', label: 'Risiko', type: 'ref', resource: 'risks' },
      { key: 'finding', label: 'Temuan', type: 'ref', resource: 'findings' },
      { key: 'actionType', label: 'Jenis kontrol', type: 'select', options: o('preventive:Preventif|detective:Detektif|corrective:Korektif|transfer:Transfer (asuransi/kontrak)'), default: 'preventive' },
      { key: 'owner', label: 'Penanggung jawab', type: 'user', required: true },
      { key: 'dueDate', label: 'Target selesai', type: 'date', required: true },
      { key: 'description', label: 'Rincian tindakan', type: 'textarea', full: true },
      { key: 'completionEvidence', label: 'Bukti penyelesaian', type: 'textarea', full: true },
      { key: 'verificationNotes', label: 'Catatan verifikasi', type: 'textarea', full: true },
      { key: 'completedAt', label: 'Selesai', type: 'readonly', store: 'date', format: 'date' },
      { key: 'verifiedBy', label: 'Diverifikasi oleh', type: 'readonly', store: 'user', format: 'user' },
    ],
    initial: 'open',
    statusFlow: ['open', 'in_progress', 'completed', 'verified'],
    workflow: {
      transitions: { open: ['in_progress', 'cancelled'], in_progress: ['completed'], completed: ['verified', 'in_progress'], verified: [], cancelled: [] },
      required: { completed: [['completionEvidence', 'Bukti penyelesaian']], verified: [['verificationNotes', 'Catatan verifikasi']] },
      roles: { verified: ['risk_officer', 'security_officer', 'auditor'] },
      sod: { verified: ['owner'] },
      stamp: { completed: 'completedAt', verified: 'verifiedBy' },
    },
    transitionFields: { completed: ['completionEvidence'], verified: ['verificationNotes'] },
  },
  'control-tests': {
    model: 'ControlTest', prefix: 'CTT', label: 'Pengujian Kontrol', plural: 'Pengujian Kontrol', group: 'GRC & Assurance', icon: 'clipboard', titleField: 'title',
    description: 'Assurance: uji desain & efektivitas operasional kontrol, review independen; hasil memperbarui status kontrol dan otomatis menerbitkan temuan bila tidak efektif.',
    columns: ['number', 'title', 'control', 'testType', 'tester', 'conclusion', 'status'],
    search: ['number', 'title', 'period'],
    permissions: { read: ['risk_officer', 'security_officer', 'auditor', 'executive'], write: ['risk_officer', 'security_officer', 'auditor'] },
    fields: [
      { key: 'title', label: 'Judul pengujian', type: 'text', required: true, full: true },
      { key: 'control', label: 'Kontrol', type: 'ref', resource: 'controls', required: true },
      { key: 'testType', label: 'Jenis uji', type: 'select', options: o('design:Test of design|operating:Test of operating effectiveness'), default: 'operating' },
      { key: 'period', label: 'Periode diuji', type: 'text' },
      { key: 'tester', label: 'Penguji', type: 'user' },
      { key: 'plannedDate', label: 'Rencana tanggal', type: 'date' },
      { key: 'sampleSize', label: 'Jumlah sampel', type: 'number' },
      { key: 'procedure', label: 'Prosedur pengujian', type: 'textarea', full: true },
      { key: 'results', label: 'Hasil & observasi', type: 'textarea', full: true },
      { key: 'conclusion', label: 'Kesimpulan', type: 'select', options: o(':-|effective:Efektif|partially_effective:Efektif sebagian|ineffective:Tidak efektif') },
      { key: 'evidenceUrl', label: 'Tautan kertas kerja / bukti', type: 'text', full: true },
    ],
    initial: 'planned',
    statusFlow: ['planned', 'in_progress', 'pending_approval', 'concluded'],
    workflow: {
      transitions: { planned: ['in_progress', 'cancelled'], in_progress: ['pending_approval'], pending_approval: ['concluded', 'in_progress'], concluded: [], cancelled: [] },
      required: { in_progress: [['tester', 'Penguji'], ['procedure', 'Prosedur']], pending_approval: [['results', 'Hasil'], ['conclusion', 'Kesimpulan']] },
    },
    transitionFields: { in_progress: ['tester', 'procedure'], pending_approval: ['results', 'conclusion', 'evidenceUrl'] },
  },
  findings: {
    model: 'Finding', prefix: 'FND', label: 'Temuan', plural: 'Temuan Audit', group: 'GRC & Assurance', icon: 'flag', titleField: 'title',
    description: 'Temuan audit internal/eksternal/regulator (format kondisi–kriteria–penyebab–akibat–rekomendasi), tanggapan manajemen, remediasi, dan validasi auditor.',
    columns: ['number', 'title', 'source', 'severity', 'owner', 'dueDate', 'status'],
    search: ['number', 'title', 'condition'],
    permissions: { read: ['auditor', 'risk_officer', 'security_officer', 'executive', 'technician', 'asset_manager', 'vendor_manager', 'bcm_manager', 'dc_manager', 'architect'], write: ['auditor', 'risk_officer', 'security_officer'] },
    fields: [
      { key: 'title', label: 'Judul temuan', type: 'text', required: true, full: true },
      { key: 'source', label: 'Sumber', type: 'select', options: o('internal_audit:Audit intern|external_audit:Audit eksternal|regulator:Pemeriksaan regulator (OJK/BI/BSSN)|control_test:Pengujian kontrol|dr_test:Uji DR|pentest:Penetration test|self_assessment:Self-assessment'), default: 'internal_audit' },
      { key: 'severity', label: 'Tingkat', type: 'select', options: SEV, default: 'medium' },
      { key: 'owner', label: 'Pemilik tindak lanjut', type: 'user' },
      { key: 'dueDate', label: 'Target penyelesaian', type: 'date' },
      { key: 'control', label: 'Kontrol terkait', type: 'ref', resource: 'controls' },
      { key: 'risk', label: 'Risiko terkait', type: 'ref', resource: 'risks' },
      { key: 'controlTest', label: 'Pengujian kontrol', type: 'ref', resource: 'control-tests' },
      { key: 'drTest', label: 'Uji DR', type: 'ref', resource: 'dr-tests' },
      { key: 'condition', label: 'Kondisi', type: 'textarea', full: true },
      { key: 'criteria', label: 'Kriteria', type: 'textarea', full: true },
      { key: 'cause', label: 'Penyebab', type: 'textarea', full: true },
      { key: 'effect', label: 'Akibat', type: 'textarea', full: true },
      { key: 'recommendation', label: 'Rekomendasi', type: 'textarea', full: true },
      { key: 'managementResponse', label: 'Tanggapan manajemen', type: 'textarea', full: true },
      { key: 'actionPlan', label: 'Rencana tindak lanjut', type: 'textarea', full: true },
      { key: 'remediationEvidence', label: 'Bukti remediasi', type: 'textarea', full: true },
    ],
    initial: 'open',
    statusFlow: ['open', 'action_plan', 'in_remediation', 'pending_approval', 'closed'],
    workflow: {
      transitions: { open: ['action_plan'], action_plan: ['in_remediation'], in_remediation: ['pending_approval'], pending_approval: ['closed', 'in_remediation'], closed: [] },
      required: {
        action_plan: [['owner', 'Pemilik'], ['managementResponse', 'Tanggapan manajemen'], ['actionPlan', 'Rencana tindak lanjut'], ['dueDate', 'Target']],
        pending_approval: [['remediationEvidence', 'Bukti remediasi']],
      },
      canOwner: ['action_plan', 'in_remediation', 'pending_approval'],
    },
    transitionFields: { action_plan: ['owner', 'managementResponse', 'actionPlan', 'dueDate'], pending_approval: ['remediationEvidence'] },
    sections: [['Temuan', ['title', 'source', 'severity', 'control', 'risk', 'controlTest', 'drTest']], ['Uraian (5C)', ['condition', 'criteria', 'cause', 'effect', 'recommendation']], ['Tindak lanjut', ['owner', 'dueDate', 'managementResponse', 'actionPlan', 'remediationEvidence']]],
  },

  // ======================= Ketahanan (BCM & DR) =======================
  bia: {
    model: 'Bia', prefix: 'BIA', label: 'BIA', plural: 'Business Impact Analysis', group: 'Ketahanan (BCM & DR)', icon: 'activity', titleField: 'title',
    description: 'Analisis dampak bisnis per proses kritikal: MTPD, RTO, RPO, dampak finansial/regulasi/reputasi, dependensi — disetujui pemilik proses (ISO 22301).',
    columns: ['number', 'title', 'businessUnit', 'service', 'rtoHours', 'rpoHours', 'impactLevel', 'status'],
    search: ['number', 'title', 'businessUnit'],
    permissions: { read: ['bcm_manager', 'risk_officer', 'executive', 'auditor', 'technician', 'incident_manager', 'dc_manager'], write: ['bcm_manager'] },
    fields: [
      { key: 'title', label: 'Proses bisnis', type: 'text', required: true, full: true },
      { key: 'businessUnit', label: 'Unit bisnis', type: 'text' },
      { key: 'service', label: 'Layanan TI pendukung', type: 'ref', resource: 'services' },
      { key: 'processOwner', label: 'Pemilik proses', type: 'user' },
      { key: 'mtpdHours', label: 'MTPD (jam)', type: 'number' },
      { key: 'rtoHours', label: 'RTO (jam)', type: 'number' },
      { key: 'rpoHours', label: 'RPO (jam)', type: 'number' },
      { key: 'financialImpact', label: 'Dampak finansial', type: 'select', options: SEV },
      { key: 'regulatoryImpact', label: 'Dampak regulasi', type: 'select', options: SEV },
      { key: 'reputationalImpact', label: 'Dampak reputasi', type: 'select', options: SEV },
      { key: 'operationalImpact', label: 'Dampak operasional', type: 'select', options: SEV },
      { key: 'impactLevel', label: 'Tingkat dampak (otomatis)', type: 'readonly', store: 'string', format: 'level' },
      { key: 'dependencies', label: 'Dependensi (sistem, vendor, SDM)', type: 'textarea', full: true },
      { key: 'minimumResources', label: 'Sumber daya minimum', type: 'textarea', full: true },
      { key: 'peakPeriods', label: 'Periode puncak', type: 'text' },
      { key: 'nextReview', label: 'Review berikutnya', type: 'date' },
    ],
    initial: 'draft',
    statusFlow: ['draft', 'review', 'pending_approval', 'approved'],
    workflow: {
      transitions: { draft: ['review'], review: ['pending_approval', 'draft'], pending_approval: ['approved', 'review'], approved: ['needs_update'], needs_update: ['review'] },
      required: { review: [['rtoHours', 'RTO'], ['rpoHours', 'RPO'], ['mtpdHours', 'MTPD']], pending_approval: [['processOwner', 'Pemilik proses']] },
    },
    compute: (d) => {
      const rank = { low: 1, medium: 2, high: 3, critical: 4 };
      const top = ['financialImpact', 'regulatoryImpact', 'reputationalImpact', 'operationalImpact'].map((k) => rank[d[k]] || 0).reduce((a, b) => Math.max(a, b), 0);
      d.impactLevel = ['', 'low', 'medium', 'high', 'critical'][top] || undefined;
    },
  },
  'dr-tests': {
    model: 'DrTest', prefix: 'DRT', label: 'Uji DR', plural: 'Uji DR & Latihan BCP', group: 'Ketahanan (BCM & DR)', icon: 'zap', titleField: 'title',
    description: 'Perencanaan, persetujuan, pelaksanaan & pelaporan uji DR/BCP (tabletop s.d. full failover): RTO/RPO aktual vs target, pembaruan status rencana & temuan otomatis.',
    columns: ['number', 'title', 'plan', 'testType', 'scheduledDate', 'result', 'status'],
    search: ['number', 'title'],
    permissions: { read: ['bcm_manager', 'risk_officer', 'executive', 'auditor', 'technician', 'dc_manager', 'incident_manager'], write: ['bcm_manager', 'dc_manager'] },
    fields: [
      { key: 'title', label: 'Judul uji', type: 'text', required: true, full: true },
      { key: 'plan', label: 'Rencana BCP/DRP', type: 'ref', resource: 'continuity', required: true },
      { key: 'testType', label: 'Jenis', type: 'select', options: o('tabletop:Tabletop|walkthrough:Walkthrough|simulation:Simulasi|partial_failover:Failover parsial|full_failover:Failover penuh|actual_invocation:Aktivasi DR aktual'), default: 'simulation' },
      { key: 'scheduledDate', label: 'Jadwal', type: 'datetime' },
      { key: 'coordinator', label: 'Koordinator', type: 'user' },
      { key: 'participants', label: 'Peserta', type: 'text' },
      { key: 'scenario', label: 'Skenario', type: 'textarea', full: true },
      { key: 'targetRtoHours', label: 'Target RTO (jam)', type: 'number' },
      { key: 'targetRpoHours', label: 'Target RPO (jam)', type: 'number' },
      { key: 'actualRtoHours', label: 'RTO aktual (jam)', type: 'number' },
      { key: 'actualRpoHours', label: 'RPO aktual (jam)', type: 'number' },
      { key: 'result', label: 'Hasil', type: 'select', options: o(':-|success:Berhasil|partial:Sebagian|failed:Gagal') },
      { key: 'findingsSummary', label: 'Ringkasan temuan', type: 'textarea', full: true },
      { key: 'lessonsLearned', label: 'Lessons learned', type: 'textarea', full: true },
      { key: 'executedAt', label: 'Dilaksanakan', type: 'readonly', store: 'date', format: 'datetime' },
    ],
    initial: 'planned',
    statusFlow: ['planned', 'pending_approval', 'approved', 'executed', 'reported', 'closed'],
    workflow: {
      transitions: { planned: ['pending_approval', 'cancelled'], pending_approval: ['approved', 'planned'], approved: ['executed', 'cancelled'], executed: ['reported'], reported: ['closed'], closed: [], cancelled: [] },
      required: {
        pending_approval: [['scenario', 'Skenario'], ['scheduledDate', 'Jadwal'], ['coordinator', 'Koordinator']],
        executed: [['actualRtoHours', 'RTO aktual'], ['actualRpoHours', 'RPO aktual'], ['result', 'Hasil']],
        reported: [['lessonsLearned', 'Lessons learned']],
      },
      stamp: { executed: 'executedAt' },
    },
    transitionFields: { pending_approval: ['scenario', 'scheduledDate', 'coordinator'], executed: ['actualRtoHours', 'actualRpoHours', 'result', 'findingsSummary'], reported: ['lessonsLearned'] },
  },

  // ======================= Data Center (DCIM) =======================
  datacenters: {
    model: 'DataCenter', prefix: 'DC', label: 'Data Center', plural: 'Data Center', group: 'Data Center (DCIM)', icon: 'building', titleField: 'name',
    description: 'Inventaris fasilitas DC/DRC: tier, lokasi (penempatan di Indonesia), kapasitas daya & rak; utilisasi terhitung otomatis dari rak.',
    columns: ['number', 'name', 'siteType', 'tier', 'location', 'rackCount', 'powerUsedKw', 'powerCapacityKw', 'status'],
    search: ['number', 'name', 'location'],
    permissions: { read: ['dc_manager', 'asset_manager', 'technician', 'bcm_manager', 'security_officer', 'risk_officer', 'auditor', 'executive'], write: ['dc_manager'] },
    fields: [
      { key: 'name', label: 'Nama fasilitas', type: 'text', required: true },
      { key: 'siteType', label: 'Jenis', type: 'select', options: o('primary_dc:Data center utama|drc:Disaster recovery center|colocation:Kolokasi|edge:Edge / cabang|cloud_region:Region cloud'), default: 'primary_dc' },
      { key: 'tier', label: 'Tier', type: 'select', options: o('I:Tier I|II:Tier II|III:Tier III|IV:Tier IV'), default: 'III' },
      { key: 'location', label: 'Lokasi', type: 'text' },
      { key: 'country', label: 'Negara', type: 'text', default: 'Indonesia' },
      { key: 'provider', label: 'Penyedia (kolokasi/cloud)', type: 'ref', resource: 'vendors' },
      { key: 'manager', label: 'Pengelola', type: 'user' },
      { key: 'powerCapacityKw', label: 'Kapasitas daya IT (kW)', type: 'number' },
      { key: 'coolingCapacityKw', label: 'Kapasitas pendingin (kW)', type: 'number' },
      { key: 'rackCount', label: 'Jumlah rak', type: 'readonly', store: 'number' },
      { key: 'rackUnitsTotal', label: 'Total U', type: 'readonly', store: 'number' },
      { key: 'rackUnitsUsed', label: 'U terpakai', type: 'readonly', store: 'number' },
      { key: 'powerUsedKw', label: 'Daya terpakai (kW)', type: 'readonly', store: 'number' },
      { key: 'certifications', label: 'Sertifikasi (Uptime, ISO 27001, …)', type: 'tags' },
      { key: 'notes', label: 'Catatan', type: 'textarea', full: true },
    ],
    initial: 'planned',
    statusFlow: ['planned', 'commissioning', 'operational'],
    workflow: {
      transitions: { planned: ['commissioning'], commissioning: ['operational'], operational: ['maintenance', 'decommissioned'], maintenance: ['operational', 'decommissioned'], decommissioned: [] },
      required: { operational: [['powerCapacityKw', 'Kapasitas daya'], ['manager', 'Pengelola']] },
    },
  },
  racks: {
    model: 'Rack', prefix: 'RCK', label: 'Rak', plural: 'Rak & Kapasitas', group: 'Data Center (DCIM)', icon: 'server', titleField: 'name',
    description: 'Rak per data center: unit (U), daya terpasang vs kapasitas, dan CI yang terpasang — dasar capacity planning.',
    columns: ['number', 'name', 'datacenter', 'usedUnits', 'totalUnits', 'spaceUtilization', 'powerUsedKw', 'powerCapacityKw', 'status'],
    search: ['number', 'name', 'row'],
    permissions: { read: ['dc_manager', 'asset_manager', 'technician', 'auditor', 'executive'], write: ['dc_manager', 'asset_manager'] },
    fields: [
      { key: 'name', label: 'Nama rak', type: 'text', required: true },
      { key: 'datacenter', label: 'Data center', type: 'ref', resource: 'datacenters', required: true },
      { key: 'row', label: 'Baris / ruang', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: o('planned:Direncanakan|active:Aktif|full:Penuh|decommissioned:Dinonaktifkan'), default: 'active' },
      { key: 'totalUnits', label: 'Total U', type: 'number', default: 42 },
      { key: 'usedUnits', label: 'U terpakai', type: 'number', default: 0 },
      { key: 'spaceUtilization', label: 'Utilisasi ruang (%)', type: 'readonly', store: 'number', format: 'percent' },
      { key: 'powerCapacityKw', label: 'Kapasitas daya (kW)', type: 'number' },
      { key: 'powerUsedKw', label: 'Daya terpakai (kW)', type: 'number' },
      { key: 'powerUtilization', label: 'Utilisasi daya (%)', type: 'readonly', store: 'number', format: 'percent' },
      { key: 'configurationItems', label: 'CI terpasang', type: 'refs', resource: 'configuration-items' },
    ],
    compute: (d) => {
      d.spaceUtilization = d.totalUnits ? Math.round(((d.usedUnits || 0) / d.totalUnits) * 100) : 0;
      d.powerUtilization = d.powerCapacityKw ? Math.round(((d.powerUsedKw || 0) / d.powerCapacityKw) * 100) : 0;
    },
  },
  'dc-access': {
    model: 'DcAccess', prefix: 'DCA', label: 'Akses DC', plural: 'Akses Fisik DC', group: 'Data Center (DCIM)', icon: 'door', titleField: 'title',
    description: 'Permohonan akses fisik ke DC/DRC: persetujuan DC manager (+ CISO untuk pihak luar), verifikasi identitas, check-in & check-out (ISO 27001 A.7).',
    columns: ['number', 'title', 'datacenter', 'visitorName', 'visitorType', 'plannedStart', 'status'],
    search: ['number', 'title', 'visitorName', 'company'],
    permissions: { read: ['*'], create: ['*'], write: ['dc_manager', 'security_officer'] },
    ownScope: true, // pengguna non-staf hanya melihat permohonannya sendiri
    fields: [
      { key: 'title', label: 'Keperluan', type: 'text', required: true, full: true },
      { key: 'datacenter', label: 'Data center', type: 'ref', resource: 'datacenters', required: true },
      { key: 'visitorName', label: 'Nama pengunjung', type: 'text', required: true },
      { key: 'company', label: 'Instansi / perusahaan', type: 'text' },
      { key: 'visitorType', label: 'Jenis pengunjung', type: 'select', options: o('employee:Pegawai|vendor:Vendor|auditor:Auditor / regulator|guest:Tamu'), default: 'employee' },
      { key: 'plannedStart', label: 'Mulai', type: 'datetime' },
      { key: 'plannedEnd', label: 'Selesai', type: 'datetime' },
      { key: 'relatedChange', label: 'Change terkait', type: 'ref', resource: 'changes' },
      { key: 'escort', label: 'Pendamping', type: 'user' },
      { key: 'idVerified', label: 'Identitas diverifikasi', type: 'bool' },
      { key: 'checkInAt', label: 'Check-in', type: 'readonly', store: 'date', format: 'datetime' },
      { key: 'checkOutAt', label: 'Check-out', type: 'readonly', store: 'date', format: 'datetime' },
      { key: 'notes', label: 'Catatan', type: 'textarea', full: true },
    ],
    initial: 'requested',
    statusFlow: ['requested', 'pending_approval', 'approved', 'checked_in', 'checked_out'],
    workflow: {
      transitions: { requested: ['pending_approval', 'cancelled'], pending_approval: ['approved', 'rejected'], rejected: [], approved: ['checked_in', 'cancelled'], checked_in: ['checked_out'], checked_out: [], cancelled: [] },
      required: { pending_approval: [['plannedStart', 'Mulai'], ['plannedEnd', 'Selesai']], checked_in: [['idVerified', 'Verifikasi identitas']] },
      roles: { checked_in: ['dc_manager', 'security_officer'], checked_out: ['dc_manager', 'security_officer'] },
      stamp: { checked_in: 'checkInAt', checked_out: 'checkOutAt' },
      canOwner: ['pending_approval', 'cancelled'],
    },
    transitionFields: { checked_in: ['idVerified', 'escort'] },
  },

  // ======================= Perencanaan =======================
  initiatives: {
    model: 'Initiative', prefix: 'INI', label: 'Inisiatif', plural: 'Perencanaan TI (RPTI)', group: 'Perencanaan & Arsitektur', icon: 'target', titleField: 'title',
    description: 'Portofolio inisiatif strategis TI / Rencana Pengembangan TI: business case, skoring prioritas, review arsitek, persetujuan IT Steering Committee, lalu dieksekusi sebagai proyek.',
    columns: ['number', 'title', 'category', 'priorityScore', 'estimatedCost', 'targetQuarter', 'status'],
    search: ['number', 'title'],
    defaultSort: '-priorityScore',
    permissions: { read: ['executive', 'architect', 'project_manager', 'finance_manager', 'risk_officer', 'auditor'], write: ['architect', 'project_manager', 'executive'] },
    fields: [
      { key: 'title', label: 'Inisiatif', type: 'text', required: true, full: true },
      { key: 'category', label: 'Kategori', type: 'select', options: o('regulatory:Kepatuhan regulasi|run:Run|grow:Grow|transform:Transform'), default: 'grow' },
      { key: 'sponsor', label: 'Sponsor bisnis', type: 'text' },
      { key: 'owner', label: 'Pemilik inisiatif', type: 'user' },
      { key: 'targetQuarter', label: 'Target kuartal', type: 'text' },
      { key: 'regulatoryDriver', label: 'Pemicu regulasi', type: 'text' },
      { key: 'strategicAlignment', label: 'Keselarasan strategis', type: 'select', options: LEVEL5, number: true, default: 3 },
      { key: 'businessValue', label: 'Nilai bisnis', type: 'select', options: LEVEL5, number: true, default: 3 },
      { key: 'urgency', label: 'Urgensi', type: 'select', options: LEVEL5, number: true, default: 3 },
      { key: 'deliveryRisk', label: 'Risiko delivery', type: 'select', options: LEVEL5, number: true, default: 3 },
      { key: 'priorityScore', label: 'Skor prioritas (0–100)', type: 'readonly', store: 'number' },
      { key: 'estimatedCost', label: 'Estimasi biaya (Rp)', type: 'number' },
      { key: 'budget', label: 'Mata anggaran', type: 'ref', resource: 'budgets' },
      { key: 'project', label: 'Proyek pelaksana', type: 'ref', resource: 'projects' },
      { key: 'objective', label: 'Tujuan', type: 'textarea', full: true },
      { key: 'businessCase', label: 'Business case & manfaat', type: 'textarea', full: true },
      { key: 'architectureNotes', label: 'Catatan review arsitektur', type: 'textarea', full: true },
    ],
    initial: 'proposed',
    statusFlow: ['proposed', 'assessment', 'pending_approval', 'approved', 'in_execution', 'delivered'],
    workflow: {
      transitions: {
        proposed: ['assessment', 'cancelled'], assessment: ['pending_approval', 'proposed'], pending_approval: ['approved', 'rejected'],
        rejected: ['proposed'], approved: ['in_execution', 'cancelled'], in_execution: ['delivered'], delivered: [], cancelled: [],
      },
      required: {
        assessment: [['objective', 'Tujuan'], ['businessCase', 'Business case']],
        pending_approval: [['estimatedCost', 'Estimasi biaya'], ['architectureNotes', 'Catatan review arsitektur']],
        in_execution: [['project', 'Proyek pelaksana']],
      },
    },
    transitionFields: { pending_approval: ['estimatedCost', 'architectureNotes', 'budget'], in_execution: ['project'] },
    compute: (d) => {
      const n = (k) => Number(d[k] || 0);
      d.priorityScore = Math.round(((n('strategicAlignment') * 0.35 + n('businessValue') * 0.35 + n('urgency') * 0.2 + (6 - n('deliveryRisk')) * 0.1) / 5) * 100);
    },
  },
};

/** Status tambahan untuk modul lama yang diberi workflow end-to-end. */
export const LEGACY_STATUS = {
  vendors: ['prospect', 'due_diligence', 'pending_approval', 'active', 'under_review', 'rejected', 'terminated'],
  assets: ['requested', 'ordered', 'in_stock', 'deployed', 'in_repair', 'retired', 'pending_disposal', 'disposed'],
  'configuration-items': ['planned', 'in_build', 'active', 'maintenance', 'retired'],
  continuity: ['draft', 'review', 'pending_approval', 'approved', 'tested', 'needs_update', 'retired'],
  architecture: ['draft', 'review', 'pending_approval', 'approved', 'deprecated'],
  risks: ['identified', 'assessed', 'treating', 'pending_approval', 'monitoring', 'closed'],
};

/** Nama model Mongoose per resource (modul lama + modul DSL), untuk resolusi referensi. */
export const MODEL_NAMES = {
  incidents: 'Incident', requests: 'ServiceRequest', problems: 'Problem', changes: 'Change', knowledge: 'KnowledgeArticle',
  services: 'Service', 'sla-policies': 'SlaPolicy', 'configuration-items': 'ConfigurationItem', assets: 'Asset', vendors: 'Vendor',
  risks: 'Risk', controls: 'Control', continuity: 'ContinuityPlan', architecture: 'ArchitectureComponent', projects: 'Project',
  sprints: 'Sprint', backlog: 'BacklogItem', users: 'User',
  ...Object.fromEntries(Object.entries(MODULE_DEFS).map(([k, d]) => [k, d.model])),
};

export { riskScore };
