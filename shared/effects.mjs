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

// ======================= E-Procurement =======================
const name = (v) => v?.name || v?.number || '';
const dayStart = () => new Date(new Date().toISOString().slice(0, 10));

/** Item katalog hanya dapat ditayangkan bila kontrak payung aktif & milik penyedia yang sama, dan penyedia aktif. */
async function catalogPublishable(item, store) {
  const vendor = await store.get('vendors', id(item.vendor));
  if (!vendor) return 'Penyedia tidak ditemukan';
  if (vendor.status && vendor.status !== 'active') return `Penyedia ${vendor.name} belum aktif/terverifikasi (status: ${vendor.status})`;
  const contract = await store.get('contracts', id(item.contract));
  if (!contract) return 'Kontrak payung tidak ditemukan';
  if (contract.status !== 'active') return `Kontrak ${contract.number} belum aktif (status: ${contract.status})`;
  if (id(contract.vendor) !== id(item.vendor)) return `Kontrak ${contract.number} bukan milik penyedia ${vendor.name}`;
  if (item.validUntil && new Date(item.validUntil) < dayStart()) return 'Masa berlaku harga katalog sudah lewat';
  if (contract.endDate && item.validUntil && new Date(item.validUntil) > new Date(contract.endDate)) return `Masa berlaku harga melewati akhir kontrak ${contract.number}`;
  if (!(Number(item.unitPrice) > 0)) return 'Harga satuan harus lebih dari 0';
  return null;
}

/** Sisa anggaran setelah komitmen PO (opsional: tambahkan nilai lain yang sedang diproses). */
async function budgetRemaining(store, budgetId) {
  const budget = await store.get('budgets', budgetId);
  if (!budget) return { error: 'Mata anggaran tidak ditemukan' };
  if (budget.status !== 'active') return { error: `Anggaran ${budget.number} belum disahkan (status: ${budget.status})` };
  const pos = await store.find('purchase-orders', { budget: budgetId, status: { $in: PO_REVIEW } });
  return { budget, remaining: round2((budget.amount || 0) - pos.reduce((s, p) => s + (p.subtotal || 0), 0)) };
}

/**
 * PR diajukan/disetujui: kunci harga item katalog sesuai katalog terbit (bukan harga ketikan pemohon),
 * validasi masa berlaku & minimum order, dan (untuk persetujuan akhir) ketersediaan anggaran.
 */
async function requisitionCheck(pr, store, { final = false } = {}) {
  const items = pr.items || [];
  if (!items.length) return 'Rincian kebutuhan masih kosong';
  for (const l of items) {
    if (!(Number(l.qty) > 0)) return `Qty "${l.description || l.sku || '-'}" harus lebih dari 0`;
    if (!l.catalogItem) {
      if (!l.description) return 'Deskripsi item non-katalog wajib diisi';
      continue;
    }
    const cat = await store.get('catalog-items', l.catalogItem);
    if (!cat) return `Item katalog ${l.sku || l.description || ''} tidak ditemukan`;
    if (cat.status !== 'published') return `Item katalog ${cat.number} (${cat.name}) tidak sedang tayang (status: ${cat.status})`;
    if (cat.validUntil && new Date(cat.validUntil) < dayStart()) return `Harga katalog ${cat.number} sudah kedaluwarsa`;
    if (cat.minOrderQty && Number(l.qty) < cat.minOrderQty) return `Minimum pemesanan ${cat.name}: ${cat.minOrderQty} ${cat.unit || ''}`;
    Object.assign(l, { catalogItem: id(cat._id), vendor: id(cat.vendor), sku: cat.sku || cat.number, description: cat.name, unit: cat.unit, unitPrice: cat.unitPrice });
  }
  const val = (l) => Number(l.qty || 0) * Number(l.unitPrice || 0);
  pr.catalogTotal = round2(items.filter((l) => l.catalogItem).reduce((s, l) => s + val(l), 0));
  pr.nonCatalogTotal = round2(items.filter((l) => !l.catalogItem).reduce((s, l) => s + val(l), 0));
  pr.subtotal = round2(pr.catalogTotal + pr.nonCatalogTotal);
  if (final || pr.budget) {
    if (!pr.budget) return 'Procurement wajib menetapkan mata anggaran sebelum persetujuan akhir';
    const { error, remaining } = await budgetRemaining(store, id(pr.budget));
    if (error) return error;
    if (pr.subtotal > remaining) return `Kontrol anggaran: estimasi PR ${fmtIdr(pr.subtotal)} melebihi sisa anggaran (${fmtIdr(remaining)})`;
  }
  return null;
}

