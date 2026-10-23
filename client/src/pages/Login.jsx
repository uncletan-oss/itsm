import { useEffect, useState } from 'react';
import { useAuth, lastWorkspace } from '../auth.jsx';
import { api, DEMO } from '../api.js';
import { publicHref } from '../links.js';
import Icon from '../components/Icon.jsx';

const DEMO_ACCOUNTS = [
  ['admin', 'Admin'], ['servicedesk', 'Service Desk'], ['tech', 'Teknisi'], ['change', 'Change Mgr'], ['cab', 'Anggota CAB'],
  ['risk', 'Risk Officer'], ['pm', 'Project Mgr'], ['auditor', 'Auditor'], ['user', 'End User'],
  ['executive', 'CIO / Direksi'], ['finance', 'IT Controller'], ['vendor', 'Procurement'], ['accountant', 'Akuntan'],
  ['treasurer', 'Treasury'], ['dc', 'DC Manager'], ['bcm', 'BCM'], ['ciso', 'CISO'], ['architect', 'Arsitek'],
  ['supplier', 'Penyedia (vendor)'], ['supplier3', 'Penyedia baru'],
];
const wsFromUrl = () => new URLSearchParams(window.location.search).get('ws') || new URLSearchParams(window.location.hash.split('?')[1] || '').get('ws');

export default function Login() {
  const { login } = useAuth();
  const [workspace, setWorkspace] = useState(() => wsFromUrl() || lastWorkspace() || (DEMO ? 'bank-nusantara' : ''));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  useEffect(() => { if (DEMO) api('/public/workspaces').then((r) => setWorkspaces(r.items)).catch(() => {}); }, []);

  const submit = async (e, creds) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(...(creds || [workspace.trim().toLowerCase(), email, password]));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <section className="auth-brand">
        <div className="brand"><div className="logo">IT</div><div><div className="brand-name">Nusa ITSM</div><div className="brand-org">Service Management Cloud</div></div></div>
        <div>
          <h1>Kelola layanan TI dengan tata kelola kelas enterprise.</h1>
          <p>Satu platform untuk service desk, aset, risiko, dan kepatuhan — dirancang untuk industri teregulasi di Indonesia.</p>
          <div className="auth-points">
            <div><Icon name="check" />Praktik ITIL 4, ISO/IEC 20000 & 27001</div>
            <div><Icon name="check" />Paket regulasi per industri, termasuk OJK PADK 1/2026</div>
            <div><Icon name="check" />Workspace terisolasi per organisasi (multi-tenant)</div>
          </div>
        </div>
        <div className="small" style={{ color: '#7d8aa3' }}>© Nusa ITSM · Data Anda tersimpan terpisah per workspace</div>
      </section>
      <section className="auth-form">
        <form className="auth-card" onSubmit={submit}>
          <div>
            <h2>Masuk ke workspace</h2>
            <p className="muted" style={{ margin: '6px 0 0' }}>Gunakan kode workspace organisasi Anda.</p>
          </div>
          {error && <div className="alert"><Icon name="alert" size="sm" />{error}</div>}
          <label>
            <span>Workspace</span>
            <input value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="mis. bank-nusantara" autoCapitalize="none" />
            <span className="hint">Kosongkan untuk masuk sebagai operator platform.</span>
          </label>
          {DEMO && workspaces.length > 0 && (
            <div className="ws-chips">
              {workspaces.map((w) => (
                <button type="button" key={w.slug} className={`chip-btn ${workspace === w.slug ? 'active' : ''}`} onClick={() => setWorkspace(w.slug)} title={`${w.name} · ${w.plan}`}>{w.name}</button>
              ))}
            </div>
          )}
          <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required={!DEMO} autoComplete="username" /></label>
          <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required={!DEMO} autoComplete="current-password" /></label>
          <button className="btn btn-primary" disabled={busy} style={{ padding: '10px' }}>{busy ? 'Memproses…' : 'Masuk'}</button>
          {DEMO && (
            <div className="stack" style={{ gap: 8 }}>
              <span className="small muted">Mode demo — masuk cepat ke <b>{workspace || 'platform'}</b> sebagai:</span>
              <div className="role-quick">
                {DEMO_ACCOUNTS.filter(([k]) => !workspaces.length || workspaces.find((w) => w.slug === workspace)?.accounts?.includes(k)).map(([k, l]) => (
                  <button key={k} type="button" className="btn btn-sm" disabled={busy || !workspace} onClick={(e) => submit(e, [workspace, `${k}@itsm.local`, 'Password123!'])}>{l}</button>
                ))}
              </div>
              <button type="button" className="btn btn-sm btn-ghost" onClick={(e) => submit(e, ['', 'platform@itsm.local', 'Password123!'])}><Icon name="tenant" size="sm" />Operator platform (konsol SaaS)</button>
            </div>
          )}
          <div className="row between small">
            <a href={publicHref('/daftar')}>Belum punya workspace? Daftar gratis</a>
            <a href={publicHref('/')}>Situs publik</a>
          </div>
          {workspace && <a className="small center" href={publicHref(`/w/${workspace}/penyedia`)}><Icon name="briefcase" size="sm" /> Penyedia barang/jasa? Daftar di portal penyedia</a>}
        </form>
      </section>
    </div>
  );
}
