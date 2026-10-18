import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, DEMO } from '../api.js';
import { portalHref } from '../links.js';
import Home from './Home.jsx';
import Status from './Status.jsx';
import Help from './Help.jsx';
import Article from './Article.jsx';
import Governance from './Governance.jsx';

export default function PublicApp() {
  const [info, setInfo] = useState(null);
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { api('/public/info').then(setInfo).catch(() => setInfo({})); }, []);
  useEffect(() => { setMenu(false); window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="pub">
      <header className="pub-header">
        <div className="pub-wrap pub-header-row">
          <NavLink to="/" className="pub-brand">
            <span className="logo">IT</span>
            <span>
              <b>Layanan TI</b>
              <small>{info?.organizationName || 'ITSM Platform'}</small>
            </span>
          </NavLink>
          <button className="pub-menu-btn" onClick={() => setMenu(!menu)} aria-label="Menu">☰</button>
          <nav className={`pub-nav ${menu ? 'open' : ''}`}>
            <NavLink to="/" end>Beranda</NavLink>
            <NavLink to="/status">Status Layanan</NavLink>
            <NavLink to="/bantuan">Pusat Bantuan</NavLink>
            <NavLink to="/tata-kelola">Tata Kelola & Kepatuhan</NavLink>
            <a className="btn btn-primary" href={portalHref('/')}>Masuk Portal →</a>
          </nav>
        </div>
      </header>
      {DEMO && (
        <div className="demo-banner pub-demo">
          <span><b>Mode demo</b> — data contoh, berjalan di browser Anda. Masuk ke portal dengan tombol peran di halaman login.</span>
        </div>
      )}
      <main>
        <Routes>
          <Route index element={<Home info={info} />} />
          <Route path="status" element={<Status />} />
          <Route path="bantuan" element={<Help />} />
          <Route path="bantuan/:id" element={<Article />} />
          <Route path="tata-kelola" element={<Governance info={info} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="pub-footer">
        <div className="pub-wrap pub-footer-grid">
          <div>
            <b>Layanan TI {info?.organizationName}</b>
            <p className="muted small">Dikelola sesuai praktik ITIL 4, ISO/IEC 20000 & 27001, NIST CSF 2.0, serta regulasi yang berlaku di industri kami.</p>
          </div>
          <div className="small">
            <b>Layanan</b>
            <NavLink to="/status">Status layanan</NavLink>
            <NavLink to="/bantuan">Knowledge base</NavLink>
            <a href={portalHref('/m/incidents/new')}>Laporkan gangguan</a>
          </div>
          <div className="small">
            <b>Portal</b>
            <a href={portalHref('/')}>Masuk portal</a>
            <a href={portalHref('/portal')}>Katalog permintaan</a>
            <NavLink to="/tata-kelola">Tata kelola & kepatuhan</NavLink>
          </div>
        </div>
      </footer>
    </div>
  );
}
