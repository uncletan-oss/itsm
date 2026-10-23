import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, FormatValue, fmtDate, fmtDateTime, fmtMoney } from '../components/format.jsx';
import Icon from '../components/Icon.jsx';
import { Empty, Modal, PageHeader, useToast } from '../components/ui.jsx';
import { MODULE_DEFS } from '../../../shared/modules.mjs';
import { DEFAULT_TAX_RATE, round2 } from '../../../shared/finance.mjs';

/**
 * Portal penyedia (vendor self-service): undangan RFQ/tender & pengajuan penawaran, konfirmasi & pengiriman PO,
 * e-invoice, usulan item e-katalog, serta profil & rekening perusahaan. Semua data lewat /api/supplier.
 */
const opt = (res, key) => Object.fromEntries(MODULE_DEFS[res].fields.find((f) => f.key === key).options);
const METHOD = opt('rfqs', 'method');
const CATEGORY = opt('catalog-items', 'category');
const VENDOR_STATUS = { prospect: 'Prospek — menunggu verifikasi', due_diligence: 'Due diligence oleh procurement', pending_approval: 'Menunggu persetujuan', active: 'Terverifikasi (aktif)', under_review: 'Dalam review berkala', rejected: 'Ditolak', terminated: 'Diputus' };
const RESULT_TONE = { 'Ditetapkan sebagai pemenang': 'green', 'Tidak terpilih': 'gray', Didiskualifikasi: 'red', Ditarik: 'gray', 'Belum memasukkan penawaran': 'amber' };

function useData(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api(path).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), [path]);
  useEffect(() => { load(); }, [load]);
  return { data, error, reload: load };
}

const compact = (v) => {
  const n = Number(v) || 0;
  if (n >= 1e9) return `Rp ${(n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 0 })} jt`;
  return fmtMoney(n);
};

function countdown(date) {
  if (!date) return '';
  const ms = new Date(date) - Date.now();
  if (ms <= 0) return 'ditutup';
  const d = Math.floor(ms / 864e5);
  const h = Math.floor((ms % 864e5) / 36e5);
  return d > 0 ? `${d} hari ${h} jam lagi` : `${h} jam lagi`;
}

const Loading = () => <div className="card"><div className="skeleton" style={{ height: 160 }} /></div>;
const ErrorBox = ({ error }) => error ? <div className="alert"><Icon name="alert" size="sm" />{error}</div> : null;

function Kpi({ icon, value, label, tone = '', to }) {
  const body = <><span className="kpi-ic"><Icon name={icon} /></span><span><div className="kpi-value nowrap">{value}</div><div className="kpi-label">{label}</div></span></>;
  return to ? <Link to={to} className={`kpi ${tone}`} style={{ color: 'inherit', textDecoration: 'none' }}>{body}</Link> : <div className={`kpi ${tone}`}>{body}</div>;
}

