/**
 * Aturan lintas-record yang dijalankan server & backend demo melalui antarmuka `store`:
 *   store.get(res, id) · store.find(res, filter) · store.update(res, id, patch, note) · store.create(res, data)
 * (filter: kesetaraan field atau { field: { $in: [...] } }). Semua operasi otomatis terbatas pada tenant aktif.
 *
 *  CHECKS[res][to](doc, store)   → pesan error | null — dijalankan sebelum transisi (termasuk hasil persetujuan)
 *  EFFECTS[res][to](doc, store)  → efek setelah transisi tersimpan
 *  ON_SAVE[res](doc, store)      → efek setelah create/update
 *  SPAWN[res]                    → aksi "buat record terkait" (prefill + tautan balik)
 */
import { round2, fmtIdr } from './finance.mjs';

const id = (v) => (v && typeof v === 'object' ? String(v._id) : v ? String(v) : null);
const COMMITTED = ['approved', 'ordered', 'received', 'closed'];
const PO_REVIEW = ['pending_approval', ...COMMITTED];
const INVOICED = ['received', 'verified', 'pending_approval', 'approved', 'paid', 'disputed'];
const PAID_OR_PENDING = ['pending_approval', 'approved', 'executed', 'reconciled'];

async function recalcBudget(store, budgetId) {
  if (!budgetId) return;
  const budget = await store.get('budgets', budgetId);
  if (!budget) return;
  const pos = await store.find('purchase-orders', { budget: id(budgetId), status: { $in: COMMITTED } });
  const committed = round2(pos.reduce((s, p) => s + (p.subtotal || 0), 0));
  const invoices = pos.length ? await store.find('invoices', { purchaseOrder: { $in: pos.map((p) => id(p._id)) }, status: { $in: ['approved', 'paid'] } }) : [];
  const actual = round2(invoices.reduce((s, i) => s + (i.amount || 0), 0));
  await store.update('budgets', budgetId, { committedAmount: committed, actualAmount: actual, availableAmount: round2((budget.amount || 0) - committed) });
}

async function budgetAvailable(po, store) {
  const budget = await store.get('budgets', id(po.budget));
  if (!budget) return 'Mata anggaran tidak ditemukan';
  if (budget.status !== 'active') return `Anggaran ${budget.number} belum disahkan (status: ${budget.status})`;
  const others = await store.find('purchase-orders', { budget: id(po.budget), status: { $in: PO_REVIEW } });
  const used = others.filter((p) => id(p._id) !== id(po._id)).reduce((s, p) => s + (p.subtotal || 0), 0);
  const remaining = round2((budget.amount || 0) - used);
  if ((po.subtotal || 0) > remaining) return `Kontrol anggaran: nilai PO ${fmtIdr(po.subtotal)} melebihi sisa anggaran ${budget.number} (${fmtIdr(remaining)})`;
  return null;
}

async function threeWayMatch(inv, store) {
  const po = await store.get('purchase-orders', id(inv.purchaseOrder));
  if (!po) return 'PO tidak ditemukan';
  if (!['received', 'closed'].includes(po.status)) return `3-way match gagal: barang/jasa pada ${po.number} belum diterima (status PO: ${po.status})`;
  if (inv.vendor && id(inv.vendor) !== id(po.vendor)) return '3-way match gagal: vendor tagihan berbeda dengan vendor PO';
  const others = await store.find('invoices', { purchaseOrder: id(po._id), status: { $in: INVOICED } });
  const billed = others.filter((i) => id(i._id) !== id(inv._id)).reduce((s, i) => s + (i.amount || 0), 0);
  const remaining = round2((po.subtotal || 0) - billed);
  if ((inv.amount || 0) > remaining) return `3-way match gagal: nilai tagihan ${fmtIdr(inv.amount)} melebihi sisa PO ${fmtIdr(remaining)}`;
  inv.vendor = inv.vendor || po.vendor;
  inv.matchResult = `Cocok: PO ${po.number} (${fmtIdr(po.subtotal)}) · diterima ${po.receivedDate ? new Date(po.receivedDate).toLocaleDateString('id-ID') : '-'} · sisa sebelum tagihan ${fmtIdr(remaining)}`;
  return null;
}