/** PR disetujui → PO per penyedia untuk item katalog (harga kontrak) + RFQ/tender untuk item non-katalog. */
async function requisitionApproved(pr, store) {
  const items = pr.items || [];
  const byVendor = new Map();
  for (const l of items.filter((x) => x.catalogItem)) {
    if (!byVendor.has(l.vendor)) byVendor.set(l.vendor, []);
    byVendor.get(l.vendor).push(l);
  }
  const notes = [];
  // Dokumen turunan menjadi milik petugas procurement yang menyetujui PR (SoD: bukan Controller penyetuju akhir)
  const buyer = (pr.approvals || []).filter((a) => a.decision === 'approved' && a.round === (pr.approvalRound || 1) && /^Procurement/.test(a.step)).map((a) => id(a.approver))[0];
  for (const [vendorId, lines] of byVendor) {
    const vendor = await store.get('vendors', vendorId);
    const first = await store.get('catalog-items', lines[0].catalogItem);
    const po = await store.create('purchase-orders', {
      title: `${pr.title} — ${name(vendor)}`.slice(0, 190), vendor: vendorId, contract: id(first?.contract) || undefined, budget: id(pr.budget),
      sourcing: 'catalog', requisition: id(pr._id), requester: id(pr.requester) || id(pr.createdBy), neededBy: pr.neededBy,
      items: lines.map((l) => ({ description: `${l.sku ? `[${l.sku}] ` : ''}${l.description}`, qty: l.qty, unitPrice: l.unitPrice })),
      justification: `Pembelian e-katalog dari ${pr.number} (harga kontrak terkunci). ${pr.justification || ''}`.trim(), status: 'approved', createdBy: buyer || undefined,
    });
    notes.push(`${po.number} → ${name(vendor)} (${fmtIdr(po.subtotal)})`);
  }
  const others = items.filter((x) => !x.catalogItem);
  if (others.length) {
    const hps = round2(others.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0));
    const rfq = await store.create('rfqs', {
      title: `Pengadaan: ${pr.title}`.slice(0, 190), method: hps >= 1e9 ? 'open_tender' : hps >= 2e8 ? 'limited_tender' : 'rfq',
      requisition: id(pr._id), budget: id(pr.budget), hpsAmount: hps,
      items: others.map((l) => ({ description: l.description, qty: l.qty, unit: l.unit })), createdBy: buyer || undefined,
    });
    notes.push(`${rfq.number} (${rfq.method === 'rfq' ? 'RFQ' : 'tender'}, HPS ${fmtIdr(hps)})`);
  }
  if (byVendor.size) await recalcBudget(store, id(pr.budget));
  await store.update('requisitions', id(pr._id), { status: 'in_procurement', processingNotes: `Diproses otomatis: ${notes.join('; ')}` }, `Diteruskan ke pengadaan: ${notes.join('; ')}`);
}

const MIN_INVITES = { rfq: 3, limited_tender: 3, open_tender: 0, direct: 1 };

