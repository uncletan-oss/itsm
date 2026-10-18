import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge } from '../components/format.jsx';

export default function Settings() {
  const [s, setS] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    api('/settings').then(setS);
    api('/compliance/catalog').then(setCatalog);
  }, []);
  if (!s || !catalog) return <div className="muted">Memuat…</div>;

  const set = (k, v) => setS({ ...s, [k]: v });
  const chooseIndustry = (id) => {
    const ind = catalog.industries.find((i) => i.id === id);
    setS({ ...s, industry: id, enabledFrameworks: ind.frameworks });
  };
  const toggle = (id) =>
    set('enabledFrameworks', s.enabledFrameworks.includes(id) ? s.enabledFrameworks.filter((f) => f !== id) : [...s.enabledFrameworks, id]);
  const save = async () => {
    try {
      const saved = await api('/settings', { method: 'PUT', body: s });
      setS(saved);
      setMsg('Pengaturan tersimpan. Buka menu Kepatuhan → “Sinkronkan kontrol” untuk membuat kontrol framework yang baru diaktifkan.');
    } catch (e) {
      setMsg(e.message);
    }
  };
  const industry = catalog.industries.find((i) => i.id === s.industry);

  return (
    <div>
      <h1>⚙️ Pengaturan Organisasi</h1>
      {msg && <div className="alert info">{msg}</div>}
      <div className="card">
        <div className="form-grid">
          <label><span>Nama Organisasi</span><input value={s.organizationName} onChange={(e) => set('organizationName', e.target.value)} /></label>
          <label>
            <span>Industri</span>
            <select value={s.industry} onChange={(e) => chooseIndustry(e.target.value)}>
              {catalog.industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <label><span>Zona Waktu</span><input value={s.timezone} onChange={(e) => set('timezone', e.target.value)} /></label>
          <label><span>Kebijakan Lokasi Data (Data Residency)</span><input value={s.dataResidency} onChange={(e) => set('dataResidency', e.target.value)} /></label>
          <label className="full"><span>Kontak Regulator / Pelaporan</span><input value={s.regulatorContact || ''} onChange={(e) => set('regulatorContact', e.target.value)} /></label>
        </div>
        {industry?.note && <p className="small note">{industry.note}</p>}
      </div>
      <div className="card">
        <h3>Framework & Regulasi Aktif</h3>
        <p className="muted small">Memilih industri akan mengaktifkan paket default. Anda dapat menambah/mengurangi sesuai kebutuhan.</p>
        <div className="fw-list">
          {catalog.frameworks.map((f) => (
            <label key={f.id} className="fw-item inline">
              <input type="checkbox" checked={s.enabledFrameworks.includes(f.id)} onChange={() => toggle(f.id)} />
              <span>
                <b>{f.name}</b> <Badge tone={f.type === 'regulation' ? 'red' : f.type === 'standard' ? 'indigo' : 'teal'}>{f.type}</Badge>
                <br /><span className="muted small">{f.issuer} · {f.controlCount} kontrol</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="row end"><button className="btn btn-primary" onClick={save}>Simpan Pengaturan</button></div>
    </div>
  );
}
