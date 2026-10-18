import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { portalHref } from '../links.js';
import { industries } from '../../../shared/frameworks.mjs';
import { OVERALL_TEXT, overall, STATUS } from './shared.jsx';

const CAPABILITIES = [
  ['⚠️', 'Incident & Problem', 'Pemulihan layanan sesuai SLA, analisis akar masalah, dan known error.', 'ITIL 4'],
  ['📝', 'Katalog & Permintaan', 'Permintaan layanan terstandar dengan persetujuan berjenjang.', 'ITIL 4'],
  ['🔁', 'Change Enablement', 'RFC, penilaian risiko, persetujuan CAB, dan post-implementation review.', 'ITIL 4 · ISO 27001'],
  ['🖥️', 'CMDB & Aset TI', 'Inventaris CI, siklus hidup aset, lisensi, dan lokasi penempatan data.', 'ITAM · ISO 19770'],
  ['🛡️', 'Risiko & Kepatuhan', 'Register risiko, self-assessment kontrol, vendor, dan BCP/DRP.', 'NIST CSF 2.0 · OJK'],
  ['🏛️', 'Arsitektur & Proyek', 'Repositori arsitektur, proyek predictive/agile, sprint, dan backlog.', 'TOGAF · PMBOK · Scrum'],
];

export default function Home({ info }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [articles, setArticles] = useState([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    api('/public/status').then(setStatus).catch(() => {});
    api('/public/knowledge').then((r) => setArticles(r.items.slice(0, 4))).catch(() => {});
  }, []);
  const ov = status && overall(status.services);
  const industry = industries.find((i) => i.id === info?.industry);

  return (
    <>
      <section className="pub-hero">
        <div className="pub-wrap">
          <h1>Ada yang bisa kami bantu?</h1>
          <p>Cari solusi mandiri, cek status layanan, atau ajukan permintaan ke tim TI {info?.organizationName}.</p>
          <form className="pub-search" onSubmit={(e) => { e.preventDefault(); navigate(`/bantuan?q=${encodeURIComponent(q)}`); }}>
            <input type="search" placeholder="Cari solusi, mis. reset password, VPN, phishing…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn btn-primary">Cari</button>
          </form>
          <div className="pub-cta">
            <a className="pub-cta-card" href={portalHref('/m/incidents/new')}>
              <span className="big">⚠️</span>
              <span><b>Laporkan gangguan</b><small>Layanan tidak berjalan normal</small></span>
            </a>
            <a className="pub-cta-card" href={portalHref('/portal')}>
              <span className="big">🛎️</span>
              <span><b>Ajukan permintaan</b><small>Perangkat, akses, akun</small></span>
            </a>
            <Link className="pub-cta-card" to="/status">
              <span className="big" style={{ color: `var(--${STATUS[ov || 'operational'][1]})` }}>●</span>
              <span><b>Status layanan</b><small>{ov ? OVERALL_TEXT[ov] : 'Memuat…'}</small></span>
            </Link>
          </div>
        </div>
      </section>

      <section className="pub-wrap pub-section">
        <div className="pub-section-head">
          <h2>Artikel bantuan populer</h2>
          <Link to="/bantuan">Lihat semua →</Link>
        </div>
        <div className="pub-grid-4">
          {articles.map((a) => (
            <Link key={a._id} to={`/bantuan/${a._id}`} className="card pub-article-card">
              <span className="muted small">{a.category}</span>
              <b>{a.title}</b>
            </Link>
          ))}
          {!articles.length && <p className="muted">Belum ada artikel publik.</p>}
        </div>
      </section>

      <section className="pub-band">
        <div className="pub-wrap pub-section">
          <h2>Bagaimana kami mengelola layanan TI</h2>
          <p className="muted pub-lead">
            Layanan TI dikelola di satu platform ITSM yang mengikuti praktik terbaik internasional dan regulasi industri
            {industry ? <> <b>{industry.name}</b></> : ''}.
          </p>
          <div className="pub-grid-3">
            {CAPABILITIES.map(([icon, title, text, ref]) => (
              <div key={title} className="card pub-feature">
                <span className="big">{icon}</span>
                <b>{title}</b>
                <p className="muted small">{text}</p>
                <span className="badge badge-indigo">{ref}</span>
              </div>
            ))}
          </div>
          <div className="row">
            <Link className="btn" to="/tata-kelola">Framework & regulasi yang kami terapkan →</Link>
          </div>
        </div>
      </section>
    </>
  );
}
