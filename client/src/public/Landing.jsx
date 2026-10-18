import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, DEMO } from '../api.js';
import { portalHref } from '../links.js';
import Icon from '../components/Icon.jsx';
import { PLANS } from '../../../shared/plans.mjs';
import { industries, frameworks } from '../../../shared/frameworks.mjs';

const FEATURES = [ // modul utama platform
  ['alert', 'Incident & Problem', 'Prioritas impact × urgency, SLA dengan jeda otomatis, major incident, RCA, dan known error.', 'ITIL 4'],
  ['change', 'Change Enablement', 'RFC standard/normal/emergency, CAB multi-approver, segregation of duties, dan PIR.', 'ITIL 4 · ISO 27001'],
  ['request', 'Katalog & Portal Layanan', 'Permintaan terstandar dengan persetujuan, pusat bantuan publik, dan status layanan.', 'ITIL 4'],
  ['server', 'CMDB & Aset TI', 'Relasi CI, lokasi DC/DRC & negara penempatan, siklus hidup aset, dan lisensi.', 'ITAM · ISO 19770'],
  ['shield', 'Risiko, Vendor & Kepatuhan', 'Risk register 5×5, penyedia jasa TI, BCP/DRP, dan skor kepatuhan per regulasi.', 'NIST CSF 2.0 · OJK'],
  ['building', 'Arsitektur & Perencanaan', 'RPTI/inisiatif strategis, repositori TOGAF, proyek predictive/agile, sprint & backlog.', 'TOGAF · PMBOK · Scrum'],
  ['wallet', 'Keuangan TI (ITFM)', 'Anggaran, PO dengan kontrol anggaran, tagihan 3-way match, pembayaran maker-checker & jurnal otomatis.', 'ITFM · COSO'],
  ['flag', 'Assurance & Audit', 'Pengujian kontrol independen, temuan audit/regulator, mitigasi & validasi penutupan.', 'ISO 27001 · IIA'],
  ['server', 'DCIM', 'Data center & DRC, kapasitas rak (ruang & daya), dan izin akses fisik.', 'ISO 27001 A.7 · TIA-942'],
  ['lifebuoy', 'BCM & Disaster Recovery', 'BIA (MTPD/RTO/RPO), pengesahan BCP/DRP, dan uji DR dengan temuan otomatis.', 'ISO 22301 · POJK 11/2022'],
];
const TRUST = [
  ['key', 'Akses berbasis peran', '16 peran default dengan least privilege; admin menyesuaikan matriks akses per workspace.'],
  ['scroll', 'Audit trail immutable', 'Setiap perubahan, transisi status, persetujuan & login tercatat dan tidak dapat diubah.'],
  ['tenant', 'Isolasi per tenant', 'Data setiap organisasi terpisah; referensi lintas tenant ditolak di sisi server.'],
  ['globe', 'Data di Indonesia', 'Dirancang untuk kebutuhan lokasi data & pelaporan regulator di Indonesia.'],
];