async function rfqPublishable(rfq, store) {
  if (!(rfq.items || []).length) return 'Lingkup & kuantitas pengadaan wajib diisi';
  if (!(Number(rfq.hpsAmount) > 0)) return 'HPS wajib diisi (> 0)';
  if (rfq.closingDate && new Date(rfq.closingDate) <= new Date()) return 'Batas pemasukan penawaran harus di masa depan';
  const invited = (rfq.invitedVendors || []).map(id);
  const min = MIN_INVITES[rfq.method] ?? 3;
  if (invited.length < min) return `Metode ${rfq.method === 'rfq' ? 'RFQ' : 'tender terbatas'} wajib mengundang minimal ${min} penyedia (saat ini ${invited.length})`;
  if (rfq.method === 'direct' && !rfq.directJustification) return 'Penunjukan langsung wajib disertai justifikasi (keadaan darurat, penyedia tunggal, lanjutan pekerjaan, dsb.)';
  for (const v of invited) {
    const vendor = await store.get('vendors', v);
    if (!vendor) return 'Penyedia undangan tidak ditemukan';
    if (vendor.status && vendor.status !== 'active') return `Penyedia ${vendor.name} belum terverifikasi (status: ${vendor.status}) — hanya penyedia aktif yang dapat diundang`;
  }
  const { error } = await budgetRemaining(store, id(rfq.budget));
  return error || null;
}

const LIVE_QUOTES = ['submitted', 'evaluated'];

/** Pembukaan penawaran: setelah batas waktu, atau lebih awal bila semua undangan sudah memasukkan penawaran. */
async function rfqOpenable(rfq, store) {
  const quotes = await store.find('quotations', { rfq: id(rfq._id), status: { $in: LIVE_QUOTES } });
  if (!quotes.length) return 'Belum ada penawaran yang masuk';
  const invited = (rfq.invitedVendors || []).map(id);
  const allIn = invited.length > 0 && invited.every((v) => quotes.some((q) => id(q.vendor) === v));
  if (rfq.closingDate && new Date(rfq.closingDate) > new Date() && !allIn) return `Penawaran baru dapat dibuka setelah batas waktu (${new Date(rfq.closingDate).toLocaleString('id-ID')}) atau setelah semua penyedia undangan memasukkan penawaran`;
  return null;
}

/** Evaluasi berbobot: gugur bila administrasi tidak lengkap, di atas HPS, atau nilai teknis di bawah ambang. */
async function evaluateRfq(rfq, store) {
  const quotes = await store.find('quotations', { rfq: id(rfq._id), status: { $in: LIVE_QUOTES } });
  const pw = Number(rfq.priceWeight ?? 70);
  const tw = 100 - pw;
  const reason = (q) => {
    if (q.compliant === false) return 'Gugur administrasi';
    if ((q.subtotal || 0) <= 0) return 'Harga penawaran kosong';
    if (rfq.hpsAmount && q.subtotal > rfq.hpsAmount) return `Gugur: di atas HPS (${fmtIdr(rfq.hpsAmount)})`;
    if (tw > 0 && q.technicalScore == null) return 'Menunggu nilai teknis';
    if (tw > 0 && q.technicalScore < (rfq.minTechnicalScore ?? 0)) return `Gugur teknis (< ${rfq.minTechnicalScore})`;
    return null;
  };
  const ok = quotes.filter((q) => !reason(q));
  const low = ok.length ? Math.min(...ok.map((q) => q.subtotal)) : 0;
  const scored = ok.map((q) => {
    const priceScore = round2((low / q.subtotal) * 100);
    return { q, priceScore, totalScore: round2((priceScore * pw + Number(q.technicalScore || 0) * tw) / 100) };
  }).sort((a, b) => b.totalScore - a.totalScore || a.q.subtotal - b.q.subtotal);
  for (const q of quotes) {
    const i = scored.findIndex((s) => id(s.q._id) === id(q._id));
    const s = scored[i];
    await store.update('quotations', id(q._id), s
      ? { status: 'evaluated', priceScore: s.priceScore, totalScore: s.totalScore, rank: i + 1, evaluationResult: i === 0 ? 'Peringkat 1 — usulan pemenang' : `Lulus — peringkat ${i + 1}` }
      : { status: 'evaluated', priceScore: null, totalScore: null, rank: null, evaluationResult: reason(q) });
  }
  const top = scored[0]?.q;
  await store.update('rfqs', id(rfq._id), {
    quotationCount: quotes.length, recommendedQuotation: top ? id(top._id) : null, recommendedVendor: top ? id(top.vendor) : null,
    recommendedAmount: top ? top.subtotal : null,
    savingsAmount: top && rfq.hpsAmount ? round2(rfq.hpsAmount - top.subtotal) : null,
    savingsPct: top && rfq.hpsAmount ? round2(((rfq.hpsAmount - top.subtotal) / rfq.hpsAmount) * 100) : null,
  });
}