// ============================ Beranda ============================
export function SupplierHome() {
  const { data, error } = useData('/supplier/me');
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const { vendor, summary: s, contracts } = data;
  const active = vendor.status === 'active';
  return (
    <div>
      <PageHeader icon="building" title={vendor.name} description={`${vendor.number || ''} · Portal penyedia — undangan pengadaan, penawaran, purchase order, dan tagihan Anda dalam satu tempat.`} />
      {!active && (
        <div className="alert warn"><Icon name="clock" size="sm" />
          <span>Status penyedia: <b>{VENDOR_STATUS[vendor.status] || vendor.status}</b>. Procurement sedang memverifikasi legalitas & due diligence. Lengkapi <Link to="/profile">profil, NPWP/NIB, dan rekening</Link> untuk mempercepat verifikasi — undangan RFQ/tender hanya untuk penyedia terverifikasi.</span>
        </div>
      )}
      <div className="kpis">
        <Kpi icon="gavel" value={s.openInvitations} label="Undangan terbuka" tone={s.openInvitations ? 'tone-gold' : ''} to="/rfqs" />
        <Kpi icon="inbox" value={s.quotationsActive} label="Penawaran dalam proses" to="/quotations" />
        <Kpi icon="check" value={s.wins} label="Kemenangan" tone="tone-green" to="/quotations" />
        <Kpi icon="cart" value={s.posToAcknowledge} label="PO perlu konfirmasi" tone={s.posToAcknowledge ? 'tone-red' : ''} to="/purchase-orders" />
        <Kpi icon="receipt" value={compact(s.receivable)} label={`Tagihan berjalan (${s.invoicesOpen})`} to="/invoices" />
        <Kpi icon="wallet" value={compact(s.paid)} label="Sudah dibayar" tone="tone-green" to="/invoices" />
      </div>
      <div className="grid-2">
        <div className="card">
          <h3>Batas penawaran terdekat</h3>
          {s.nextDeadline ? (
            <Link to={`/rfqs/${s.nextDeadline._id}`} className="list-row">
              <span className="mono small muted">{s.nextDeadline.number}</span>
              <span className="grow list-title">{s.nextDeadline.title}</span>
              <Badge tone="amber">{countdown(s.nextDeadline.closingDate)}</Badge>
            </Link>
          ) : <p className="muted small">Tidak ada undangan yang menunggu penawaran Anda.</p>}
          <h3 style={{ marginTop: 18 }}>Ringkasan</h3>
          <dl className="kv">
            <dt>Nilai PO diterima</dt><dd>{fmtMoney(s.poValue)}</dd>
            <dt>PO belum dikirim</dt><dd>{s.posToShip}</dd>
            <dt>Item e-katalog tayang</dt><dd>{s.catalogPublished}</dd>
          </dl>
        </div>
        <div className="card">
          <h3>Kontrak aktif</h3>
          {contracts.length ? contracts.map((c) => (
            <div key={c._id} className="list-row">
              <span className="mono small muted">{c.number}</span>
              <span className="grow list-title">{c.title}</span>
              <span className="small muted nowrap">s.d. {fmtDate(c.endDate) || '—'}</span>
            </div>
          )) : <p className="muted small">Belum ada kontrak aktif.</p>}
          <div className="alert" style={{ marginTop: 14, background: 'var(--surface-2)', color: 'var(--text-2)' }}>
            <Icon name="shield" size="sm" />
            <span className="small">Pakta integritas: dilarang memberi gratifikasi, melakukan persekongkolan harga, atau mengungkap informasi pengadaan. Penawaran bersifat <b>tersegel</b> sampai pembukaan — pihak pembeli tidak dapat melihat harga Anda sebelumnya.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================ Undangan RFQ / tender ============================
export function SupplierRfqs() {
  const { data, error } = useData('/supplier/rfqs');
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader icon="gavel" title="Undangan & Tender" description="RFQ dan tender yang mengundang perusahaan Anda, serta tender terbuka yang sedang diumumkan." />
      <ErrorBox error={error} />
      {!data ? <Loading /> : !data.items.length ? <div className="card"><Empty icon="gavel" title="Belum ada undangan">Undangan RFQ/tender akan tampil di sini dan dikirim sebagai notifikasi.</Empty></div> : (
        <div className="card flush"><div className="table-wrap">
          <table>
            <thead><tr><th>Nomor</th><th>Paket</th><th>Metode</th><th>Batas penawaran</th><th>Status</th><th>Penawaran Anda</th></tr></thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r._id} className="clickable" onClick={() => navigate(`/rfqs/${r._id}`)}>
                  <td className="mono">{r.number}</td>
                  <td><b>{r.title}</b></td>
                  <td>{METHOD[r.method] || r.method}</td>
                  <td className="nowrap">{fmtDateTime(r.closingDate)}{r.status === 'published' && <div className="small muted">{countdown(r.closingDate)}</div>}</td>
                  <td><FormatValue name="status" value={r.status} /></td>
                  <td><Badge tone={RESULT_TONE[r.result] || 'indigo'}>{r.result}</Badge>{r.myQuotation?.subtotal != null && <div className="small muted nowrap">{fmtMoney(r.myQuotation.subtotal)}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
    </div>
  );
}

export function SupplierRfq() {
  const { id } = useParams();
  const { data: rfq, error, reload } = useData(`/supplier/rfqs/${id}`);
  const { data: me } = useData('/supplier/me');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (error) return <ErrorBox error={error} />;
  if (!rfq) return <Loading />;
  const live = rfq.quotations.find((q) => ['submitted', 'evaluated', 'awarded', 'lost'].includes(q.status));
  const canBid = rfq.status === 'published' && !live && me?.vendor.status === 'active' && new Date(rfq.closingDate) > new Date();
  const withdraw = async (q) => {
    if (!window.confirm(`Tarik penawaran ${q.number}? Anda dapat mengajukan penawaran baru sebelum batas waktu.`)) return;
    setBusy(true);
    try {
      await api(`/supplier/quotations/${q._id}/withdraw`, { method: 'POST' });
      toast('Penawaran ditarik');
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusy(false);
  };
  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/rfqs" className="eyebrow"><Icon name="arrowLeft" size="sm" />Undangan & Tender</Link>
          <h1><span className="muted mono" style={{ fontSize: 16, marginRight: 8 }}>{rfq.number}</span>{rfq.title}</h1>
          <div className="row" style={{ marginTop: 10 }}>
            <FormatValue name="status" value={rfq.status} />
            <Badge tone={RESULT_TONE[rfq.result] || 'indigo'}>{rfq.result}</Badge>
            {rfq.status === 'published' && <Badge tone="amber"><Icon name="clock" size="sm" />{countdown(rfq.closingDate)}</Badge>}
          </div>
        </div>
      </div>
      <div className="detail-layout">
        <div>
          <div className="card">
            <h3>Lingkup pengadaan</h3>
            <table className="lines-view">
              <thead><tr><th>#</th><th>Barang/jasa</th><th className="num">Qty</th><th>Satuan</th></tr></thead>
              <tbody>{(rfq.items || []).map((l, i) => <tr key={i}><td>{i + 1}</td><td>{l.description}</td><td className="num">{l.qty}</td><td>{l.unit}</td></tr>)}</tbody>
            </table>
            {rfq.evaluationCriteria && <><h3 style={{ marginTop: 16 }}>Kriteria evaluasi</h3><p className="pre" style={{ margin: 0 }}>{rfq.evaluationCriteria}</p></>}
          </div>
          {canBid && <BidForm rfq={rfq} onDone={reload} />}
          {rfq.status === 'published' && !live && me && me.vendor.status !== 'active' && <div className="alert warn"><Icon name="lock" size="sm" />Hanya penyedia terverifikasi yang dapat memasukkan penawaran.</div>}
          {rfq.quotations.length > 0 && (
            <div className="card flush">
              <div className="card-head"><h3>Penawaran Anda</h3></div>
              <div className="table-wrap"><table>
                <thead><tr><th>Nomor</th><th>Diajukan</th><th className="num">Harga (sblm PPN)</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rfq.quotations.map((q) => (
                    <tr key={q._id}>
                      <td className="mono">{q.number}</td>
                      <td className="nowrap">{fmtDateTime(q.submittedAt)}</td>
                      <td className="num nowrap">{fmtMoney(q.subtotal)}</td>
                      <td><FormatValue name="status" value={q.status} /></td>
                      <td>{q.status === 'submitted' && rfq.status === 'published' && <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => withdraw(q)}>Tarik</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </div>
        <aside>
          <div className="card">
            <h3>Informasi</h3>
            <dl className="kv">
              <dt>Metode</dt><dd>{METHOD[rfq.method] || rfq.method}</dd>
              <dt>Batas penawaran</dt><dd>{fmtDateTime(rfq.closingDate)}</dd>
              <dt>Bobot harga</dt><dd>{rfq.priceWeight ?? 70}%</dd>
              <dt>Bobot teknis</dt><dd>{rfq.technicalWeight ?? 30}%</dd>
              {rfq.openedAt && <><dt>Dibuka</dt><dd>{fmtDateTime(rfq.openedAt)}</dd></>}
            </dl>
          </div>
          <div className="card small muted">
            <Icon name="lock" size="sm" /> Penawaran tersegel hingga pembukaan. Harga tidak dapat diubah setelah diajukan — tarik lalu ajukan ulang sebelum batas waktu. Hasil evaluasi rinci & penawaran pesaing tidak ditampilkan.
          </div>
        </aside>
      </div>
    </div>
  );
}

function BidForm({ rfq, onDone }) {
  const toast = useToast();
  const [prices, setPrices] = useState(() => (rfq.items || []).map(() => ''));
  const [f, setF] = useState({ deliveryDays: '', warrantyMonths: '', validUntil: '', vendorReference: '', documentUrl: '', supplierNotes: '' });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const subtotal = round2((rfq.items || []).reduce((s, l, i) => s + Number(l.qty || 0) * Number(prices[i] || 0), 0));
  const tax = round2((subtotal * DEFAULT_TAX_RATE) / 100);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (!window.confirm(`Ajukan penawaran ${fmtMoney(subtotal)} (sebelum PPN)? Harga tidak dapat diubah setelah diajukan.`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/supplier/rfqs/${rfq._id}/quotations`, { method: 'POST', body: { ...f, items: prices.map((p) => ({ unitPrice: Number(p) })) } });
      toast('Penawaran berhasil diajukan dan tersegel sampai pembukaan');
      onDone();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };
  return (
    <form className="card" onSubmit={submit}>
      <h3 className="row"><Icon name="edit" size="sm" />Ajukan penawaran</h3>
      {error && <div className="alert"><Icon name="alert" size="sm" />{error}</div>}
      <div className="table-wrap">
        <table className="lines-view">
          <thead><tr><th>Barang/jasa</th><th className="num">Qty</th><th>Harga satuan (Rp)</th><th className="num">Jumlah</th></tr></thead>
          <tbody>
            {(rfq.items || []).map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td>
                <td className="num">{l.qty} {l.unit}</td>
                <td><input type="number" min="1" step="any" required value={prices[i]} onChange={(e) => setPrices(prices.map((p, j) => (j === i ? e.target.value : p)))} aria-label={`Harga satuan ${l.description}`} /></td>
                <td className="num nowrap">{fmtMoney(Number(l.qty || 0) * Number(prices[i] || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="kv cart-total" style={{ margin: '12px 0 12px auto' }}>
        <dt>Subtotal</dt><dd>{fmtMoney(subtotal)}</dd>
        <dt>PPN {DEFAULT_TAX_RATE}%</dt><dd>{fmtMoney(tax)}</dd>
        <dt><b>Total</b></dt><dd><b>{fmtMoney(subtotal + tax)}</b></dd>
      </dl>
      <div className="form-grid">
        <label><span>Waktu penyerahan (hari)</span><input type="number" min="0" value={f.deliveryDays} onChange={set('deliveryDays')} /></label>
        <label><span>Garansi (bulan)</span><input type="number" min="0" value={f.warrantyMonths} onChange={set('warrantyMonths')} /></label>
        <label><span>Masa berlaku penawaran</span><input type="date" value={f.validUntil} onChange={set('validUntil')} /></label>
        <label><span>No. surat penawaran</span><input value={f.vendorReference} onChange={set('vendorReference')} /></label>
        <label className="full"><span>Tautan dokumen penawaran (teknis, legalitas)</span><input value={f.documentUrl} onChange={set('documentUrl')} placeholder="https://…" /></label>
        <label className="full"><span>Catatan / klarifikasi</span><textarea rows={3} value={f.supplierNotes} onChange={set('supplierNotes')} /></label>
      </div>
      <label className="inline" style={{ marginTop: 12 }}><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>Saya menyatakan penawaran ini sah, sesuai spesifikasi, dan mematuhi pakta integritas.</span></label>
      <div className="row end" style={{ marginTop: 12 }}><button className="btn btn-primary" disabled={busy || !agree || !(subtotal > 0)}><Icon name="check" size="sm" />Ajukan penawaran</button></div>
    </form>
  );
}

// ============================ Penawaran saya ============================
export function SupplierQuotations() {
  const { data, error } = useData('/supplier/quotations');
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader icon="inbox" title="Penawaran Saya" description="Riwayat penawaran yang diajukan perusahaan Anda beserta hasilnya." />
      <ErrorBox error={error} />
      {!data ? <Loading /> : !data.items.length ? <div className="card"><Empty icon="inbox" title="Belum ada penawaran" /></div> : (
        <div className="card flush"><div className="table-wrap"><table>
          <thead><tr><th>Nomor</th><th>RFQ / tender</th><th>Diajukan</th><th className="num">Harga (sblm PPN)</th><th>Status</th><th>Hasil</th></tr></thead>
          <tbody>
            {data.items.map((q) => (
              <tr key={q._id} className="clickable" onClick={() => q.rfq && navigate(`/rfqs/${q.rfq._id}`)}>
                <td className="mono">{q.number}</td>
                <td><b>{q.rfq?.title}</b><div className="small muted mono">{q.rfq?.number}</div></td>
                <td className="nowrap">{fmtDateTime(q.submittedAt)}</td>
                <td className="num nowrap">{fmtMoney(q.subtotal)}</td>
                <td><FormatValue name="status" value={q.status} /></td>
                <td><Badge tone={RESULT_TONE[q.result] || 'indigo'}>{q.result}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
    </div>
  );
}

// ============================ Purchase order ============================
export function SupplierOrders() {
  const { data, error, reload } = useData('/supplier/purchase-orders');
  const [modal, setModal] = useState(null);
  const [open, setOpen] = useState(null);
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader icon="cart" title="Purchase Order" description="PO yang diterbitkan untuk perusahaan Anda: konfirmasi penerimaan PO & janji kirim, catat pengiriman (surat jalan), lalu ajukan tagihan." />
      <ErrorBox error={error} />
      {!data ? <Loading /> : !data.items.length ? <div className="card"><Empty icon="cart" title="Belum ada purchase order" /></div> : data.items.map((p) => {
        const actionable = ['approved', 'ordered'].includes(p.status);
        const step = p.receivedDate ? 3 : p.shippedAt ? 2 : p.supplierAckAt ? 1 : 0;
        return (
          <div key={p._id} className="card">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div className="small muted mono">{p.number} · {fmtDate(p.createdAt)}</div>
                <h3 style={{ margin: '4px 0' }}>{p.title}</h3>
                <div className="row small">
                  <FormatValue name="status" value={p.status} />
                  <span className="muted">Total {fmtMoney(p.total)} (incl. PPN)</span>
                  {p.neededBy && <span className="muted">· dibutuhkan {fmtDate(p.neededBy)}</span>}
                </div>
              </div>
              <div className="row end">
                {actionable && !p.supplierAckAt && <button className="btn btn-primary" onClick={() => setModal({ type: 'ack', po: p })}><Icon name="check" size="sm" />Konfirmasi PO</button>}
                {actionable && !p.shippedAt && <button className="btn" onClick={() => setModal({ type: 'ship', po: p })}><Icon name="arrowRight" size="sm" />Tandai dikirim</button>}
                {(p.shippedAt || p.receivedDate) && p.status !== 'cancelled' && <button className="btn" onClick={() => navigate(`/invoices?po=${p._id}`)}><Icon name="receipt" size="sm" />Ajukan tagihan</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => setOpen(open === p._id ? null : p._id)}>{open === p._id ? 'Tutup' : 'Rincian'}</button>
              </div>
            </div>
            <ol className="po-track">
              {['PO diterbitkan', `Dikonfirmasi${p.supplierPromisedDate ? ` · janji ${fmtDate(p.supplierPromisedDate)}` : ''}`, `Dikirim${p.deliveryNote ? ` · ${p.deliveryNote}` : ''}`, 'Diterima pembeli (BAST)'].map((l, i) => (
                <li key={i} className={i <= step ? 'done' : ''}><span className="dot-step">{i <= step ? '✓' : i + 1}</span>{l}</li>
              ))}
            </ol>
            {open === p._id && (
              <table className="lines-view" style={{ marginTop: 10 }}>
                <thead><tr><th>Barang/jasa</th><th className="num">Qty</th><th className="num">Harga satuan</th><th className="num">Jumlah</th></tr></thead>
                <tbody>{(p.items || []).map((l, i) => <tr key={i}><td>{l.description}</td><td className="num">{l.qty}</td><td className="num">{fmtMoney(l.unitPrice)}</td><td className="num">{fmtMoney(l.qty * l.unitPrice)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        );
      })}
      {modal && <PoActionModal {...modal} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
    </div>
  );
}

function PoActionModal({ type, po, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ promisedDate: '', notes: '', deliveryNote: '' });
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api(`/supplier/purchase-orders/${po._id}/${type === 'ack' ? 'acknowledge' : 'ship'}`, { method: 'POST', body: f });
      toast(type === 'ack' ? `${po.number} dikonfirmasi` : `Pengiriman ${po.number} dicatat`);
      onDone();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal title={`${type === 'ack' ? 'Konfirmasi' : 'Catat pengiriman'} ${po.number}`} onClose={onClose} width={480}>
      <form onSubmit={submit}>
        <div className="modal-body stack">
          {error && <div className="alert">{error}</div>}
          {type === 'ack' ? (
            <>
              <label><span>Janji tanggal kirim</span><input type="date" value={f.promisedDate} onChange={(e) => setF({ ...f, promisedDate: e.target.value })} /></label>
              <label><span>Catatan</span><textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
            </>
          ) : (
            <label><span>No. surat jalan / keterangan pengiriman *</span><textarea rows={3} required value={f.deliveryNote} onChange={(e) => setF({ ...f, deliveryNote: e.target.value })} placeholder="mis. SJ/2026/0412 — 10 unit dikirim via ekspedisi X" /></label>
          )}
        </div>
        <div className="form-actions"><button type="button" className="btn" onClick={onClose}>Batal</button><button className="btn btn-primary">Simpan</button></div>
      </form>
    </Modal>
  );
}

// ============================ Tagihan (e-invoice) ============================
export function SupplierInvoices() {
  const { data, error, reload } = useData('/supplier/invoices');
  const { data: pos } = useData('/supplier/purchase-orders');
  const [params, setParams] = useSearchParams();
  const [show, setShow] = useState(!!params.get('po'));
  const eligible = (pos?.items || []).filter((p) => (p.shippedAt || p.receivedDate) && p.status !== 'cancelled');
  return (
    <div>
      <PageHeader icon="receipt" title="Tagihan (e-Invoice)" description="Ajukan tagihan atas PO yang sudah dikirim/diterima dan pantau verifikasi 3-way match, persetujuan, hingga pembayaran."
        actions={<button className="btn btn-primary" onClick={() => setShow(true)} disabled={!eligible.length}><Icon name="plus" size="sm" />Ajukan tagihan</button>} />
      <ErrorBox error={error} />
      {!data ? <Loading /> : !data.items.length ? <div className="card"><Empty icon="receipt" title="Belum ada tagihan">Tagihan dapat diajukan setelah PO dikirim.</Empty></div> : (
        <div className="card flush"><div className="table-wrap"><table>
          <thead><tr><th>No. invoice</th><th>PO</th><th>Tanggal</th><th className="num">Total</th><th className="num">Dibayar</th><th>Status</th></tr></thead>
          <tbody>
            {data.items.map((i) => (
              <tr key={i._id}>
                <td><b>{i.vendorInvoiceNo}</b><div className="small muted mono">{i.number}{i.taxInvoiceNo ? ` · FP ${i.taxInvoiceNo}` : ''}</div></td>
                <td className="mono small">{i.purchaseOrder?.number}</td>
                <td className="nowrap">{fmtDate(i.invoiceDate)}{i.dueDate && <div className="small muted">jatuh tempo {fmtDate(i.dueDate)}</div>}</td>
                <td className="num nowrap">{fmtMoney(i.total)}</td>
                <td className="num nowrap">{fmtMoney(i.paidAmount || 0)}</td>
                <td><FormatValue name="status" value={i.status} />{i.disputeReason && i.status === 'disputed' && <div className="small" style={{ color: 'var(--red)' }}>{i.disputeReason}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
      {show && pos && <InvoiceModal pos={eligible} invoices={data?.items || []} initialPo={params.get('po')} onClose={() => { setShow(false); setParams({}); }} onDone={() => { setShow(false); setParams({}); reload(); }} />}
    </div>
  );
}

function InvoiceModal({ pos, invoices, initialPo, onClose, onDone }) {
  const toast = useToast();
  const remaining = (p) => round2((p?.subtotal || 0) - invoices.filter((i) => i.purchaseOrder?._id === p?._id && !['cancelled', 'rejected'].includes(i.status)).reduce((s, i) => s + (i.amount || 0), 0));
  const first = pos.find((p) => p._id === initialPo) || pos[0];
  const [f, setF] = useState({ purchaseOrder: first?._id || '', vendorInvoiceNo: '', taxInvoiceNo: '', invoiceDate: new Date().toISOString().slice(0, 10), amount: remaining(first) || '', description: '' });
  const [error, setError] = useState('');
  const po = pos.find((p) => p._id === f.purchaseOrder);
  const tax = round2((Number(f.amount || 0) * (po?.taxRate ?? DEFAULT_TAX_RATE)) / 100);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api('/supplier/invoices', { method: 'POST', body: { ...f, amount: Number(f.amount) } });
      toast('Tagihan terkirim ke Accounts Payable');
      onDone();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal title="Ajukan tagihan (e-invoice)" onClose={onClose} width={560}>
      <form onSubmit={submit}>
        <div className="modal-body stack">
          {error && <div className="alert">{error}</div>}
          <label><span>Purchase order *</span>
            <select required value={f.purchaseOrder} onChange={(e) => { const p = pos.find((x) => x._id === e.target.value); setF({ ...f, purchaseOrder: e.target.value, amount: remaining(p) }); }}>
              {pos.map((p) => <option key={p._id} value={p._id}>{p.number} · {p.title} (sisa {fmtMoney(remaining(p))})</option>)}
            </select>
          </label>
          <div className="form-grid">
            <label><span>No. invoice *</span><input required value={f.vendorInvoiceNo} onChange={set('vendorInvoiceNo')} /></label>
            <label><span>No. faktur pajak</span><input value={f.taxInvoiceNo} onChange={set('taxInvoiceNo')} placeholder="010.000-26.xxxxxxxx" /></label>
            <label><span>Tanggal invoice</span><input type="date" value={f.invoiceDate} onChange={set('invoiceDate')} /></label>
            <label><span>Nilai sebelum PPN (Rp) *</span><input type="number" min="1" step="any" required value={f.amount} onChange={set('amount')} /></label>
            <label className="full"><span>Keterangan</span><textarea rows={2} value={f.description} onChange={set('description')} /></label>
          </div>
          <dl className="kv cart-total"><dt>PPN {po?.taxRate ?? DEFAULT_TAX_RATE}%</dt><dd>{fmtMoney(tax)}</dd><dt><b>Total tagihan</b></dt><dd><b>{fmtMoney(Number(f.amount || 0) + tax)}</b></dd></dl>
          <p className="small muted" style={{ margin: 0 }}>Tagihan diverifikasi dengan 3-way match (PO – penerimaan barang – tagihan) sebelum disetujui dan dibayar ke rekening terdaftar.</p>
        </div>
        <div className="form-actions"><button type="button" className="btn" onClick={onClose}>Batal</button><button className="btn btn-primary"><Icon name="check" size="sm" />Kirim tagihan</button></div>
      </form>
    </Modal>
  );
}

// ============================ Katalog saya ============================
export function SupplierCatalog() {
  const { data, error, reload } = useData('/supplier/catalog');
  const { data: me } = useData('/supplier/me');
  const [edit, setEdit] = useState(null);
  return (
    <div>
      <PageHeader icon="grid" title="Katalog Saya" description="Item e-katalog perusahaan Anda. Usulkan item baru atau revisi harga berdasarkan kontrak payung — tayang setelah divalidasi procurement, controller & arsitek."
        actions={<button className="btn btn-primary" onClick={() => setEdit({})} disabled={!me?.contracts.length}><Icon name="plus" size="sm" />Usulkan item</button>} />
      <ErrorBox error={error} />
      {me && !me.contracts.length && <div className="alert warn"><Icon name="alert" size="sm" />Belum ada kontrak payung aktif — usulan item katalog memerlukan kontrak.</div>}
      {!data ? <Loading /> : !data.items.length ? <div className="card"><Empty icon="grid" title="Belum ada item katalog" /></div> : (
        <div className="card flush"><div className="table-wrap"><table>
          <thead><tr><th>Item</th><th>Kategori</th><th className="num">Harga</th><th>Berlaku s.d.</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data.items.map((c) => (
              <tr key={c._id}>
                <td><b>{c.name}</b><div className="small muted mono">{c.number} · {c.sku}</div></td>
                <td>{CATEGORY[c.category] || c.category}</td>
                <td className="num nowrap">{fmtMoney(c.unitPrice)}<span className="small muted"> / {c.unit || 'unit'}</span></td>
                <td>{fmtDate(c.validUntil)}</td>
                <td><FormatValue name="status" value={c.status} /></td>
                <td>{['draft', 'rejected'].includes(c.status) && <button className="btn btn-sm" onClick={() => setEdit(c)}>Revisi</button>}</td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
      {edit && <CatalogModal item={edit} contracts={me?.contracts || []} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function CatalogModal({ item, contracts, onClose, onDone }) {
  const toast = useToast();
  const isNew = !item._id;
  const [f, setF] = useState({ name: item.name || '', sku: item.sku || '', category: item.category || 'hardware', contract: contracts[0]?._id || '', unit: item.unit || 'unit', unitPrice: item.unitPrice ?? '', minOrderQty: item.minOrderQty ?? 1, leadTimeDays: item.leadTimeDays ?? '', validUntil: item.validUntil?.slice(0, 10) || '', tkdn: item.tkdn ?? '', warrantyMonths: item.warrantyMonths ?? '', specification: item.specification || '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api(isNew ? '/supplier/catalog' : `/supplier/catalog/${item._id}`, { method: isNew ? 'POST' : 'PUT', body: f });
      toast(isNew ? 'Usulan item dikirim ke procurement' : 'Usulan direvisi');
      onDone();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal title={isNew ? 'Usulkan item e-katalog' : `Revisi ${item.number}`} onClose={onClose} width={640}>
      <form onSubmit={submit}>
        <div className="modal-body stack">
          {error && <div className="alert">{error}</div>}
          <div className="form-grid">
            <label className="full"><span>Nama barang/jasa *</span><input required value={f.name} onChange={set('name')} /></label>
            <label><span>SKU</span><input value={f.sku} onChange={set('sku')} /></label>
            <label><span>Kategori</span><select value={f.category} onChange={set('category')}>{Object.entries(CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            {isNew && <label className="full"><span>Kontrak payung *</span><select required value={f.contract} onChange={set('contract')}>{contracts.map((c) => <option key={c._id} value={c._id}>{c.number} · {c.title}</option>)}</select></label>}
            <label><span>Satuan</span><input value={f.unit} onChange={set('unit')} /></label>
            <label><span>Harga satuan (Rp, sblm PPN) *</span><input type="number" min="1" step="any" required value={f.unitPrice} onChange={set('unitPrice')} /></label>
            <label><span>Minimum order</span><input type="number" min="1" value={f.minOrderQty} onChange={set('minOrderQty')} /></label>
            <label><span>Waktu kirim (hari)</span><input type="number" min="0" value={f.leadTimeDays} onChange={set('leadTimeDays')} /></label>
            <label><span>Harga berlaku s.d.</span><input type="date" value={f.validUntil} onChange={set('validUntil')} /></label>
            <label><span>TKDN (%)</span><input type="number" min="0" max="100" value={f.tkdn} onChange={set('tkdn')} /></label>
            <label><span>Garansi (bulan)</span><input type="number" min="0" value={f.warrantyMonths} onChange={set('warrantyMonths')} /></label>
            <label className="full"><span>Spesifikasi</span><textarea rows={3} value={f.specification} onChange={set('specification')} /></label>
          </div>
        </div>
        <div className="form-actions"><button type="button" className="btn" onClick={onClose}>Batal</button><button className="btn btn-primary">{isNew ? 'Kirim usulan' : 'Simpan revisi'}</button></div>
      </form>
    </Modal>
  );
}

// ============================ Profil & rekening ============================
const PROFILE = [
  ['contactName', 'Nama penanggung jawab'], ['contactEmail', 'Email kontak'], ['phone', 'Telepon'], ['website', 'Situs web'],
  ['npwp', 'NPWP'], ['nib', 'NIB'], ['address', 'Alamat', 'textarea'], ['subcontractors', 'Subkontraktor yang digunakan', 'textarea'],
];
const BANK = [['bankName', 'Bank'], ['bankAccount', 'No. rekening'], ['bankAccountName', 'Nama pemilik rekening']];

export function SupplierProfile() {
  const { data, error, reload } = useData('/supplier/me');
  const toast = useToast();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (data) setF(Object.fromEntries([...PROFILE, ...BANK].map(([k]) => [k, data.vendor[k] || '']))); }, [data]);
  const changed = useMemo(() => (f && data ? Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== (data.vendor[k] || ''))) : {}), [f, data]);
  if (error) return <ErrorBox error={error} />;
  if (!data || !f) return <Loading />;
  const v = data.vendor;
  const bankChanged = BANK.some(([k]) => k in changed);
  const save = async (e) => {
    e.preventDefault();
    if (bankChanged && !window.confirm('Perubahan rekening bank akan diverifikasi procurement & Accounts Payable sebelum pembayaran berikutnya. Lanjutkan?')) return;
    setBusy(true);
    setErr('');
    try {
      await api('/supplier/me', { method: 'PUT', body: changed });
      toast('Profil diperbarui');
      reload();
    } catch (e2) {
      setErr(e2.message);
    }
    setBusy(false);
  };
  const field = ([k, l, t]) => (
    <label key={k} className={t === 'textarea' ? 'full' : ''}><span>{l}</span>
      {t === 'textarea' ? <textarea rows={3} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /> : <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
    </label>
  );
  return (
    <div>
      <PageHeader icon="building" title="Profil & Rekening" description="Data perusahaan yang dipakai procurement untuk verifikasi, kontrak, dan pembayaran." />
      <div className="detail-layout">
        <form onSubmit={save}>
          {err && <div className="alert">{err}</div>}
          <div className="card">
            <h3>Kontak & legalitas</h3>
            <div className="form-grid">{PROFILE.map(field)}</div>
          </div>
          <div className="card">
            <h3>Rekening pembayaran</h3>
            {bankChanged && <div className="alert warn"><Icon name="shield" size="sm" />Perubahan rekening akan diverifikasi (anti-fraud) sebelum dipakai untuk pembayaran.</div>}
            <div className="form-grid">{BANK.map(field)}</div>
          </div>
          <div className="row end"><button className="btn btn-primary" disabled={busy || !Object.keys(changed).length}><Icon name="check" size="sm" />Simpan perubahan</button></div>
        </form>
        <aside>
          <div className="card">
            <h3>Identitas penyedia</h3>
            <dl className="kv">
              <dt>Nama</dt><dd>{v.name}</dd>
              <dt>No. vendor</dt><dd className="mono">{v.number}</dd>
              <dt>Status</dt><dd>{VENDOR_STATUS[v.status] || v.status}</dd>
              <dt>Registrasi</dt><dd>{v.registeredVia === 'self_service' ? 'Mandiri (portal)' : 'Oleh procurement'}</dd>
              {v.certifications?.length > 0 && <><dt>Sertifikasi</dt><dd>{v.certifications.join(', ')}</dd></>}
              {v.profileUpdatedAt && <><dt>Profil diperbarui</dt><dd>{fmtDateTime(v.profileUpdatedAt)}</dd></>}
            </dl>
            <p className="small muted">Nama perusahaan, kategori, dan status hanya dapat diubah procurement.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
