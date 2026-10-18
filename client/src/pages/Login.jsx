import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { DEMO } from '../api.js';
import { publicHref } from '../links.js';

const DEMO_ACCOUNTS = [
  ['admin', 'Admin'], ['servicedesk', 'Service Desk'], ['tech', 'Teknisi'], ['change', 'Change Manager'], ['cab', 'Anggota CAB'],
  ['risk', 'Risk Officer'], ['pm', 'Project Manager'], ['auditor', 'Auditor'], ['user', 'End User'],
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e, creds) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(...(creds || [email, password]));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <div className="brand"><div className="logo">IT</div><div className="brand-name">Portal ITSM</div></div>
        <p className="muted small">IT Service Management multi-industri — ITIL 4 · TOGAF · ITAM · NIST CSF · PMBOK · Scrum · Regulasi Indonesia</p>
        {error && <div className="alert">{error}</div>}
        <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></label>
        <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Memproses…' : 'Masuk'}</button>
        {DEMO ? (
          <div className="stack">
            <span className="small muted">Mode demo — masuk cepat sebagai:</span>
            <div className="row">
              {DEMO_ACCOUNTS.map(([k, l]) => (
                <button key={k} type="button" className="btn small" disabled={busy} onClick={(e) => submit(e, [`${k}@itsm.local`, 'Password123!'])}>{l}</button>
              ))}
            </div>
            <span className="small muted">atau gunakan <code>admin@itsm.local</code> / <code>Password123!</code></span>
          </div>
        ) : (
          <p className="muted small">Demo (setelah <code>npm run seed</code>): admin@itsm.local / Password123!</p>
        )}
        <a className="small center" href={publicHref('/')}>← Kembali ke situs publik</a>
      </form>
    </div>
  );
}