async function rfqAwardable(rfq, store) {
  const q = await store.get('quotations', id(rfq.recommendedQuotation));
  if (!q || q.status !== 'evaluated' || !q.rank) return 'Belum ada penawaran yang lulus evaluasi untuk diusulkan sebagai pemenang';
  if (q.validUntil && new Date(q.validUntil) < dayStart()) return 'Masa berlaku penawaran usulan pemenang sudah habis';
  const { error, remaining } = await budgetRemaining(store, id(rfq.budget));
  if (error) return error;
  if (q.subtotal > remaining) return `Kontrol anggaran: nilai penawaran ${fmtIdr(q.subtotal)} melebihi sisa anggaran (${fmtIdr(remaining)})`;
  return null;
}

/** Pemenang ditetapkan → status penawaran, PO otomatis, tautkan ke PR. */
async function rfqAwarded(rfq, store) {
  const winner = await store.get('quotations', id(rfq.recommendedQuotation));
  const quotes = await store.find('quotations', { rfq: id(rfq._id), status: { $in: LIVE_QUOTES } });
  for (const q of quotes) {
    const won = id(q._id) === id(winner._id);
    await store.update('quotations', id(q._id), { status: won ? 'awarded' : 'lost' }, won ? `Ditetapkan sebagai pemenang ${rfq.number}` : `Tidak terpilih pada ${rfq.number}`);
  }
  const vendor = await store.get('vendors', id(winner.vendor));
  const pr = rfq.requisition ? await store.get('requisitions', id(rfq.requisition)) : null;
  const po = await store.create('purchase-orders', {
    title: `${rfq.title} — ${name(vendor)}`.slice(0, 190), vendor: id(winner.vendor), budget: id(rfq.budget), sourcing: rfq.method,
    rfq: id(rfq._id), requisition: rfq.requisition ? id(rfq.requisition) : undefined, requester: pr ? id(pr.requester) || id(pr.createdBy) : undefined, neededBy: pr?.neededBy,
    items: (winner.items || []).map((l) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice })), taxRate: winner.taxRate,
    justification: `Pemenang ${rfq.number} (${winner.number}, skor ${winner.totalScore ?? '-'}). HPS ${fmtIdr(rfq.hpsAmount)}, penghematan ${fmtIdr(rfq.savingsAmount)}.`, status: 'approved', createdBy: id(rfq.createdBy) || undefined,
  });
  await recalcBudget(store, id(rfq.budget));
  await store.update('rfqs', id(rfq._id), { purchaseOrder: id(po._id) }, `PO ${po.number} diterbitkan untuk ${name(vendor)} (${fmtIdr(po.subtotal)})`);
  if (pr) await store.update('requisitions', id(pr._id), { processingNotes: `${pr.processingNotes || ''}; ${rfq.number} dimenangkan ${name(vendor)} → ${po.number}`.replace(/^; /, '') }, `${rfq.number} ditetapkan: ${po.number}`);
}

/** Validasi saat create/update (bukan transisi). */
export const VALIDATE = {
  quotations: async (q, store, { isNew, before }) => {
    const rfq = await store.get('rfqs', id(q.rfq));
    if (!rfq) return 'RFQ / tender tidak ditemukan';
    const sig = (d) => JSON.stringify([id(d?.vendor), (d?.items || []).map((l) => [l.description || '', Number(l.qty || 0), Number(l.unitPrice || 0)])]);
    const priceChanged = isNew || sig(before) !== sig(q);
    if (!priceChanged) return null;
    if (rfq.status !== 'published') return isNew ? `Penawaran hanya dapat dimasukkan saat ${rfq.number} sedang diumumkan (status: ${rfq.status})` : 'Harga & penyedia terkunci setelah pembukaan penawaran';
    if (rfq.closingDate && new Date(rfq.closingDate) < new Date()) return 'Batas waktu pemasukan penawaran telah lewat';
    if (rfq.method !== 'open_tender' && !(rfq.invitedVendors || []).map(id).includes(id(q.vendor))) return 'Penyedia ini tidak termasuk daftar undangan';
    const dup = (await store.find('quotations', { rfq: id(rfq._id), vendor: id(q.vendor), status: { $in: LIVE_QUOTES } })).filter((x) => id(x._id) !== id(q._id));
    if (dup.length) return `Penyedia sudah memasukkan penawaran ${dup[0].number}; tarik (withdraw) penawaran lama terlebih dahulu`;
    return null;
  },
};

