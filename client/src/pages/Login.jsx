import { useState } from 'react';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <div className="brand"><div className="logo">IT</div><div className="brand-name">ITSM Platform</div></div>
        <p className="muted small">IT Service Management multi-industri — ITIL 4 · TOGAF · ITAM · NIST CSF · PMBOK · Scrum · Regulasi Indonesia</p>
        {error && <div className="alert">{error}</div>}
        <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></label>
        <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Memproses…' : 'Masuk'}</button>
        <p className="muted small">Demo (setelah <code>npm run seed</code>): admin@itsm.local / Password123!</p>
      </form>
    </div>
  );
}
