/**
 * Portal penyedia (vendor self-service) — dipakai server (/api/supplier) & backend demo melalui antarmuka `store`
 * (get/find/update/create/notify, otomatis terbatas pada tenant aktif).
 *
 * Prinsip keamanan: penyedia hanya melihat data miliknya sendiri (vendor = user.vendor) dan setiap respons
 * memakai daftar field yang diizinkan (whitelist) — HPS, penawaran pesaing, skor & catatan evaluasi internal
 * tidak pernah dikirim ke penyedia.
 */
import { VALIDATE } from './effects.mjs';
import { DEFAULT_TAX_RATE, round2, fmtIdr } from './finance.mjs';

const id = (v) => (v && typeof v === 'object' ? String(v._id) : v ? String(v) : null);
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const pick = (o, keys) => (o ? Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]])) : null);
const str = (v, max = 500) => (v == null ? undefined : String(v).trim().slice(0, max) || undefined);
const num = (v) => (v === '' || v == null ? undefined : Number(v));
const dayStart = () => new Date(new Date().toISOString().slice(0, 10));

/** Field profil yang boleh diubah penyedia sendiri. */
export const VENDOR_PROFILE_FIELDS = ['contactName', 'contactEmail', 'phone', 'address', 'website', 'npwp', 'nib', 'bankName', 'bankAccount', 'bankAccountName', 'subcontractors'];
const VENDOR_OUT = ['_id', 'number', 'name', 'category', 'status', 'certifications', 'dataLocation', 'registeredVia', 'profileUpdatedAt', 'createdAt', ...VENDOR_PROFILE_FIELDS];
const RFQ_OUT = ['_id', 'number', 'title', 'method', 'items', 'closingDate', 'evaluationCriteria', 'priceWeight', 'technicalWeight', 'status', 'openedAt', 'createdAt'];
const QUOTE_OUT = ['_id', 'number', 'vendorReference', 'submittedAt', 'items', 'subtotal', 'taxRate', 'taxAmount', 'total', 'deliveryDays', 'warrantyMonths', 'validUntil', 'documentUrl', 'supplierNotes', 'status', 'createdAt'];
const PO_OUT = ['_id', 'number', 'title', 'items', 'subtotal', 'taxRate', 'taxAmount', 'total', 'neededBy', 'status', 'sourcing', 'receivedDate', 'supplierAckAt', 'supplierPromisedDate', 'shippedAt', 'deliveryNote', 'createdAt'];
const INV_OUT = ['_id', 'number', 'vendorInvoiceNo', 'taxInvoiceNo', 'invoiceDate', 'dueDate', 'amount', 'taxRate', 'taxAmount', 'total', 'paidAmount', 'status', 'description', 'disputeReason', 'createdAt'];
const CAT_OUT = ['_id', 'number', 'name', 'sku', 'category', 'unit', 'unitPrice', 'minOrderQty', 'leadTimeDays', 'validUntil', 'tkdn', 'warrantyMonths', 'specification', 'status', 'createdAt'];
const CONTRACT_OUT = ['_id', 'number', 'title', 'contractType', 'startDate', 'endDate', 'status'];

/** RFQ yang terlihat oleh penyedia: diundang, atau tender terbuka yang sudah diumumkan. */
const RFQ_VISIBLE = ['published', 'evaluation', 'pending_approval', 'awarded', 'failed', 'cancelled'];
const PO_VISIBLE = ['approved', 'ordered', 'received', 'closed', 'cancelled'];
const LIVE_QUOTES = ['submitted', 'evaluated'];
const visibleRfq = (r, vid, vendorActive) =>
  RFQ_VISIBLE.includes(r.status) && ((r.invitedVendors || []).map(id).includes(vid) || (r.method === 'open_tender' && vendorActive && r.status !== 'cancelled'));

/** Hasil yang boleh diketahui penyedia atas penawarannya (tanpa skor & peringkat pesaing). */
const quoteResult = (q, rfq) => {
  if (!q) return rfq.status === 'published' ? 'Belum memasukkan penawaran' : 'Tidak memasukkan penawaran';
  if (q.status === 'awarded') return 'Ditetapkan sebagai pemenang';
  if (q.status === 'lost') return 'Tidak terpilih';
  if (q.status === 'disqualified') return 'Didiskualifikasi';
  if (q.status === 'withdrawn') return 'Ditarik';
  return rfq.status === 'published' ? 'Penawaran tersegel — menunggu pembukaan' : 'Dalam evaluasi';
};

