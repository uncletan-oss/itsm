import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, setToken } from '../api.js';
import { portalHref } from '../links.js';
import Icon from '../components/Icon.jsx';
import { industries } from '../../../shared/frameworks.mjs';
import { PLANS, validateSlug } from '../../../shared/plans.mjs';

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** Pendaftaran SaaS: membuat tenant + admin + konfigurasi awal, lalu langsung masuk ke portal. */
export default function Signup() {
  const [params] = useSearchParams();
  const [f, setF] = useState({ organizationName: '', slug: '', industry: 'general', plan: params.get('paket') === 'starter' ? 'starter' : 'professional', adminName: '', adminEmail: '', password: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v, ...(k === 'organizationName' && !slugTouched ? { slug: slugify(v) } : {}) }));
  const slugErr = f.slug && validateSlug(f.slug);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api('/public/signup', { method: 'POST', body: f });
      setToken(r.token);
      try { localStorage.setItem('itsm_workspace', r.workspace); } catch { /* abaikan */ }
      window.location.href = portalHref('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="pub-wrap pub-section pub-signup">
      <div>
        <span className="pub-eyebrow">Trial 14 hari · tanpa kartu kredit</span>
        <h1>Buat workspace ITSM Anda</h1>
        <p className="muted">Workspace baru langsung berisi kebijakan SLA P1–P4, katalog layanan dasar, dan kontrol kepatuhan sesuai industri yang Anda pilih.</p>
        <ul className="plain">
          <li><Icon name="check" size="sm" /> Data terisolasi per organisasi</li>
          <li><Icon name="check" size="sm" /> Paket regulasi otomatis per industri</li>
          <li><Icon name="check" size="sm" /> Situs bantuan publik di <code>/w/&lt;kode-workspace&gt;</code></li>
        </ul>
      </div>
      <form className="card flush" onSubmit={submit}>
        {error && <div style={{ padding: '16px 20px 0' }}><div className="alert"><Icon name="alert" size="sm" />{error}</div></div>}
        <section className="form-section">
          <h3>Organisasi</h3>
          <div className="form-grid">
            <label className="full"><span>Nama organisasi</span><input required value={f.organizationName} onChange={(e) => set('organizationName', e.target.value)} placeholder="PT Contoh Sejahtera" /></label>
            <label>
              <span>Kode workspace</span>
              <input required value={f.slug} onChange={(e) => { setSlugTouched(true); set('slug', slugify(e.target.value)); }} />
              <span className="hint" style={slugErr ? { color: 'var(--red)' } : undefined}>{slugErr || 'Dipakai untuk login & alamat pusat bantuan.'}</span>
            </label>
            <label><span>Industri</span><select value={f.industry} onChange={(e) => set('industry', e.target.value)}>{industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
            <label className="full"><span>Paket</span>
              <select value={f.plan} onChange={(e) => set('plan', e.target.value)}>
                {['starter', 'professional'].map((k) => <option key={k} value={k}>{PLANS[k].name} — {PLANS[k].summary}</option>)}
              </select>
            </label>
          </div>
        </section>
        <section className="form-section">
          <h3>Administrator workspace</h3>
          <div className="form-grid">
            <label><span>Nama lengkap</span><input required value={f.adminName} onChange={(e) => set('adminName', e.target.value)} /></label>
            <label><span>Email kerja</span><input type="email" required value={f.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} /></label>
            <label className="full"><span>Password (min. 8 karakter)</span><input type="password" required minLength={8} value={f.password} onChange={(e) => set('password', e.target.value)} /></label>
          </div>
        </section>
        <div className="form-actions">
          <span className="small muted grow">Dengan mendaftar Anda menyetujui ketentuan layanan.</span>
          <button className="btn btn-primary" disabled={busy || !!slugErr}>{busy ? 'Menyiapkan workspace…' : 'Buat workspace'}</button>
        </div>
      </form>
    </div>
  );
}
