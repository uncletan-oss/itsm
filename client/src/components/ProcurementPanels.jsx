import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { cartLine, useCart } from '../cart.js';
import { Badge, FormatValue, fmtMoney } from './format.jsx';
import Icon from './Icon.jsx';
import { useToast } from './ui.jsx';

/** Tabel perbandingan penawaran RFQ/tender: harga vs HPS, skor harga/teknis/akhir & peringkat. */
export function QuotationCompare({ rfq, version }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api('/quotations', { query: { rfq: rfq._id, limit: 100 } }).then((r) => setRows(r.items)).catch(() => setRows([]));
  }, [rfq._id, version]);
  if (!rows) return null;
  const opened = !['draft', 'published'].includes(rfq.status);
  const invited = rfq.invitedVendors || [];
  const missing = invited.filter((v) => !rows.some((q) => (q.vendor?._id || q.vendor) === (v._id || v)));
  const sorted = [...rows].sort((a, b) => (a.rank || 99) - (b.rank || 99) || (a.subtotal || 0) - (b.subtotal || 0));
  return (
    <div className="card flush">
      <div className="card-head">
        <h3 className="row"><Icon name="gavel" size="sm" />Perbandingan penawaran</h3>
        <span className="small muted">HPS {fmtMoney(rfq.hpsAmount)} · bobot harga {rfq.priceWeight ?? 70}% / teknis {rfq.technicalWeight ?? 30}%</span>
      </div>
      {!rows.length ? (
        <p className="muted small" style={{ padding: '14px 20px', margin: 0 }}>
          Belum ada penawaran masuk{invited.length ? ` dari ${invited.length} penyedia undangan` : ''}. Catat penawaran melalui menu <b>Buat terkait → Catat penawaran penyedia</b>.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table compare-table">
            <thead><tr><th>#</th><th>Penyedia</th><th className="num">Harga (sblm PPN)</th><th className="num">vs HPS</th><th className="num">Teknis</th><th className="num">Skor akhir</th><th>Hasil</th></tr></thead>
            <tbody>
              {sorted.map((q) => {
                const win = opened && q.rank === 1;
                const vsHps = rfq.hpsAmount ? Math.round(((q.subtotal - rfq.hpsAmount) / rfq.hpsAmount) * 1000) / 10 : null;
                return (
                  <tr key={q._id}>
                    <td className={win ? 'win' : ''}>{q.rank || '—'}</td>
                    <td className={win ? 'win' : ''}><Link to={`/m/quotations/${q._id}`}><b>{q.vendor?.name || '—'}</b></Link><div className="small muted nowrap">{q.number}{q.deliveryDays ? ` · ${q.deliveryDays} hari` : ''}{q.warrantyMonths ? ` · garansi ${q.warrantyMonths} bln` : ''}</div></td>
                    <td className={`num nowrap ${win ? 'win' : ''}`}>{opened ? fmtMoney(q.subtotal) : <span className="muted" title="Sampul tertutup sampai pembukaan penawaran">🔒 tertutup</span>}</td>
                    <td className={`num nowrap ${win ? 'win' : ''}`}>{opened && vsHps != null ? <span style={{ color: vsHps > 0 ? 'var(--red)' : 'var(--green)' }}>{vsHps > 0 ? '+' : ''}{vsHps}%</span> : '—'}</td>
                    <td className={`num ${win ? 'win' : ''}`}>{q.technicalScore ?? '—'}</td>
                    <td className={`num ${win ? 'win' : ''}`}><span className="score">{q.totalScore ?? '—'}</span>{q.priceScore != null && <div className="small muted nowrap">harga {q.priceScore}</div>}</td>
                    <td className={win ? 'win' : ''}>
                      {['awarded', 'lost', 'disqualified', 'withdrawn'].includes(q.status) || !q.evaluationResult
                        ? <FormatValue name="status" value={q.status} />
                        : <span className="small" style={{ color: q.rank ? 'var(--green)' : 'var(--red)' }}>{q.rank ? (q.rank === 1 ? 'Usulan pemenang' : 'Lulus') : q.evaluationResult.split(' (')[0]}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(missing.length > 0 || rfq.savingsAmount != null) && (
        <div className="row small" style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', gap: 14 }}>
          {missing.length > 0 && <span className="muted"><Icon name="clock" size="sm" /> Belum memasukkan penawaran: {missing.map((v) => v.name || v).join(', ')}</span>}
          {rfq.savingsAmount != null && <Badge tone={rfq.savingsAmount >= 0 ? 'green' : 'red'}>Penghematan {fmtMoney(rfq.savingsAmount)} ({rfq.savingsPct}%)</Badge>}
        </div>
      )}
    </div>
  );
}

/** Tombol "Tambah ke keranjang" pada detail item e-katalog yang sedang tayang. */
export function AddToCart({ item }) {
  const { tenant, can } = useAuth();
  const cart = useCart(tenant?.slug);
  const toast = useToast();
  if (item.status !== 'published' || !can('requisitions', 'create')) return null;
  const inCart = cart.items.find((x) => x.catalogItem === item._id);
  return (
    <>
      <button className="btn btn-primary" onClick={() => { cart.add(cartLine(item), item.minOrderQty || 1); toast(`${item.name} ditambahkan ke keranjang`); }}>
        <Icon name="cart" size="sm" />{inCart ? `Tambah lagi (${inCart.qty})` : 'Tambah ke keranjang'}
      </button>
      <Link className="btn" to="/catalog"><Icon name="grid" size="sm" />Buka e-katalog{cart.count > 0 && <span className="count-pill">{cart.count}</span>}</Link>
    </>
  );
}