export default function Landing({ section }) {
  const navigate = useNavigate();
  const pricing = useRef(null);
  const [ws, setWs] = useState('');
  const [samples, setSamples] = useState([]);
  useEffect(() => { if (DEMO) api('/public/workspaces').then((r) => setSamples(r.items)).catch(() => {}); }, []);
  useEffect(() => { if (section === 'pricing') pricing.current?.scrollIntoView({ behavior: 'smooth' }); }, [section]);

  return (
    <>
      <section className="pub-hero">
        <div className="pub-wrap pub-hero-grid">
          <div>
            <span className="pub-kicker"><Icon name="sparkles" size="sm" /> ITSM untuk industri teregulasi</span>
            <h1>Service management kelas enterprise, siap regulasi Indonesia.</h1>
            <p>Satu platform SaaS untuk service desk, aset, risiko, dan kepatuhan — dengan paket regulasi per industri, termasuk OJK PADK No. 1 Tahun 2026 untuk perbankan.</p>
            <div className="row" style={{ gap: 10 }}>
              <Link className="btn btn-accent" to="/daftar" style={{ padding: '11px 18px' }}>Mulai trial 14 hari <Icon name="arrowRight" size="sm" /></Link>
              <a className="btn pub-btn-ghost" href={portalHref('/')} style={{ padding: '11px 18px' }}>Masuk ke workspace</a>
            </div>
            <form className="pub-ws" onSubmit={(e) => { e.preventDefault(); if (ws.trim()) navigate(`/w/${ws.trim().toLowerCase()}`); }}>
              <span className="small">Cari pusat bantuan organisasi Anda:</span>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input placeholder="kode workspace, mis. bank-nusantara" value={ws} onChange={(e) => setWs(e.target.value)} />
                <button className="btn">Buka</button>
              </div>
              {samples.length > 0 && <div className="row small">Contoh: {samples.map((s) => <Link key={s.slug} to={`/w/${s.slug}`} className="pub-sample">{s.name}</Link>)}</div>}
            </form>
          </div>
          <div className="pub-hero-card" aria-hidden="true">
            <div className="row between"><b>Ringkasan operasional</b><span className="plan-pill">Enterprise</span></div>
            <div className="pub-mini-kpis">
              <div><span>Kepatuhan SLA</span><b>96%</b></div>
              <div><span>MTTR</span><b>4,2 j</b></div>
              <div><span>Change sukses</span><b>92%</b></div>
            </div>
            {[['P1', 'Transaksi teller lambat', 'Dikerjakan', 'red'], ['P2', 'Notifikasi mobile tertunda', 'Ditugaskan', 'orange'], ['CAB', 'Tuning query batch EOD', '1/2 setuju', 'gold']].map(([p, t, s, tone]) => (
              <div key={t} className="pub-mini-row"><span className={`badge badge-${tone} plain`}>{p}</span><span className="grow">{t}</span><span className="small" style={{ color: '#b9c4d8' }}>{s}</span></div>
            ))}
            <div className="pub-mini-bar"><span style={{ width: '72%' }} /></div>
            <span className="small" style={{ color: '#b9c4d8' }}>Skor kepatuhan PADK OJK 1/2026 · 72%</span>
          </div>
        </div>
      </section>

      <section className="pub-wrap pub-section">
        <div className="pub-section-intro">
          <span className="pub-eyebrow">Modul</span>
          <h2>Semua praktik pengelolaan TI dalam satu alur kerja</h2>
          <p className="muted">Dibangun di atas ITIL 4 dan dipetakan ke framework tata kelola yang dipakai auditor.</p>
        </div>
        <div className="pub-grid-3">
          {FEATURES.map(([icon, title, text, ref]) => (
            <div key={title} className="card pub-feature">
              <span className="kpi-ic"><Icon name={icon} /></span>
              <b>{title}</b>
              <p className="muted small">{text}</p>
              <span className="badge badge-gold plain">{ref}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="pub-band">
        <div className="pub-wrap pub-section">
          <div className="pub-section-intro">
            <span className="pub-eyebrow">Multi-industri</span>
            <h2>Paket regulasi menyesuaikan industri Anda</h2>
            <p className="muted">Pilih industri saat mendaftar — framework & kontrol kepatuhan yang relevan aktif otomatis.</p>
          </div>
          <div className="pub-industry-grid">
            {industries.map((i) => {
              const regs = frameworks.filter((f) => i.frameworks.includes(f.id) && f.type === 'regulation');
              return (
                <Link key={i.id} to={`/tata-kelola?industri=${i.id}`} className="card pub-industry">
                  <b>{i.name}</b>
                  <span className="small muted">{i.frameworks.length} framework · {regs.length} regulasi</span>
                  <span className="small">{regs.slice(-2).map((r) => r.name.split('—')[0].trim()).join(' · ')}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="pub-wrap pub-section">
        <div className="pub-grid-4">
          {TRUST.map(([icon, title, text]) => (
            <div key={title} className="pub-trust"><span className="kpi-ic"><Icon name={icon} /></span><b>{title}</b><p className="muted small">{text}</p></div>
          ))}
        </div>
      </section>

      <section className="pub-band" ref={pricing}>
        <div className="pub-wrap pub-section">
          <div className="pub-section-intro">
            <span className="pub-eyebrow">Harga</span>
            <h2>Paket yang tumbuh bersama organisasi Anda</h2>
            <p className="muted">Semua paket termasuk trial 14 hari, workspace terisolasi, dan situs bantuan publik.</p>
          </div>
          <div className="pub-grid-3">
            {Object.entries(PLANS).map(([k, p]) => (
              <div key={k} className={`card pub-plan ${k === 'professional' ? 'featured' : ''}`}>
                {k === 'professional' && <span className="pub-plan-tag">Paling populer</span>}
                <b style={{ fontSize: 17 }}>{p.name}</b>
                <div className="pub-price">{p.price}</div>
                <p className="muted small">{p.summary}</p>
                <ul className="plain small">{p.features.map((f) => <li key={f}><Icon name="check" size="sm" /> {f}</li>)}<li><Icon name="users" size="sm" /> {p.maxUsers ? `Hingga ${p.maxUsers} pengguna` : 'Pengguna tanpa batas'}</li></ul>
                {k === 'enterprise'
                  ? <a className="btn" href="mailto:sales@nusa-itsm.example">Hubungi sales</a>
                  : <Link className={`btn ${k === 'professional' ? 'btn-primary' : ''}`} to={`/daftar?paket=${k}`}>Mulai trial</Link>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pub-wrap pub-section">
        <div className="pub-cta-band">
          <div><h2 style={{ color: '#fff', margin: 0 }}>Siap merapikan layanan TI Anda?</h2><p style={{ color: '#b9c4d8', margin: '6px 0 0' }}>Buat workspace dalam satu menit — SLA, katalog, dan kontrol kepatuhan sudah disiapkan.</p></div>
          <Link className="btn btn-accent" to="/daftar" style={{ padding: '11px 18px' }}>Buat workspace</Link>
        </div>
      </section>
    </>
  );
}