async function context(store, user) {
  const vid = id(user.vendor);
  const vendor = vid && (await store.get('vendors', vid));
  if (!vendor) fail(403, 'Akun penyedia belum ditautkan ke data vendor. Hubungi procurement.');
  return { vid, vendor, active: vendor.status === 'active' };
}

const rfqOut = (r, mine = []) => {
  const live = mine.find((q) => LIVE_QUOTES.includes(q.status) || ['awarded', 'lost'].includes(q.status)) || mine[0];
  return { ...pick(r, RFQ_OUT), myQuotation: live ? pick(live, ['_id', 'number', 'status', 'subtotal', 'submittedAt']) : null, result: quoteResult(live, r) };
};

/**
 * Router portal penyedia. segments: path setelah /supplier (mis. ['rfqs', id, 'quotations']).
 */
export async function supplierRoute(store, user, method, segments, body = {}, query = {}) {
  const ctx = await context(store, user);
  const { vid, vendor } = ctx;
  const [res, rid, action] = segments;
  const mine = (doc) => doc && id(doc.vendor) === vid;
  const note = (msg) => `${msg} — oleh ${user.name} (portal penyedia)`;

  // ---------- Profil & ringkasan ----------
  if (res === 'me' && method === 'GET') {
    const [rfqs, quotes, pos, invoices, contracts, catalog] = await Promise.all([
      store.find('rfqs', { status: { $in: RFQ_VISIBLE } }), store.find('quotations', { vendor: vid }), store.find('purchase-orders', { vendor: vid, status: { $in: PO_VISIBLE } }),
      store.find('invoices', { vendor: vid }), store.find('contracts', { vendor: vid }), store.find('catalog-items', { vendor: vid }),
    ]);
    const visible = rfqs.filter((r) => visibleRfq(r, vid, ctx.active));
    const openInvites = visible.filter((r) => r.status === 'published' && !quotes.some((q) => id(q.rfq) === id(r._id) && LIVE_QUOTES.includes(q.status)));
    return {
      vendor: pick(vendor, VENDOR_OUT),
      summary: {
        openInvitations: openInvites.length,
        nextDeadline: openInvites.filter((r) => r.closingDate).sort((a, b) => new Date(a.closingDate) - new Date(b.closingDate)).map((r) => pick(r, ['_id', 'number', 'title', 'closingDate']))[0] || null,
        quotationsActive: quotes.filter((q) => LIVE_QUOTES.includes(q.status)).length,
        wins: quotes.filter((q) => q.status === 'awarded').length,
        posToAcknowledge: pos.filter((p) => ['approved', 'ordered'].includes(p.status) && !p.supplierAckAt).length,
        posToShip: pos.filter((p) => ['approved', 'ordered'].includes(p.status) && !p.shippedAt).length,
        poValue: round2(pos.filter((p) => p.status !== 'cancelled').reduce((s, p) => s + (p.subtotal || 0), 0)),
        invoicesOpen: invoices.filter((i) => !['paid', 'cancelled'].includes(i.status)).length,
        receivable: round2(invoices.filter((i) => !['paid', 'cancelled', 'rejected'].includes(i.status)).reduce((s, i) => s + (i.total || 0) - (i.paidAmount || 0), 0)),
        paid: round2(invoices.reduce((s, i) => s + (i.paidAmount || 0), 0)),
        catalogPublished: catalog.filter((c) => c.status === 'published').length,
      },
      contracts: contracts.filter((c) => ['active', 'renewal_review'].includes(c.status)).map((c) => pick(c, CONTRACT_OUT)),
    };
  }
  if (res === 'me' && method === 'PUT') {
    const patch = Object.fromEntries(VENDOR_PROFILE_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, str(body[k], 1000) ?? '']));
    if (patch.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.contactEmail)) fail(400, 'Email kontak tidak valid');
    if (patch.npwp && !/^[0-9.\-]{15,20}$/.test(patch.npwp)) fail(400, 'Format NPWP tidak valid (15–16 digit)');
    if (!Object.keys(patch).length) fail(400, 'Tidak ada perubahan');
    const updated = await store.update('vendors', vid, { ...patch, profileUpdatedAt: new Date().toISOString() }, note(`Profil diperbarui (${Object.keys(patch).join(', ')})`));
    if (['bankAccount', 'bankName', 'bankAccountName'].some((k) => k in patch)) {
      await store.notify({ roles: ['vendor_manager', 'accountant'] }, { title: `Rekening bank ${vendor.name} diubah melalui portal`, body: 'Verifikasi perubahan rekening sebelum pembayaran berikutnya (anti-fraud)', kind: 'approval', link: { resource: 'vendors', id: vid } });
    }
    return { vendor: pick(updated, VENDOR_OUT) };
  }

  // ---------- Undangan RFQ / tender ----------
  if (res === 'rfqs') {
    const quotes = await store.find('quotations', { vendor: vid });
    if (!rid && method === 'GET') {
      const rfqs = (await store.find('rfqs', { status: { $in: RFQ_VISIBLE } })).filter((r) => visibleRfq(r, vid, ctx.active));
      return { items: rfqs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((r) => rfqOut(r, quotes.filter((q) => id(q.rfq) === id(r._id)))) };
    }
    const rfq = await store.get('rfqs', rid);
    if (!rfq || !visibleRfq(rfq, vid, ctx.active)) fail(404, 'RFQ / tender tidak ditemukan');
    const my = quotes.filter((q) => id(q.rfq) === id(rfq._id));
    if (!action && method === 'GET') return { ...rfqOut(rfq, my), quotations: my.map((q) => pick(q, QUOTE_OUT)) };
    if (action === 'quotations' && method === 'POST') {
      if (!ctx.active) fail(403, `Status vendor Anda "${vendor.status}" — hanya penyedia terverifikasi (aktif) yang dapat memasukkan penawaran`);
      const prices = Array.isArray(body.items) ? body.items : [];
      const items = (rfq.items || []).map((l, i) => ({ description: l.description, qty: l.qty, unitPrice: num(prices[i]?.unitPrice) }));
      if (!items.length) fail(422, 'RFQ tidak memiliki rincian item');
      if (items.some((l) => !(l.unitPrice > 0))) fail(400, 'Isi harga satuan (> 0) untuk setiap item');
      const draft = {
        rfq: id(rfq._id), vendor: vid, items, taxRate: num(body.taxRate) ?? DEFAULT_TAX_RATE, deliveryDays: num(body.deliveryDays), warrantyMonths: num(body.warrantyMonths),
        validUntil: str(body.validUntil, 30), vendorReference: str(body.vendorReference, 100), documentUrl: str(body.documentUrl, 500), supplierNotes: str(body.supplierNotes, 2000),
      };
      if (draft.validUntil && new Date(draft.validUntil) < dayStart()) fail(400, 'Masa berlaku penawaran sudah lewat');
      const err = await VALIDATE.quotations(draft, store, { isNew: true });
      if (err) fail(422, err);
      const q = await store.create('quotations', { ...draft, submittedVia: 'Portal penyedia', submittedAt: new Date().toISOString() });
      // Notifikasi tanpa nilai harga (sampul tertutup sampai pembukaan)
      await store.notify({ roles: ['vendor_manager'] }, { title: `Penawaran masuk untuk ${rfq.number}`, body: `${vendor.name} · ${q.number} (tersegel sampai pembukaan)`, link: { resource: 'rfqs', id: id(rfq._id) } });
      return pick(q, QUOTE_OUT);
    }
  }

  // ---------- Penawaran saya ----------
  if (res === 'quotations') {
    if (!rid && method === 'GET') {
      const quotes = await store.find('quotations', { vendor: vid });
      const rfqs = await store.find('rfqs', { _id: { $in: [...new Set(quotes.map((q) => id(q.rfq)))] } });
      return {
        items: quotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((q) => {
          const r = rfqs.find((x) => id(x._id) === id(q.rfq));
          return { ...pick(q, QUOTE_OUT), rfq: pick(r, ['_id', 'number', 'title', 'status', 'closingDate']), result: r ? quoteResult(q, r) : '' };
        }),
      };
    }
    const q = await store.get('quotations', rid);
    if (!mine(q)) fail(404, 'Penawaran tidak ditemukan');
    if (action === 'withdraw' && method === 'POST') {
      const rfq = await store.get('rfqs', id(q.rfq));
      if (q.status !== 'submitted' || rfq?.status !== 'published') fail(422, 'Penawaran hanya dapat ditarik sebelum pembukaan penawaran');
      const updated = await store.update('quotations', rid, { status: 'withdrawn' }, note('Penawaran ditarik'));
      return pick(updated, QUOTE_OUT);
    }
  }

  // ---------- Purchase order ----------
  if (res === 'purchase-orders') {
    if (!rid && method === 'GET') {
      const pos = await store.find('purchase-orders', { vendor: vid, status: { $in: PO_VISIBLE } });
      return { items: pos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((p) => pick(p, PO_OUT)) };
    }
    const po = await store.get('purchase-orders', rid);
    if (!mine(po) || !PO_VISIBLE.includes(po.status)) fail(404, 'Purchase order tidak ditemukan');
    if (!action && method === 'GET') return pick(po, PO_OUT);
    const open = ['approved', 'ordered'].includes(po.status);
    const watchers = { userIds: [id(po.requester), id(po.createdBy)].filter(Boolean), roles: ['vendor_manager'] };
    if (action === 'acknowledge' && method === 'POST') {
      if (!open) fail(422, `PO berstatus ${po.status} tidak dapat dikonfirmasi`);
      const promised = str(body.promisedDate, 30);
      if (promised && new Date(promised) < dayStart()) fail(400, 'Tanggal janji kirim tidak boleh di masa lalu');
      const updated = await store.update('purchase-orders', rid, { supplierAckAt: new Date().toISOString(), supplierPromisedDate: promised }, note(`PO dikonfirmasi${promised ? `, janji kirim ${promised}` : ''}${body.notes ? ` — ${str(body.notes, 500)}` : ''}`));
      await store.notify(watchers, { title: `${po.number} dikonfirmasi ${vendor.name}`, body: promised ? `Janji kirim ${new Date(promised).toLocaleDateString('id-ID')}` : po.title, link: { resource: 'purchase-orders', id: rid } });
      return pick(updated, PO_OUT);
    }
    if (action === 'ship' && method === 'POST') {
      if (!open) fail(422, `PO berstatus ${po.status} tidak dapat ditandai dikirim`);
      const deliveryNote = str(body.deliveryNote, 1000);
      if (!deliveryNote) fail(400, 'Isi nomor surat jalan / keterangan pengiriman');
      const updated = await store.update('purchase-orders', rid, { shippedAt: new Date().toISOString(), deliveryNote, ...(po.supplierAckAt ? {} : { supplierAckAt: new Date().toISOString() }) }, note(`Barang/jasa dikirim: ${deliveryNote}`));
      await store.notify(watchers, { title: `${po.number} dikirim oleh ${vendor.name}`, body: `${deliveryNote} — lakukan pemeriksaan & BAST`, link: { resource: 'purchase-orders', id: rid } });
      return pick(updated, PO_OUT);
    }
  }

  // ---------- Tagihan (e-invoicing) ----------
  if (res === 'invoices') {
    if (!rid && method === 'GET') {
      const invoices = await store.find('invoices', { vendor: vid });
      const pos = await store.find('purchase-orders', { vendor: vid });
      return {
        items: invoices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((i) => ({ ...pick(i, INV_OUT), purchaseOrder: pick(pos.find((p) => id(p._id) === id(i.purchaseOrder)), ['_id', 'number', 'title']) })),
      };
    }
    if (!rid && method === 'POST') {
      const po = await store.get('purchase-orders', str(body.purchaseOrder, 40));
      if (!mine(po)) fail(404, 'Purchase order tidak ditemukan');
      if (!(['received', 'closed'].includes(po.status) || po.shippedAt)) fail(422, 'Tagihan dapat diajukan setelah barang/jasa dikirim atau diterima');
      const amount = num(body.amount);
      if (!(amount > 0)) fail(400, 'Nilai tagihan (sebelum pajak) harus lebih dari 0');
      const vendorInvoiceNo = str(body.vendorInvoiceNo, 60);
      if (!vendorInvoiceNo) fail(400, 'No. invoice wajib diisi');
      const existing = await store.find('invoices', { vendor: vid });
      if (existing.some((i) => i.vendorInvoiceNo === vendorInvoiceNo && i.status !== 'cancelled')) fail(409, `No. invoice ${vendorInvoiceNo} sudah pernah diajukan`);
      const billed = existing.filter((i) => id(i.purchaseOrder) === id(po._id) && !['cancelled', 'rejected'].includes(i.status)).reduce((s, i) => s + (i.amount || 0), 0);
      const remaining = round2((po.subtotal || 0) - billed);
      if (amount > remaining) fail(422, `Nilai tagihan ${fmtIdr(amount)} melebihi sisa PO yang belum ditagih (${fmtIdr(remaining)})`);
      const inv = await store.create('invoices', {
        vendorInvoiceNo, taxInvoiceNo: str(body.taxInvoiceNo, 60), purchaseOrder: id(po._id), vendor: vid, invoiceDate: str(body.invoiceDate, 30) || new Date().toISOString(),
        amount, taxRate: po.taxRate ?? DEFAULT_TAX_RATE, description: str(body.description, 1000) || `Tagihan atas ${po.number}`, status: 'received',
      });
      await store.notify({ roles: ['accountant'] }, { title: `E-invoice baru dari ${vendor.name}`, body: `${inv.number} · ${vendorInvoiceNo} atas ${po.number} (${fmtIdr(inv.total)})`, link: { resource: 'invoices', id: id(inv._id) } });
      return pick(inv, INV_OUT);
    }
  }

  // ---------- Katalog saya (usulan item / revisi harga) ----------
  if (res === 'catalog') {
    if (!rid && method === 'GET') return { items: (await store.find('catalog-items', { vendor: vid })).sort((a, b) => String(a.name).localeCompare(String(b.name))).map((c) => pick(c, CAT_OUT)) };
    const data = {
      name: str(body.name, 190), sku: str(body.sku, 60), category: str(body.category, 30), unit: str(body.unit, 30), unitPrice: num(body.unitPrice), minOrderQty: num(body.minOrderQty),
      leadTimeDays: num(body.leadTimeDays), validUntil: str(body.validUntil, 30), tkdn: num(body.tkdn), warrantyMonths: num(body.warrantyMonths), specification: str(body.specification, 4000),
    };
    if (!rid && method === 'POST') {
      if (!ctx.active) fail(403, 'Hanya penyedia aktif yang dapat mengusulkan item katalog');
      if (!data.name || !(data.unitPrice > 0)) fail(400, 'Nama dan harga satuan wajib diisi');
      const contract = await store.get('contracts', str(body.contract, 40));
      if (!mine(contract) || contract.status !== 'active') fail(422, 'Pilih kontrak payung aktif milik perusahaan Anda');
      const c = await store.create('catalog-items', { ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)), vendor: vid, contract: id(contract._id), status: 'draft' });
      await store.notify({ roles: ['vendor_manager'] }, { title: `Usulan item e-katalog dari ${vendor.name}`, body: `${c.number} · ${c.name} (${fmtIdr(c.unitPrice)})`, link: { resource: 'catalog-items', id: id(c._id) } });
      return pick(c, CAT_OUT);
    }
    const item = await store.get('catalog-items', rid);
    if (!mine(item)) fail(404, 'Item katalog tidak ditemukan');
    if (method === 'PUT') {
      if (!['draft', 'rejected'].includes(item.status)) fail(422, 'Item yang sudah diajukan/tayang hanya dapat direvisi setelah procurement mengembalikannya ke draft');
      const patch = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      const updated = await store.update('catalog-items', rid, patch, note('Usulan katalog direvisi'));
      return pick(updated, CAT_OUT);
    }
  }

  fail(404, 'Endpoint portal penyedia tidak ditemukan');
}

