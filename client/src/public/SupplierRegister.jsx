import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, setToken } from '../api.js';
import { portalHref } from '../links.js';
import Icon from '../components/Icon.jsx';

const CATEGORIES = [['hardware', 'Perangkat keras'], ['software', 'Perangkat lunak & lisensi'], ['cloud', 'Layanan cloud'], ['network', 'Jaringan & keamanan'], ['data_center', 'Data center / kolokasi'], ['managed_service', 'Managed service / alih daya'], ['consulting', 'Konsultan / jasa profesional'], ['other', 'Lainnya']];

/** Registrasi mandiri penyedia: membuat data vendor (prospek, menunggu due diligence) + akun portal penyedia. */
export default function SupplierRegister() {
  const { info, slug } = useOutletContext();
  const [f, setF] = useState({ companyName: '', category: 'hardware', npwp: '', nib: '', phone: '', website: '', address: '', contactName: '', email: '', password: '', agree: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api(`/public/t/${slug}/supplier-register`, { method: 'POST', body: f });
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
        <span className="pub-eyebrow">Portal penyedia · {info?.name || slug}</span>
        <h1>Daftar sebagai penyedia barang & jasa TI</h1>
        <p className="muted">Setelah mendaftar, tim procurement akan memverifikasi legalitas dan melakukan due diligence. Penyedia terverifikasi dapat:</p>
        <ul className="plain">
          <li><Icon name="check" size="sm" /> Menerima undangan RFQ/tender & mengajukan penawaran tersegel secara online</li>
          <li><Icon name="check" size="sm" /> Mengonfirmasi purchase order & mencatat pengiriman</li>
          <li><Icon name="check" size="sm" /> Mengajukan e-invoice & memantau status pembayaran</li>
          <li><Icon name="check" size="sm" /> Mengusulkan item & harga e-katalog berdasarkan kontrak payung</li>
        </ul>
        <p className="small muted">Data Anda diproses sesuai UU No. 27/2022 tentang Pelindungan Data Pribadi dan hanya digunakan untuk keperluan pengadaan.</p>
      </div>
      <form className="card flush" onSubmit={submit}>
        {error && <div style={{ padding: '16px 20px 0' }}><div className="alert"><Icon name="alert" size="sm" />{error}</div></div>}
        <section className="form-section">
          <h3>Perusahaan</h3>
          <div className="form-grid">
            <label className="full"><span>Nama perusahaan (sesuai akta) *</span><input required value={f.companyName} onChange={set('companyName')} placeholder="PT Contoh Teknologi" /></label>
            <label><span>Bidang usaha</span><select value={f.category} onChange={set('category')}>{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label><span>NPWP perusahaan *</span><input required value={f.npwp} onChange={set('npwp')} placeholder="01.234.567.8-901.000" /></label>
            <label><span>NIB (OSS)</span><input value={f.nib} onChange={set('nib')} /></label>
            <label><span>Telepon</span><input value={f.phone} onChange={set('phone')} /></label>
            <label className="full"><span>Alamat</span><textarea rows={2} value={f.address} onChange={set('address')} /></label>
            <label className="full"><span>Situs web</span><input value={f.website} onChange={set('website')} placeholder="https://" /></label>
          </div>
        </section>
        <section className="form-section">
          <h3>Akun penanggung jawab</h3>
          <div className="form-grid">
            <label><span>Nama *</span><input required value={f.contactName} onChange={set('contactName')} /></label>
            <label><span>Email kerja *</span><input type="email" required value={f.email} onChange={set('email')} autoComplete="username" /></label>
            <label className="full"><span>Password (min. 8 karakter) *</span><input type="password" required minLength={8} value={f.password} onChange={set('password')} autoComplete="new-password" /></label>
          </div>
          <label className="inline" style={{ marginTop: 14 }}><input type="checkbox" checked={f.agree} onChange={set('agree')} /><span>Saya menyetujui pakta integritas (anti-suap, anti-persekongkolan, kerahasiaan informasi pengadaan) dan ketentuan penyedia.</span></label>
        </section>
        <div className="form-actions"><a className="btn" href={portalHref('/', slug)}>Sudah punya akun? Masuk</a><button className="btn btn-primary" disabled={busy || !f.agree}><Icon name="check" size="sm" />Daftar sebagai penyedia</button></div>
      </form>
    </div>
  );
}
