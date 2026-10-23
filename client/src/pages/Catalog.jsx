import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { cartLine, useCart } from '../cart.js';
import Field from '../components/Field.jsx';
import { fmtDate, fmtMoney } from '../components/format.jsx';
import Icon from '../components/Icon.jsx';
import { Empty, Modal, PageHeader, useToast } from '../components/ui.jsx';
import { MODULE_DEFS } from '../../../shared/modules.mjs';
import { DEFAULT_TAX_RATE } from '../../../shared/finance.mjs';

const CATEGORIES = MODULE_DEFS['catalog-items'].fields.find((f) => f.key === 'category').options;
const CAT_ICON = { hardware: 'server', software: 'layers', cloud: 'globe', network: 'link', services: 'briefcase', peripheral: 'box', consumable: 'cart' };
const SORTS = [['name', 'Nama A–Z'], ['unitPrice', 'Harga terendah'], ['-unitPrice', 'Harga tertinggi'], ['leadTimeDays', 'Pengiriman tercepat']];

/** Etalase e-katalog: item terbit dengan harga kontrak, keranjang, lalu diajukan sebagai Permintaan Pembelian (PR). */
export default function Catalog() {
  const { tenant, can } = useAuth();
  const cart = useCart(tenant?.slug);
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [sort, setSort] = useState('name');
  const [qty, setQty] = useState({});
  const [showCart, setShowCart] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      api('/catalog-items', { query: { status: 'published', limit: 200, sort, q: q || undefined, category: cat || undefined } })
        .then((r) => setItems(r.items))
        .catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [q, cat, sort]);

  const counts = useMemo(() => Object.fromEntries(CATEGORIES.map(([k]) => [k, (items || []).filter((i) => i.category === k).length])), [items]);
  const add = (c) => {
    const n = Number(qty[c._id] || c.minOrderQty || 1);
    cart.add(cartLine(c), n);
    toast(`${c.name} ×${n} ditambahkan ke keranjang`);
  };
  const canRequest = can('requisitions', 'create');

  return (
    <div>
      <PageHeader icon="grid" title="Belanja E-Katalog"
        description="Barang & jasa TI terstandar dengan harga kontrak payung yang sudah divalidasi Controller dan arsitek. Item katalog yang disetujui langsung menjadi PO ke penyedia — tanpa tender ulang."
        actions={<>
          {canRequest && <Link className="btn" to="/m/requisitions/new"><Icon name="plus" size="sm" />Kebutuhan non-katalog</Link>}
          {canRequest && <button className="btn btn-primary" onClick={() => setShowCart(true)}><Icon name="cart" size="sm" />Keranjang{cart.count > 0 && <span className="count-pill">{cart.count}</span>}</button>}
        </>} />
      {error && <div className="alert"><Icon name="alert" size="sm" />{error}</div>}

      <div className="card catalog-toolbar">
        <div className="search-input"><Icon name="search" size="sm" /><input placeholder="Cari nama, SKU, atau spesifikasi…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari katalog" /></div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Urutkan" style={{ width: 'auto' }}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <div className="row" style={{ flexBasis: '100%' }}>
          <button className={`chip-btn ${!cat ? 'active' : ''}`} onClick={() => setCat('')}>Semua</button>
          {CATEGORIES.map(([k, l]) => (
            <button key={k} className={`chip-btn ${cat === k ? 'active' : ''}`} onClick={() => setCat(cat === k ? '' : k)}>{l}{!cat && counts[k] ? ` · ${counts[k]}` : ''}</button>
          ))}
        </div>
      </div>

      {!items ? <div className="catalog-grid">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="card"><div className="skeleton" style={{ height: 150 }} /></div>)}</div>
        : !items.length ? <div className="card"><Empty icon="grid" title="Tidak ada item katalog">Ubah filter, atau minta Procurement menayangkan item baru dari kontrak payung.</Empty></div>
          : (
            <div className="catalog-grid">
              {items.map((c) => {
                const inCart = cart.items.find((x) => x.catalogItem === c._id);
                return (
                  <article key={c._id} className="card catalog-card">
                    <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                      <span className="catalog-ic"><Icon name={CAT_ICON[c.category] || 'box'} /></span>
                      <span className="badge badge-gray plain">{CATEGORIES.find(([k]) => k === c.category)?.[1] || c.category}</span>
                    </div>
                    <Link to={`/m/catalog-items/${c._id}`} className="catalog-name">{c.name}</Link>
                    <div className="small muted mono">{c.sku || c.number} · {c.vendor?.name}</div>
                    {c.specification && <p className="catalog-spec small">{c.specification}</p>}
                    <div className="catalog-meta small">
                      {c.leadTimeDays != null && <span title="Waktu kirim"><Icon name="clock" size="sm" />{c.leadTimeDays} hari</span>}
                      {c.warrantyMonths ? <span title="Garansi"><Icon name="shield" size="sm" />{c.warrantyMonths} bln</span> : null}
                      {c.tkdn ? <span title="Tingkat Komponen Dalam Negeri">TKDN {c.tkdn}%</span> : null}
                      {c.minOrderQty > 1 && <span>Min. {c.minOrderQty}</span>}
                    </div>
                    <div className="catalog-price">
                      <div><b>{fmtMoney(c.unitPrice)}</b><span className="small muted"> / {c.unit || 'unit'}</span></div>
                      <div className="small muted">Harga kontrak s.d. {fmtDate(c.validUntil) || '—'} · belum PPN</div>
                    </div>
                    {canRequest && (
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <input type="number" min={c.minOrderQty || 1} value={qty[c._id] ?? (c.minOrderQty || 1)} onChange={(e) => setQty({ ...qty, [c._id]: e.target.value })} style={{ width: 76 }} aria-label={`Jumlah ${c.name}`} />
                        <button className="btn btn-primary grow" onClick={() => add(c)}><Icon name="plus" size="sm" />{inCart ? `Tambah (di keranjang: ${inCart.qty})` : 'Tambah ke keranjang'}</button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
      {showCart && <CartModal cart={cart} onClose={() => setShowCart(false)} />}
    </div>
  );
}

function CartModal({ cart, onClose }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ title: '', neededBy: '', deliveryLocation: '', justification: '', approver: '', department: '' });
  const [submitNow, setSubmitNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const byVendor = useMemo(() => {
    const m = new Map();
    for (const x of cart.items) m.set(x.vendorName || x.vendor, [...(m.get(x.vendorName || x.vendor) || []), x]);
    return [...m.entries()];
  }, [cart.items]);
  const tax = Math.round((cart.subtotal * DEFAULT_TAX_RATE) / 100);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const pr = await api('/requisitions', {
        method: 'POST',
        body: {
          ...Object.fromEntries(Object.entries(form).filter(([, v]) => v)),
          items: cart.items.map((x) => ({ catalogItem: x.catalogItem, vendor: x.vendor, sku: x.sku, description: x.name, qty: x.qty, unit: x.unit, unitPrice: x.unitPrice })),
        },
      });
      if (submitNow) {
        try {
          await api(`/requisitions/${pr._id}/transition`, { method: 'POST', body: { to: 'pending_approval' } });
        } catch (err) {
          toast(`PR ${pr.number} tersimpan sebagai draft: ${err.message}`, 'error');
          cart.clear();
          navigate(`/m/requisitions/${pr._id}`);
          return;
        }
      }
      cart.clear();
      toast(submitNow ? `PR ${pr.number} diajukan untuk persetujuan` : `PR ${pr.number} disimpan sebagai draft`);
      navigate(`/m/requisitions/${pr._id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Keranjang e-katalog (${cart.count} item)`} onClose={onClose} width={760}>
      {!cart.items.length ? (
        <div className="modal-body"><Empty icon="cart" title="Keranjang masih kosong">Tambahkan item dari e-katalog, lalu ajukan sebagai Permintaan Pembelian.</Empty></div>
      ) : (
        <form onSubmit={submit}>
          <div className="modal-body stack">
            {error && <div className="alert"><Icon name="alert" size="sm" />{error}</div>}
            {byVendor.map(([vendor, lines]) => (
              <div key={vendor} className="cart-group">
                <div className="row between small"><b><Icon name="building" size="sm" /> {vendor}</b><span className="muted">→ 1 PO otomatis</span></div>
                {lines.map((x) => (
                  <div key={x.catalogItem} className="cart-line">
                    <span className="grow"><span className="cart-name">{x.name}</span><span className="small muted mono">{x.sku} · {fmtMoney(x.unitPrice)} / {x.unit || 'unit'}</span></span>
                    <span className="qty-stepper">
                      <button type="button" onClick={() => cart.setQty(x.catalogItem, x.qty - 1)} aria-label="Kurangi" disabled={x.qty <= (x.minOrderQty || 1)}>−</button>
                      <input type="number" value={x.qty} min={x.minOrderQty || 1} onChange={(e) => cart.setQty(x.catalogItem, Number(e.target.value) || 1)} aria-label={`Jumlah ${x.name}`} />
                      <button type="button" onClick={() => cart.setQty(x.catalogItem, x.qty + 1)} aria-label="Tambah">+</button>
                    </span>
                    <span className="nowrap cart-amount">{fmtMoney(x.qty * x.unitPrice)}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => cart.remove(x.catalogItem)} aria-label={`Hapus ${x.name}`}><Icon name="trash" size="sm" /></button>
                  </div>
                ))}
              </div>
            ))}
            <dl className="kv cart-total">
              <dt>Subtotal</dt><dd>{fmtMoney(cart.subtotal)}</dd>
              <dt>Estimasi PPN {DEFAULT_TAX_RATE}%</dt><dd>{fmtMoney(tax)}</dd>
              <dt><b>Estimasi total</b></dt><dd><b>{fmtMoney(cart.subtotal + tax)}</b></dd>
            </dl>
            <div className="form-grid">
              <label className="full"><span>Keperluan *</span><input required value={form.title} onChange={(e) => set('title')(e.target.value)} placeholder="mis. Perangkat kerja pegawai baru Divisi Digital" /></label>
              <label><span>Unit kerja</span><input value={form.department} onChange={(e) => set('department')(e.target.value)} /></label>
              <label><span>Dibutuhkan tanggal</span><Field field={{ type: 'date' }} value={form.neededBy} onChange={set('neededBy')} /></label>
              <label><span>Atasan penyetuju</span><Field field={{ type: 'user' }} value={form.approver} onChange={set('approver')} /></label>
              <label><span>Lokasi pengiriman</span><input value={form.deliveryLocation} onChange={(e) => set('deliveryLocation')(e.target.value)} /></label>
              <label className="full"><span>Justifikasi kebutuhan *</span><textarea required rows={3} value={form.justification} onChange={(e) => set('justification')(e.target.value)} /></label>
            </div>
            <label className="inline"><input type="checkbox" checked={submitNow} onChange={(e) => setSubmitNow(e.target.checked)} /><span>Langsung ajukan untuk persetujuan (atasan → Procurement → Controller sesuai nilai)</span></label>
            <p className="small muted" style={{ margin: 0 }}>Harga dikunci ke harga katalog terbit saat PR diajukan. Mata anggaran ditetapkan Procurement sebelum persetujuan akhir.</p>
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => { cart.clear(); onClose(); }}>Kosongkan</button>
            <button type="button" className="btn" onClick={onClose}>Lanjut belanja</button>
            <button className="btn btn-primary" disabled={busy}><Icon name="check" size="sm" />{submitNow ? 'Ajukan PR' : 'Simpan draft PR'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
