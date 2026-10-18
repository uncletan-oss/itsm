import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api, DEMO } from '../api.js';
import { useAuth } from '../auth.jsx';
import { MODULES, NAV_GROUPS } from '../config/modules.js';

export default function Layout() {
  const { user, logout, hasRole, isStaff } = useAuth();
  const [org, setOrg] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { api('/settings').then(setOrg).catch(() => {}); }, []);

  const link = (to, label) => (
    <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
  );

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="logo">IT</div>
          <div>
            <div className="brand-name">ITSM Platform</div>
            <div className="brand-org">{org?.organizationName}</div>
          </div>
        </div>
        <nav>
          {link('/', '🏠 Dashboard')}
          {link('/portal', '🛎️ Portal Layanan')}
          {NAV_GROUPS.map((g) => {
            const items = Object.entries(MODULES).filter(([, m]) => m.group === g && (isStaff || !m.staffOnly));
            if (!items.length) return null;
            return (
              <div key={g} className="nav-group">
                <div className="nav-title">{g}</div>
                {items.map(([k, m]) => link(`/m/${k}`, `${m.icon} ${m.plural}`))}
                {g === 'Tata Kelola & Risiko' && isStaff && link('/compliance', '📋 Kepatuhan')}
              </div>
            );
          })}
          {(hasRole('admin') || hasRole('auditor', 'risk_officer', 'security_officer')) && (
            <div className="nav-group">
              <div className="nav-title">Administrasi</div>
              {hasRole('auditor', 'risk_officer', 'security_officer') && link('/audit', '🧾 Audit Log')}
              {hasRole('admin') && link('/users', '👥 Pengguna & Peran')}
              {hasRole('admin') && link('/settings', '⚙️ Pengaturan Organisasi')}
            </div>
          )}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn hamburger" onClick={() => setOpen(!open)}>☰</button>
          <span className="muted small">{org && `Industri: ${org.industry}`}</span>
          <div className="row">
            <span className="small"><b>{user.name}</b> <span className="muted">({user.roles.join(', ')})</span></span>
            <button className="btn" onClick={logout}>Keluar</button>
          </div>
        </header>
        {DEMO && <DemoBanner />}
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function DemoBanner() {
  const reset = async () => {
    if (!window.confirm('Kembalikan semua data demo ke kondisi awal?')) return;
    const { resetDemo } = await import('../demo/server.js');
    resetDemo();
    window.location.reload();
  };
  return (
    <div className="demo-banner">
      <span>
        <b>Mode demo</b> — berjalan sepenuhnya di browser Anda (data disimpan di localStorage, tanpa server). Versi lengkap memakai
        Node.js + MongoDB.
      </span>
      <button className="btn" onClick={reset}>Reset data demo</button>
    </div>
  );
}