async function paymentValid(pay, store) {
  const inv = await store.get('invoices', id(pay.invoice));
  if (!inv) return 'Tagihan tidak ditemukan';
  if (inv.status !== 'approved') return `Tagihan ${inv.number} belum disetujui untuk dibayar (status: ${inv.status})`;
  const others = await store.find('payments', { invoice: id(inv._id), status: { $in: PAID_OR_PENDING } });
  const used = others.filter((p) => id(p._id) !== id(pay._id)).reduce((s, p) => s + (p.amount || 0), 0);
  const remaining = round2((inv.total || 0) - used);
  if ((pay.amount || 0) <= 0) return 'Jumlah pembayaran harus lebih dari 0';
  if ((pay.amount || 0) > remaining) return `Jumlah pembayaran ${fmtIdr(pay.amount)} melebihi sisa tagihan ${fmtIdr(remaining)}`;
  return null;
}

const journalBalanced = (j) => {
  if (!(j.lines || []).length) return 'Jurnal belum memiliki baris';
  if (!j.totalDebit || j.totalDebit !== j.totalCredit) return `Jurnal tidak seimbang: debit ${fmtIdr(j.totalDebit)} ≠ kredit ${fmtIdr(j.totalCredit)}`;
  return null;
};

async function postJournal(store, { date, description, source, sourceRef, lines }) {
  await store.create('journals', { date: date || new Date().toISOString(), description, source, sourceRef, lines, status: 'posted' });
}

async function invoiceApproved(inv, store) {
  const po = await store.get('purchase-orders', id(inv.purchaseOrder));
  const budget = po ? await store.get('budgets', id(po.budget)) : null;
  const account = inv.account || budget?.account || (budget?.category === 'capex' ? '1300' : '5100');
  const lines = [{ account, memo: inv.description || `Tagihan ${inv.vendorInvoiceNo}`, debit: inv.amount, credit: 0 }];
  if (inv.taxAmount) lines.push({ account: '1500', memo: 'PPN masukan', debit: inv.taxAmount, credit: 0 });
  lines.push({ account: '2100', memo: 'Utang usaha', debit: 0, credit: inv.total });
  await postJournal(store, { date: inv.invoiceDate, description: `Pengakuan tagihan ${inv.number} (${inv.vendorInvoiceNo})`, source: 'invoice', sourceRef: inv.number, lines });
  if (po) await recalcBudget(store, id(po.budget));
}

async function paymentExecuted(pay, store) {
  const inv = await store.get('invoices', id(pay.invoice));
  await postJournal(store, {
    date: pay.paymentDate, description: `Pembayaran ${pay.number} atas ${inv?.number || ''}`, source: 'payment', sourceRef: pay.number,
    lines: [{ account: '2100', memo: 'Pelunasan utang usaha', debit: pay.amount, credit: 0 }, { account: '1100', memo: pay.reference, debit: 0, credit: pay.amount }],
  });
  if (!inv) return;
  const done = await store.find('payments', { invoice: id(inv._id), status: { $in: ['executed', 'reconciled'] } });
  const paid = round2(done.reduce((s, p) => s + (p.amount || 0), 0));
  await store.update('invoices', id(inv._id), { paidAmount: paid, ...(paid >= inv.total ? { status: 'paid' } : {}) }, paid >= inv.total ? `Lunas melalui ${pay.number}` : `Dibayar sebagian melalui ${pay.number}`);
}

async function journalReversed(j, store) {
  await postJournal(store, {
    date: new Date().toISOString(), description: `Jurnal balik ${j.number}: ${j.description}`, source: 'reversal', sourceRef: j.number,
    lines: (j.lines || []).map((l) => ({ account: l.account, memo: `Balik: ${l.memo || ''}`, debit: l.credit || 0, credit: l.debit || 0 })),
  });
}

const CONTROL_STATUS = { effective: 'implemented', partially_effective: 'partial', ineffective: 'not_implemented' };
async function controlTestConcluded(t, store) {
  const control = await store.get('controls', id(t.control));
  if (control) {
    await store.update('controls', id(control._id), { status: CONTROL_STATUS[t.conclusion] || control.status, lastAssessed: new Date().toISOString(), evidenceUrl: t.evidenceUrl || control.evidenceUrl }, `Status diperbarui dari pengujian ${t.number}: ${t.conclusion}`);
  }
  if (t.conclusion && t.conclusion !== 'effective') {
    await store.create('findings', {
      title: `Kontrol ${control?.code || ''} ${t.conclusion === 'ineffective' ? 'tidak efektif' : 'efektif sebagian'}`, source: 'control_test',
      severity: t.conclusion === 'ineffective' ? 'high' : 'medium', control: id(t.control), controlTest: id(t._id), condition: t.results,
      criteria: control?.title, recommendation: 'Perbaiki desain/operasi kontrol dan lakukan pengujian ulang.',
    });
  }
}

