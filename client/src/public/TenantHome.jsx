import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { portalHref } from '../links.js';
import Icon from '../components/Icon.jsx';
import { OVERALL_TEXT, overall, STATUS } from './shared.jsx';

export default function TenantHome() {
  const { info, slug } = useOutletContext();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [articles, setArticles] = useState([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    api(`/public/t/${slug}/status`).then(setStatus).catch(() => {});
    api(`/public/t/${slug}/knowledge`).then((r) => setArticles(r.items.slice(0, 4))).catch(() => {});
  }, [slug]);
  const ov = status && overall(status.services);
  const base = `/w/${slug}`;

  return (
    <>
      <section className="pub-hero">
        <div className="pub-wrap">
          <span className="pub-kicker"><Icon name="help" size="sm" /> Pusat bantuan TI</span>
          <h1>Ada yang bisa kami bantu?</h1>
          <p>Cari solusi mandiri, cek status layanan, atau ajukan permintaan ke tim TI {info?.name}.</p>
          <form className="pub-search" onSubmit={(e) => { e.preventDefault(); navigate(`${base}/bantuan?q=${encodeURIComponent(q)}`); }}>
            <input type="search" placeholder="Cari solusi, mis. reset password, VPN, phishing…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn btn-accent">Cari</button>
          </form>
          <div className="pub-cta">
            <a className="pub-cta-card" href={portalHref('/m/incidents/new', slug)}>
              <span className="kpi-ic"><Icon name="alert" /></span>
              <span><b>Laporkan gangguan</b><small>Layanan tidak berjalan normal</small></span>
            </a>
            <a className="pub-cta-card" href={portalHref('/portal', slug)}>
              <span className="kpi-ic"><Icon name="request" /></span>
              <span><b>Ajukan permintaan</b><small>Perangkat, akses, akun</small></span>
            </a>
            <Link className="pub-cta-card" to={`${base}/status`}>
              <span className="kpi-ic" style={{ color: `var(--${STATUS[ov || 'operational'][1]})` }}><Icon name="status" /></span>
              <span><b>Status layanan</b><small>{ov ? OVERALL_TEXT[ov] : 'Memuat…'}</small></span>
            </Link>
            <Link className="pub-cta-card" to={`${base}/penyedia`}>
              <span className="kpi-ic"><Icon name="briefcase" /></span>
              <span><b>Portal penyedia</b><small>Registrasi vendor, tender & e-invoice</small></span>
            </Link>
          </div>
        </div>
      </section>
      <section className="pub-wrap pub-section">
        <div className="row between"><h2>Artikel bantuan populer</h2><Link to={`${base}/bantuan`}>Lihat semua →</Link></div>
        <div className="pub-grid-4">
          {articles.map((a) => (
            <Link key={a._id} to={`${base}/bantuan/${a._id}`} className="card pub-article-card">
              <span className="small muted">{a.category}</span>
              <b>{a.title}</b>
            </Link>
          ))}
          {!articles.length && <p className="muted">Belum ada artikel publik.</p>}
        </div>
      </section>
    </>
  );
}