/** Validasi data registrasi mandiri penyedia (dipakai server & demo). */
export function validateSupplierRegistration(b = {}) {
  const data = {
    companyName: str(b.companyName, 190), category: str(b.category, 30) || 'other', npwp: str(b.npwp, 25), nib: str(b.nib, 30), address: str(b.address, 1000), phone: str(b.phone, 40),
    website: str(b.website, 200), contactName: str(b.contactName, 120), email: str(b.email, 200)?.toLowerCase(), password: String(b.password || ''),
  };
  if (!data.companyName) return { error: 'Nama perusahaan wajib diisi' };
  if (!data.contactName) return { error: 'Nama penanggung jawab wajib diisi' };
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return { error: 'Email tidak valid' };
  if (!data.npwp || !/^[0-9.\-]{15,20}$/.test(data.npwp)) return { error: 'NPWP wajib diisi (15–16 digit)' };
  if (data.password.length < 8) return { error: 'Password minimal 8 karakter' };
  if (!b.agree) return { error: 'Anda harus menyetujui pakta integritas & ketentuan penyedia' };
  const CATS = ['cloud', 'data_center', 'software', 'hardware', 'network', 'managed_service', 'consulting', 'other'];
  if (!CATS.includes(data.category)) data.category = 'other';
  return { data };
}

/** Data vendor awal hasil registrasi mandiri (status prospek → due diligence oleh procurement). */
export const vendorFromRegistration = (d) => ({
  name: d.companyName, category: d.category, npwp: d.npwp, nib: d.nib, address: d.address, phone: d.phone, website: d.website,
  contactName: d.contactName, contactEmail: d.email, status: 'prospect', registeredVia: 'self_service', profileUpdatedAt: new Date().toISOString(),
});