async function drTestReported(t, store) {
  const plan = await store.get('continuity', id(t.plan));
  if (plan) {
    await store.update('continuity', id(plan._id), {
      lastTestDate: t.executedAt || new Date().toISOString(), lastTestResult: t.result, testFindings: t.findingsSummary,
      nextTestDate: new Date(Date.now() + 365 * 864e5).toISOString(), status: t.result === 'success' ? 'tested' : 'needs_update',
    }, `Hasil uji ${t.number}: ${t.result}`);
  }
  const missedRto = t.targetRtoHours && t.actualRtoHours > t.targetRtoHours;
  const missedRpo = t.targetRpoHours && t.actualRpoHours > t.targetRpoHours;
  if (t.result !== 'success' || missedRto || missedRpo) {
    await store.create('findings', {
      title: `Uji DR ${plan?.name || ''}: ${missedRto ? 'RTO terlampaui' : missedRpo ? 'RPO terlampaui' : `hasil ${t.result}`}`, source: 'dr_test',
      severity: t.result === 'failed' ? 'high' : 'medium', drTest: id(t._id),
      condition: `RTO aktual ${t.actualRtoHours} jam (target ${t.targetRtoHours ?? '-'}); RPO aktual ${t.actualRpoHours} jam (target ${t.targetRpoHours ?? '-'}). ${t.findingsSummary || ''}`,
      recommendation: t.lessonsLearned,
    });
  }
}

async function recalcDataCenter(rack, store) {
  const dcId = id(rack.datacenter);
  if (!dcId) return;
  const racks = (await store.find('racks', { datacenter: dcId })).filter((r) => r.status !== 'decommissioned');
  await store.update('datacenters', dcId, {
    rackCount: racks.length,
    rackUnitsTotal: racks.reduce((s, r) => s + (r.totalUnits || 0), 0),
    rackUnitsUsed: racks.reduce((s, r) => s + (r.usedUnits || 0), 0),
    powerUsedKw: round2(racks.reduce((s, r) => s + (r.powerUsedKw || 0), 0)),
  });
}

export const CHECKS = {
  'purchase-orders': { pending_approval: budgetAvailable, approved: budgetAvailable },
  invoices: { verified: threeWayMatch },
  payments: { pending_approval: paymentValid, approved: paymentValid, executed: paymentValid },
  journals: { pending_approval: journalBalanced, posted: journalBalanced },
};

export const EFFECTS = {
  'purchase-orders': { approved: (d, s) => recalcBudget(s, id(d.budget)), cancelled: (d, s) => recalcBudget(s, id(d.budget)), closed: (d, s) => recalcBudget(s, id(d.budget)) },
  invoices: { approved: invoiceApproved },
  payments: { executed: paymentExecuted },
  journals: { reversed: journalReversed },
  'control-tests': { concluded: controlTestConcluded },
  'dr-tests': { reported: drTestReported },
};