export const CHECKS = {
  'purchase-orders': { pending_approval: budgetAvailable, approved: budgetAvailable },
  invoices: { verified: threeWayMatch },
  payments: { pending_approval: paymentValid, approved: paymentValid, executed: paymentValid },
  journals: { pending_approval: journalBalanced, posted: journalBalanced },
  'catalog-items': { pending_approval: catalogPublishable, published: catalogPublishable },
  requisitions: { pending_approval: (d, s) => requisitionCheck(d, s), approved: (d, s) => requisitionCheck(d, s, { final: true }) },
  rfqs: { published: rfqPublishable, evaluation: rfqOpenable, pending_approval: rfqAwardable, awarded: rfqAwardable },
};

export const EFFECTS = {
  'purchase-orders': { approved: (d, s) => recalcBudget(s, id(d.budget)), cancelled: (d, s) => recalcBudget(s, id(d.budget)), closed: (d, s) => recalcBudget(s, id(d.budget)) },
  invoices: { approved: invoiceApproved },
  payments: { executed: paymentExecuted },
  journals: { reversed: journalReversed },
  'control-tests': { concluded: controlTestConcluded },
  'dr-tests': { reported: drTestReported },
  requisitions: { approved: requisitionApproved },
  rfqs: { evaluation: evaluateRfq, awarded: rfqAwarded },
};

export const ON_SAVE = {
  racks: recalcDataCenter,
  budgets: (d, s) => recalcBudget(s, id(d._id)),
  // Nilai teknis / bobot diubah selama evaluasi → hitung ulang skor & peringkat
  quotations: async (d, s) => {
    const rfq = await s.get('rfqs', id(d.rfq));
    if (rfq?.status === 'evaluation') await evaluateRfq(rfq, s);
  },
  rfqs: (d, s) => (d.status === 'evaluation' ? evaluateRfq(d, s) : null),
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
  contracts: [
    { target: 'purchase-orders', label: 'Buat purchase order', link: 'contract', map: (d) => ({ title: `PO — ${d.title}`, vendor: id(d.vendor) }) },
    { target: 'catalog-items', label: 'Tambah item e-katalog', link: 'contract', map: (d) => ({ vendor: id(d.vendor), validUntil: d.endDate }) },
  ],
  budgets: [{ target: 'purchase-orders', label: 'Buat purchase order', link: 'budget', map: () => ({}) }],
  'catalog-items': [{ target: 'requisitions', label: 'Ajukan pembelian', map: (d) => ({ title: `Pembelian ${d.name}`.slice(0, 190), items: [{ catalogItem: id(d._id), vendor: id(d.vendor), sku: d.sku || d.number, description: d.name, qty: d.minOrderQty || 1, unit: d.unit, unitPrice: d.unitPrice }] }) }],
  rfqs: [{ target: 'quotations', label: 'Catat penawaran penyedia', link: 'rfq', map: (d) => ({ items: (d.items || []).map((l) => ({ description: l.description, qty: l.qty })) }) }],
  vendors: [{ target: 'contracts', label: 'Buat kontrak', link: 'vendor', map: (d) => ({ title: `Kontrak layanan ${d.name}`, dataLocation: d.dataLocation, rightToAudit: d.rightToAudit }) }, { target: 'catalog-items', label: 'Tambah item e-katalog', link: 'vendor', map: () => ({}) }],
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
