import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { publicHref } from '../links.js';
import { Badge } from '../components/format.jsx';
import Icon from '../components/Icon.jsx';
import { PageHeader, useToast } from '../components/ui.jsx';
import { PLANS } from '../../../shared/plans.mjs';

export default function Settings() {
  const { refresh, tenant: session } = useAuth();
  const toast = useToast();
  const [t, setT] = useState(null);
  const [catalog, setCatalog] = useState(null);
  useEffect(() => {
    api('/tenant').then(setT);
    api('/compliance/catalog').then(setCatalog);
  }, []);
  if (!t || !catalog) return <div className="card"><div className="skeleton" style={{ height: 160 }} /></div>;

  const set = (k, v) => setT({ ...t, [k]: v });
  const chooseIndustry = (id) => setT({ ...t, industry: id, enabledFrameworks: catalog.industries.find((i) => i.id === id).frameworks });
  const toggle = (id) => set('enabledFrameworks', t.enabledFrameworks.includes(id) ? t.enabledFrameworks.filter((f) => f !== id) : [...t.enabledFrameworks, id]);
  const save = async () => {
    try {
      const { name, industry, enabledFrameworks, timezone, dataResidency, regulatorContact, branding } = t;
      setT(await api('/tenant', { method: 'PUT', body: { name, industry, enabledFrameworks, timezone, dataResidency, regulatorContact, branding } }));
      await refresh();
      toast('Pengaturan workspace tersimpan. Sinkronkan kontrol di menu Kepatuhan untuk framework baru.');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const industry = catalog.industries.find((i) => i.id === t.industry);

  return (
    <div>
      <PageHeader icon="settings" title="Pengaturan Workspace" description="Profil organisasi, paket langganan, serta framework & regulasi yang berlaku untuk industri Anda."
        actions={<button className="btn btn-primary" onClick={save}><Icon name="check" size="sm" />Simpan pengaturan</button>} />

      <div className="card flush">
        <section className="form-section">
          <h3>Profil organisasi</h3>
          <div className="form-grid">
            <label><span>Nama organisasi</span><input value={t.name} onChange={(e) => set('name', e.target.value)} /></label>
            <label><span>Kode workspace</span><input value={t.slug} disabled /><span className="hint">Dipakai saat login & alamat situs bantuan publik.</span></label>
            <label>
              <span>Industri</span>
              <select value={t.industry} onChange={(e) => chooseIndustry(e.target.value)}>
                {catalog.industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </label>
            <label><span>Zona waktu</span><input value={t.timezone || ''} onChange={(e) => set('timezone', e.target.value)} /></label>
            <label><span>Kebijakan lokasi data</span><input value={t.dataResidency || ''} onChange={(e) => set('dataResidency', e.target.value)} /></label>
            <label><span>Kontak regulator / pelaporan</span><input value={t.regulatorContact || ''} onChange={(e) => set('regulatorContact', e.target.value)} /></label>
            <label className="full"><span>Tagline situs bantuan publik</span><input value={t.branding?.tagline || ''} onChange={(e) => set('branding', { ...t.branding, tagline: e.target.value })} placeholder="mis. Layanan TI yang andal untuk nasabah & pegawai" /></label>
          </div>
          {industry?.note && <p className="small note">{industry.note}</p>}
          <p className="small" style={{ marginBottom: 0 }}><Icon name="globe" size="sm" /> Situs bantuan publik: <a href={publicHref(`/w/${t.slug}`)} target="_blank" rel="noreferrer">{publicHref(`/w/${t.slug}`)}</a></p>
        </section>
      </div>

      <div className="card">
        <div className="row between">
          <h3 style={{ margin: 0 }}>Paket langganan</h3>
          <span className="small muted">Status: <Badge tone={t.status === 'active' ? 'green' : t.status === 'trial' ? 'gold' : 'red'}>{t.status}</Badge>{t.trialEndsAt && t.status === 'trial' && ` · trial berakhir ${new Date(t.trialEndsAt).toLocaleDateString('id-ID')}`}</span>
        </div>
        <div className="grid-3" style={{ marginTop: 14 }}>
          {Object.entries(PLANS).map(([k, p]) => (
            <div key={k} className={`card ${k === t.plan ? 'highlight' : ''}`} style={{ margin: 0 }}>
              <div className="row between"><b style={{ fontSize: 15 }}>{p.name}</b>{k === t.plan && <Badge tone="indigo">Paket aktif</Badge>}</div>
              <div className="score" style={{ fontSize: 18, margin: '6px 0' }}>{p.price}</div>
              <p className="small muted">{p.summary}</p>
              <ul className="plain small">{p.features.map((f) => <li key={f}><Icon name="check" size="sm" /> {f}</li>)}</ul>
              <div className="small muted">{p.maxUsers ? `Hingga ${p.maxUsers} pengguna aktif` : 'Pengguna tanpa batas'}</div>
            </div>
          ))}
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>Perubahan paket diproses oleh operator platform. Workspace: <b>{session?.slug}</b>.</p>
      </div>

      <div className="card">
        <h3>Framework & regulasi aktif</h3>
        <p className="muted small">Memilih industri mengaktifkan paket default. Tambah atau kurangi sesuai kebutuhan, lalu sinkronkan kontrol di menu Kepatuhan.</p>
        <div className="fw-list">
          {catalog.frameworks.map((f) => (
            <label key={f.id} className="fw-item inline">
              <input type="checkbox" checked={t.enabledFrameworks.includes(f.id)} onChange={() => toggle(f.id)} />
              <span>
                <b>{f.name}</b>
                <br /><span className="muted small">{f.issuer} · {f.controlCount} kontrol · <Badge tone={f.type === 'regulation' ? 'red' : f.type === 'standard' ? 'indigo' : 'teal'}>{f.type === 'regulation' ? 'Regulasi' : f.type === 'standard' ? 'Standar' : 'Best practice'}</Badge></span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
