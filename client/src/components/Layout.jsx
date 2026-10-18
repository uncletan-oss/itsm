import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, DEMO } from '../api.js';
import { useAuth } from '../auth.jsx';
import { MODULES, NAV_GROUPS } from '../config/modules.js';
import { publicHref } from '../links.js';
import Icon from './Icon.jsx';
import { Modal, initials, usePopover, useTheme, useToast } from './ui.jsx';
import { fmtDateTime } from './format.jsx';

const QUICK_CREATE = ['incidents', 'requests', 'changes', 'purchase-orders', 'invoices', 'risks', 'findings', 'dc-access', 'initiatives'];

/** Menu dibangun dari matriks hak akses efektif: tiap peran hanya melihat modul yang boleh ia baca. */
function useNav() {
  const { can, enabled, canPage, hasRole } = useAuth();
  const groups = [
    {
      title: 'Utama',
      items: [
        { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
        { to: '/my-work', label: 'Pekerjaan Saya', icon: 'inbox', badge: 'work' },
        { to: '/portal', label: 'Portal Layanan', icon: 'help' },
      ],
    },
    ...NAV_GROUPS.map((g) => ({
      title: g,
      items: Object.entries(MODULES)
        .filter(([k, m]) => m.group === g && (can(k) || (hasRole('admin') && !enabled(k))))
        .map(([k, m]) => ({ to: `/m/${k}`, label: m.plural, icon: m.icon, locked: !enabled(k) })),
    })),
    {
      title: 'Analitik & Kepatuhan',
      items: [
        canPage('kpi') && { to: '/kpi', label: 'Dashboard KPI', icon: 'trend' },
        canPage('reports') && { to: '/reports', label: 'Laporan Operasional', icon: 'chart' },
        canPage('compliance') && enabled('controls') && { to: '/compliance', label: 'Kepatuhan', icon: 'clipboard' },
        canPage('audit') && { to: '/audit', label: 'Audit Log', icon: 'scroll' },
      ].filter(Boolean),
    },
    {
      title: 'Administrasi',
      items: [
        canPage('users') && { to: '/users', label: 'Pengguna', icon: 'users' },
        canPage('access') && { to: '/access', label: 'Peran & Akses', icon: 'key' },
        canPage('settings') && { to: '/settings', label: 'Pengaturan Workspace', icon: 'settings' },
      ].filter(Boolean),
    },
  ];
  return groups.filter((g) => g.items.length);
}

export default function Layout() {
  const { user, tenant, logout, isPlatform } = useAuth();
  const [open, setOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const [workCount, setWorkCount] = useState(0);
  const location = useLocation();
  const nav = useNav();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (isPlatform) return;
    api('/my-work').then((w) => setWorkCount(w.assigned.length + w.approvals.length)).catch(() => {});
  }, [location.pathname, isPlatform]);

  const platformNav = [{ title: 'Platform', items: [{ to: '/', label: 'Tenant', icon: 'tenant', end: true }] }];

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-head">
          <div className="brand">
            <div className="logo">IT</div>
            <div>
              <div className="brand-name">Nusa ITSM</div>
              <div className="brand-org">{isPlatform ? 'Konsol Platform' : 'Service Management Cloud'}</div>
            </div>
          </div>
          {tenant && (
            <div className="workspace-card">
              <div className="ws-name" title={tenant.name}>{tenant.name}</div>
              <div className="ws-meta">
                <span className="plan-pill">{tenant.planName}</span>
                <span>{tenant.slug}</span>
                {tenant.status === 'trial' && <span>· trial</span>}
              </div>
            </div>
          )}
        </div>
        <nav aria-label="Navigasi utama">
          {(isPlatform ? platformNav : nav).map((g) => (
            <div key={g.title} className="nav-group">
              <div className="nav-title">{g.title}</div>
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''} ${it.locked ? 'locked' : ''}`}
                  title={it.locked ? 'Tidak termasuk paket langganan — upgrade untuk mengaktifkan' : undefined}>
                  <Icon name={it.icon} />
                  <span>{it.label}</span>
                  {it.locked && <Icon name="lock" size="sm" className="lock" />}
                  {it.badge === 'work' && workCount > 0 && <span className="count">{workCount}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">ITIL 4 · ISO 20000/27001 · NIST CSF 2.0 · OJK</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn hamburger" onClick={() => setOpen(!open)} aria-label="Buka menu"><Icon name="menu" /></button>
          {!isPlatform && <GlobalSearch />}
          <div className="topbar-actions">
            {!isPlatform && <QuickCreate />}
            {!isPlatform && <a className="icon-btn hide-sm" href={publicHref(tenant ? `/w/${tenant.slug}` : '/')} title="Situs bantuan publik"><Icon name="globe" /></a>}
            {!isPlatform && <Notifications />}
            <button className="icon-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Tema terang' : 'Tema gelap'} aria-label="Ganti tema">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <UserMenu user={user} logout={logout} />
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

function GlobalSearch() {
  const { open, setOpen, ref } = usePopover();
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState([]);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.querySelector('input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ref]);
  useEffect(() => {
    if (q.trim().length < 2) return setGroups([]);
    setBusy(true);
    const t = setTimeout(() => api('/search', { query: { q } }).then(setGroups).catch(() => setGroups([])).finally(() => setBusy(false)), 200);
    return () => clearTimeout(t);
  }, [q]);
  const go = (path) => {
    setOpen(false);
    setQ('');
    navigate(path);
  };
  return (
    <div className="gsearch" ref={ref}>
      <div className="gsearch-input">
        <Icon name="search" size="sm" />
        <input placeholder="Cari tiket, aset, artikel, vendor…" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} aria-label="Pencarian global" />
        <span className="kbd hide-sm">Ctrl K</span>
      </div>
      {open && q.trim().length >= 2 && (
        <div className="popover">
          {busy && !groups.length && <div className="pop-empty">Mencari…</div>}
          {!busy && !groups.length && <div className="pop-empty">Tidak ada hasil untuk “{q}”</div>}
          {groups.map((g) => (
            <div key={g.resource}>
              <div className="pop-group">{MODULES[g.resource]?.plural || g.label}</div>
              {g.items.map((it) => (
                <div key={it._id} className="pop-item" onClick={() => go(`/m/${g.resource}/${it._id}`)}>
                  <Icon name={MODULES[g.resource]?.icon} size="sm" />
                  <span className="mono">{it.number || it.code}</span>
                  <span className="grow">{it.title || it.name}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickCreate() {
  const { can } = useAuth();
  const { open, setOpen, ref } = usePopover();
  const navigate = useNavigate();
  const items = QUICK_CREATE.filter((k) => can(k, 'create'));
  if (!items.length) return null;
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn btn-primary" onClick={() => setOpen(!open)}><Icon name="plus" size="sm" /><span className="hide-sm">Buat</span></button>
      {open && (
        <div className="popover menu">
          {items.map((k) => (
            <button key={k} className="menu-item" onClick={() => { setOpen(false); navigate(`/m/${k}/new`); }}>
              <Icon name={MODULES[k].icon} size="sm" />{MODULES[k].label} baru
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { open, setOpen, ref } = usePopover();
  const [data, setData] = useState({ items: [], unread: 0 });
  const navigate = useNavigate();
  const load = useCallback(() => api('/notifications').then(setData).catch(() => {}), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { if (open) load(); }, [open, load]);
  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) await api(`/notifications/${n._id}/read`, { method: 'POST' }).catch(() => {});
    load();
    if (n.link?.resource) navigate(`/m/${n.link.resource}/${n.link.id}`);
  };
  const readAll = async () => {
    await api('/notifications/read-all', { method: 'POST' });
    load();
  };
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-label={`Notifikasi (${data.unread} belum dibaca)`}>
        <Icon name="bell" />
        {data.unread > 0 && <span className="dot">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="popover notif-pop">
          <div className="card-head">
            <h3>Notifikasi</h3>
            {data.unread > 0 && <button className="btn btn-ghost btn-sm" onClick={readAll}>Tandai semua dibaca</button>}
          </div>
          {data.items.map((n) => (
            <div key={n._id} className={`notif ${n.read ? '' : 'unread'}`} onClick={() => openItem(n)}>
              <Icon name={n.kind === 'approval' ? 'checkSquare' : 'bell'} size="sm" />
              <div>
                <div style={{ fontWeight: n.read ? 500 : 700 }}>{n.title}</div>
                {n.body && <div className="small muted">{n.body}</div>}
                <div className="small muted">{fmtDateTime(n.createdAt)}</div>
              </div>
            </div>
          ))}
          {!data.items.length && <div className="pop-empty">Belum ada notifikasi</div>}
        </div>
      )}
    </div>
  );
}

function UserMenu({ user, logout }) {
  const { open, setOpen, ref } = usePopover();
  const [pw, setPw] = useState(false);
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="user-btn" onClick={() => setOpen(!open)} aria-label="Menu pengguna">
        <span className="avatar">{initials(user.name)}</span>
        <span className="hide-sm" style={{ textAlign: 'left', lineHeight: 1.2 }}>
          <b style={{ fontSize: 13 }}>{user.name}</b>
          <br /><span className="small muted">{user.roles.join(', ')}</span>
        </span>
        <Icon name="chevronDown" size="sm" />
      </button>
      {open && (
        <div className="popover menu">
          <div style={{ padding: '8px 10px' }}>
            <b>{user.name}</b>
            <div className="small muted">{user.email}</div>
          </div>
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => { setOpen(false); setPw(true); }}><Icon name="key" size="sm" />Ubah password</button>
          <button className="menu-item" onClick={logout}><Icon name="logout" size="sm" />Keluar</button>
        </div>
      )}
      {pw && <ChangePassword onClose={() => setPw(false)} />}
    </div>
  );
}

function ChangePassword({ onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api('/auth/change-password', { method: 'POST', body: f });
      toast('Password berhasil diubah');
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal title="Ubah password" onClose={onClose} width={420}>
      <form onSubmit={submit}>
        <div className="modal-body stack">
          {error && <div className="alert">{error}</div>}
          <label><span>Password saat ini</span><input type="password" required value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></label>
          <label><span>Password baru (min. 8 karakter)</span><input type="password" required minLength={8} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></label>
        </div>
        <div className="form-actions"><button type="button" className="btn" onClick={onClose}>Batal</button><button className="btn btn-primary">Simpan</button></div>
      </form>
    </Modal>
  );
}

function DemoBanner() {
  const reset = async () => {
    if (!window.confirm('Kembalikan semua data demo (semua workspace) ke kondisi awal?')) return;
    const { resetDemo } = await import('../demo/server.js');
    resetDemo();
    window.location.reload();
  };
  return (
    <div className="demo-banner">
      <span><b>Mode demo</b> — data contoh multi-tenant berjalan di browser Anda (localStorage). Versi produksi memakai Node.js + MongoDB.</span>
      <button className="btn btn-sm" onClick={reset}>Reset data demo</button>
    </div>
  );
}