export const ON_SAVE = {
  racks: recalcDataCenter,
  budgets: (d, s) => recalcBudget(s, id(d._id)),
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Aksi "buat record terkait": map(doc) → nilai awal formulir target; link: field pada target yang menunjuk sumber;
 * backlink: field pada sumber yang diisi id target setelah dibuat.
 */
export const SPAWN = {
  incidents: [
    { target: 'problems', label: 'Buat problem (RCA)', backlink: 'relatedProblem', map: (d) => ({ title: `RCA: ${d.title}`, description: d.description, service: id(d.service), configurationItem: id(d.configurationItem), impact: d.impact, urgency: d.urgency }) },
    { target: 'knowledge', label: 'Jadikan artikel knowledge', map: (d) => ({ title: d.title, content: d.resolutionNotes, articleType: 'troubleshooting', service: id(d.service) }) },
  ],
  problems: [
    { target: 'changes', label: 'Ajukan change perbaikan', link: 'relatedProblem', backlink: 'relatedChange', map: (d) => ({ title: `Perbaikan permanen: ${d.title}`, description: d.permanentFix || d.rootCause, service: id(d.service), configurationItems: d.configurationItem ? [id(d.configurationItem)] : [], type: 'normal' }) },
    { target: 'knowledge', label: 'Terbitkan known error', link: 'relatedProblem', map: (d) => ({ title: `Known error: ${d.title}`, articleType: 'known_error', content: d.workaround, audience: 'it_only' }) },
  ],
  changes: [{ target: 'dc-access', label: 'Ajukan akses DC', link: 'relatedChange', map: (d) => ({ title: `Implementasi ${d.number}: ${d.title}`, plannedStart: d.plannedStart, plannedEnd: d.plannedEnd }) }],
  risks: [{ target: 'risk-actions', label: 'Tambah tindakan mitigasi', link: 'risk', map: (d) => ({ title: `Mitigasi: ${d.title}`, owner: id(d.owner), dueDate: d.dueDate }) }],
  findings: [{ target: 'risk-actions', label: 'Tambah tindakan remediasi', link: 'finding', map: (d) => ({ title: `Remediasi: ${d.title}`, owner: id(d.owner), dueDate: d.dueDate, risk: id(d.risk), actionType: 'corrective' }) }],
  controls: [{ target: 'control-tests', label: 'Jadwalkan pengujian kontrol', link: 'control', map: (d) => ({ title: `Uji ${d.code} — ${d.title}`.slice(0, 190) }) }],
  vendors: [{ target: 'contracts', label: 'Buat kontrak', link: 'vendor', map: (d) => ({ title: `Kontrak layanan ${d.name}`, dataLocation: d.dataLocation, rightToAudit: d.rightToAudit }) }],
  contracts: [{ target: 'purchase-orders', label: 'Buat purchase order', link: 'contract', map: (d) => ({ title: `PO — ${d.title}`, vendor: id(d.vendor) }) }],
  budgets: [{ target: 'purchase-orders', label: 'Buat purchase order', link: 'budget', map: () => ({}) }],
  'purchase-orders': [{ target: 'invoices', label: 'Catat tagihan vendor', link: 'purchaseOrder', map: (d) => ({ vendor: id(d.vendor), amount: d.subtotal, taxRate: d.taxRate, invoiceDate: today(), description: d.title }) }],
  invoices: [{ target: 'payments', label: 'Buat pembayaran', link: 'invoice', map: (d) => ({ amount: round2((d.total || 0) - (d.paidAmount || 0)), paymentDate: today() }) }],
  initiatives: [{ target: 'projects', label: 'Buat proyek pelaksana', backlink: 'project', map: (d) => ({ name: d.title, objectives: d.objective, budget: d.estimatedCost, regulatoryDriver: d.regulatoryDriver, approach: 'hybrid' }) }],
  continuity: [{ target: 'dr-tests', label: 'Jadwalkan uji DR', link: 'plan', map: (d) => ({ title: `Uji ${d.name}`, targetRtoHours: d.rtoHours, targetRpoHours: d.rpoHours }) }],
  services: [{ target: 'bia', label: 'Buat BIA', link: 'service', map: (d) => ({ title: `Proses bisnis: ${d.name}`, rtoHours: d.rtoHours, rpoHours: d.rpoHours }) }],
  assets: [{ target: 'configuration-items', label: 'Daftarkan sebagai CI', link: 'asset', map: (d) => ({ name: d.name, ciType: d.category === 'hardware' ? 'server' : 'application' }) }],
  datacenters: [
    { target: 'racks', label: 'Tambah rak', link: 'datacenter', map: () => ({ totalUnits: 42 }) },
    { target: 'dc-access', label: 'Ajukan akses', link: 'datacenter', map: () => ({}) },
  ],
};

/** Nilai awal formulir target untuk aksi spawn. */
export function spawnPrefill(source, doc, target) {
  const rule = (SPAWN[source] || []).find((r) => r.target === target);
  if (!rule) return null;
  const data = Object.fromEntries(Object.entries(rule.map(doc)).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  if (rule.link) data[rule.link] = id(doc._id);
  return data;
}
export const spawnRule = (source, target) => (SPAWN[source] || []).find((r) => r.target === target) || null;
