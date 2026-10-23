import { NavLink, Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, DEMO } from '../api.js';
import { portalHref } from '../links.js';
import { useTheme } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import Landing from './Landing.jsx';
import Signup from './Signup.jsx';
import TenantHome from './TenantHome.jsx';
import Status from './Status.jsx';
import Help from './Help.jsx';
import Article from './Article.jsx';
import Governance from './Governance.jsx';
import SupplierRegister from './SupplierRegister.jsx';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

function Header({ brand, links, cta }) {
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  const [theme, toggleTheme] = useTheme();
  useEffect(() => setMenu(false), [pathname]);
  return (
    <header className="pub-header">
      <div className="pub-wrap pub-header-row">
        {brand}
        <button className="pub-menu-btn icon-btn" onClick={() => setMenu(!menu)} aria-label="Menu"><Icon name="menu" /></button>
        <nav className={`pub-nav ${menu ? 'open' : ''}`}>
          {links.map(([to, label, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}
          <button className="icon-btn" onClick={toggleTheme} aria-label="Ganti tema"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
          {cta}
        </nav>
      </div>
    </header>
  );
}

const DemoNote = () => DEMO && <div className="demo-banner" style={{ justifyContent: 'center' }}><span><b>Mode demo</b> — data contoh multi-tenant berjalan di browser Anda.</span></div>;

function Footer({ children }) {
  return (
    <footer className="pub-footer">
      <div className="pub-wrap pub-footer-grid">{children}</div>
      <div className="pub-wrap small" style={{ color: '#7d8aa3', marginTop: 24 }}>© {new Date().getFullYear()} Nusa ITSM · ITIL® adalah merek dagang terdaftar PeopleCert. Kontrol regulasi bersifat ringkasan untuk self-assessment.</div>
    </footer>
  );
}

/** Layout situs pemasaran platform SaaS. */
function SiteLayout() {
  return (
    <div className="pub">
      <Header
        brand={<NavLink to="/" className="pub-brand"><span className="logo">IT</span><span><b>Nusa ITSM</b><small>Service Management Cloud</small></span></NavLink>}
        links={[['/', 'Produk', true], ['/tata-kelola', 'Regulasi & Framework'], ['/harga', 'Harga']]}
        cta={<><a className="btn" href={portalHref('/')}>Masuk</a><NavLink className="btn btn-primary" to="/daftar">Coba gratis</NavLink></>}
      />
      <DemoNote />
      <main><Outlet /></main>
      <Footer>
        <div><b style={{ color: '#fff' }}>Nusa ITSM</b><p className="small" style={{ color: '#8d97b5' }}>Platform IT Service Management multi-tenant untuk industri teregulasi di Indonesia — ITIL 4, ISO/IEC 20000 & 27001, NIST CSF 2.0, TOGAF, PMBOK, Scrum, dan paket regulasi per industri.</p></div>
        <div className="small"><b style={{ color: '#fff' }}>Produk</b><NavLink to="/">Fitur</NavLink><NavLink to="/harga">Harga</NavLink><NavLink to="/tata-kelola">Regulasi & framework</NavLink></div>
        <div className="small"><b style={{ color: '#fff' }}>Akun</b><NavLink to="/daftar">Daftar workspace</NavLink><a href={portalHref('/')}>Masuk portal</a></div>
      </Footer>
    </div>
  );
}

/** Layout pusat bantuan publik milik satu tenant (/w/:slug). */
function TenantLayout() {
  const { slug } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { setInfo(null); api(`/public/t/${slug}/info`).then(setInfo).catch((e) => setError(e.message)); }, [slug]);
  const base = `/w/${slug}`;
  if (error) return <div className="pub"><div className="pub-wrap pub-section"><div className="alert">{error}</div><NavLink to="/">← Kembali ke beranda</NavLink></div></div>;
  return (
    <div className="pub">
      <Header
        brand={<NavLink to={base} className="pub-brand"><span className="logo">{(info?.name || 'IT').slice(0, 2).toUpperCase()}</span><span><b>Layanan TI</b><small>{info?.name || '…'}</small></span></NavLink>}
        links={[[base, 'Beranda', true], [`${base}/status`, 'Status Layanan'], [`${base}/bantuan`, 'Pusat Bantuan'], [`${base}/tata-kelola`, 'Tata Kelola'], [`${base}/penyedia`, 'Penyedia']]}
        cta={<a className="btn btn-primary" href={portalHref('/', slug)}>Masuk Portal</a>}
      />
      <DemoNote />
      <main><Outlet context={{ info, slug }} /></main>
      <Footer>
        <div><b style={{ color: '#fff' }}>Layanan TI {info?.name}</b><p className="small" style={{ color: '#8d97b5' }}>{info?.branding?.tagline || 'Dikelola sesuai praktik ITIL 4, ISO/IEC 20000 & 27001, NIST CSF 2.0, serta regulasi yang berlaku di industri kami.'}</p></div>
        <div className="small"><b style={{ color: '#fff' }}>Layanan</b><NavLink to={`${base}/status`}>Status layanan</NavLink><NavLink to={`${base}/bantuan`}>Knowledge base</NavLink><a href={portalHref('/m/incidents/new', slug)}>Laporkan gangguan</a></div>
        <div className="small"><b style={{ color: '#fff' }}>Penyedia</b><NavLink to={`${base}/penyedia`}>Daftar sebagai penyedia</NavLink><a href={portalHref('/', slug)}>Masuk portal penyedia</a></div>
        <div className="small"><b style={{ color: '#fff' }}>Didukung oleh</b><NavLink to="/">Nusa ITSM</NavLink></div>
      </Footer>
    </div>
  );
}

export default function PublicApp() {
  return (
    <>
      <ScrollTop />
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<Landing />} />
          <Route path="harga" element={<Landing section="pricing" />} />
          <Route path="daftar" element={<Signup />} />
          <Route path="tata-kelola" element={<div className="pub-wrap pub-section"><Governance /></div>} />
        </Route>
        <Route path="w/:slug" element={<TenantLayout />}>
          <Route index element={<TenantHome />} />
          <Route path="status" element={<Status />} />
          <Route path="bantuan" element={<Help />} />
          <Route path="bantuan/:id" element={<Article />} />
          <Route path="tata-kelola" element={<div className="pub-wrap pub-section"><Governance tenantScoped /></div>} />
          <Route path="penyedia" element={<SupplierRegister />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
