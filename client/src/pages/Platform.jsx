import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, fmtDate } from '../components/format.jsx';
import Icon from '../components/Icon.jsx';
import { Kpi } from './Dashboard.jsx';
import { Modal, PageHeader, useToast } from '../components/ui.jsx';
import { PLANS, DOMAINS, ALL_MODULES } from '../../../shared/plans.mjs';
import { MODULES } from '../config/modules.js';
import { industries } from '../../../shared/frameworks.mjs';

const EMPTY = { name: '', slug: '', industry: 'general', plan: 'professional', adminName: '', adminEmail: '', adminPassword: '' };

/** Konsol operator platform SaaS: kelola tenant, paket & status — tanpa akses ke data operasional tenant. */
export default function Platform() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [form, setForm] = useState(null);
  const [grant, setGrant] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/platform/tenants').then((r) => setItems(r.items));
  useEffect(() => { load(); }, []);

  const update = async (t, body) => {
    try {
      await api(`/platform/tenants/${t._id}`, { method: 'PUT', body });
      toast(`${t.name} diperbarui`);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const create = async (e) => {
    e.preventDefault();
    try {
      await api('/platform/tenants', { method: 'POST', body: form });
      toast('Tenant baru dibuat');
      setForm(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };
  const count = (fn) => (items || []).filter(fn).length;

  return (
    <div>
      <PageHeader icon="tenant" title="Tenant" description="Kelola organisasi pelanggan: paket langganan, status, dan provisioning workspace baru. Operator tidak dapat melihat data operasional tenant."
        actions={<button className="btn btn-primary" onClick={() => { setError(''); setForm({ ...EMPTY }); }}><Icon name="plus" size="sm" />Tenant baru</button>} />
      <div className="kpis">
        <Kpi icon="tenant" label="Total tenant" value={items?.length} />
        <Kpi icon="check" tone="green" label="Aktif" value={count((t) => t.status === 'active')} />
        <Kpi icon="clock" tone="gold" label="Trial" value={count((t) => t.status === 'trial')} />
        <Kpi icon="lock" tone="red" label="Ditangguhkan" value={count((t) => t.status === 'suspended')} />
      </div>
      <div className="card flush table-wrap">
        <table>
          <thead><tr><th>Organisasi</th><th>Industri</th><th>Paket</th><th>Status</th><th>Modul</th><th>Pengguna</th><th>Incident</th><th>Dibuat</th></tr></thead>
          <tbody>
            {(items || []).map((t) => (
              <tr key={t._id}>
                <td><b>{t.name}</b><div className="small muted mono">{t.slug}</div></td>
                <td className="small">{industries.find((i) => i.id === t.industry)?.name || t.industry}</td>
                <td>
                  <select value={t.plan} onChange={(e) => update(t, { plan: e.target.value })} style={{ width: 'auto' }} aria-label="Paket">
                    {Object.entries(PLANS).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}
                  </select>
                </td>
                <td>
                  <select value={t.status} onChange={(e) => update(t, { status: e.target.value })} style={{ width: 'auto' }} aria-label="Status">
                    <option value="trial">Trial</option><option value="active">Aktif</option><option value="suspended">Ditangguhkan</option>
                  </select>
                  {t.status === 'suspended' && <> <Badge tone="red">diblokir</Badge></>}
                </td>
                <td>
                  <button className="btn btn-sm" onClick={() => setGrant({ tenant: t, custom: t.customModules, modules: t.grantedModules || [], maxUsers: t.maxUsers ?? '' })}>
                    <Icon name="layers" size="sm" />{(t.grantedModules || []).length}/{ALL_MODULES.length}
                  </button>
                  {t.customModules && <> <span className="badge badge-gold plain">kustom</span></>}
                </td>
                <td>{t.activeUsers}{t.userLimit ? <span className="muted"> / {t.userLimit}</span> : <span className="muted"> / ∞</span>}</td>
                <td>{t.incidents}</td>
                <td className="small">{fmtDate(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {grant && <GrantModal grant={grant} setGrant={setGrant} onSave={async () => {
        await update(grant.tenant, { modules: grant.custom ? grant.modules : null, maxUsers: grant.maxUsers === '' ? null : Number(grant.maxUsers) });
        setGrant(null);
      }} />}
      {form && (
        <Modal title="Provisioning tenant baru" onClose={() => setForm(null)}>
          <form onSubmit={create}>
            <div className="modal-body">
              {error && <div className="alert">{error}</div>}
              <div className="form-grid">
                <label><span>Nama organisasi</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <label><span>Kode workspace</span><input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} /></label>
                <label><span>Industri</span><select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}>{industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
                <label><span>Paket</span><select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>{Object.entries(PLANS).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}</select></label>
                <label><span>Nama admin</span><input required value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} /></label>
                <label><span>Email admin</span><input type="email" required value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} /></label>
                <label><span>Password awal admin</span><input type="password" required minLength={8} value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} /></label>
              </div>
            </div>
            <div className="form-actions"><button type="button" className="btn" onClick={() => setForm(null)}>Batal</button><button className="btn btn-primary">Buat tenant</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/** Pemberian modul per tenant oleh operator platform: ikuti paket, atau pilih modul secara eksplisit. */
function GrantModal({ grant, setGrant, onSave }) {
  const plan = PLANS[grant.tenant.plan];
  const toggle = (m) => setGrant({ ...grant, custom: true, modules: grant.modules.includes(m) ? grant.modules.filter((x) => x !== m) : [...grant.modules, m] });
  const toggleDomain = (mods, on) => setGrant({ ...grant, custom: true, modules: on ? [...new Set([...grant.modules, ...mods])] : grant.modules.filter((m) => !mods.includes(m)) });
  return (
    <Modal title={`Modul untuk ${grant.tenant.name}`} onClose={() => setGrant(null)} width={860}>
      <div className="modal-body stack">
        <div className="row between">
          <label className="inline">
            <input type="checkbox" checked={!grant.custom} onChange={(e) => setGrant({ ...grant, custom: !e.target.checked, modules: e.target.checked ? plan.modules : grant.modules })} />
            <span>Ikuti default paket <b>{plan.name}</b> ({plan.modules.length} modul)</span>
          </label>
          <label className="row" style={{ flexWrap: 'nowrap' }}>
            <span className="small muted nowrap">Kuota pengguna aktif</span>
            <input type="number" min="1" style={{ width: 110 }} placeholder={plan.maxUsers ? `default ${plan.maxUsers}` : 'tanpa batas'} value={grant.maxUsers} onChange={(e) => setGrant({ ...grant, maxUsers: e.target.value })} />
          </label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Modul yang tidak di-grant akan terkunci di portal tenant dan ditolak oleh API. Data yang sudah ada tetap tersimpan.</p>
        <div className="grid-2">
          {Object.entries(DOMAINS).map(([key, d]) => {
            const all = d.modules.every((m) => grant.modules.includes(m));
            return (
              <div key={key} className="fw-item" style={{ display: 'block' }}>
                <label className="inline" style={{ marginBottom: 8 }}>
                  <input type="checkbox" checked={all} onChange={(e) => toggleDomain(d.modules, e.target.checked)} /><span><b>{d.name}</b></span>
                </label>
                <div className="stack" style={{ gap: 4, paddingLeft: 24 }}>
                  {d.modules.map((m) => (
                    <label key={m} className="inline small">
                      <input type="checkbox" checked={grant.modules.includes(m)} onChange={() => toggle(m)} />
                      <span><Icon name={MODULES[m]?.icon} size="sm" /> {MODULES[m]?.plural || m}{plan.modules.includes(m) ? '' : <span className="muted"> · di luar paket</span>}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="form-actions">
        <span className="small muted grow">{grant.custom ? `${grant.modules.length} modul dipilih (kustom)` : 'Mengikuti paket'}</span>
        <button className="btn" onClick={() => setGrant(null)}>Batal</button>
        <button className="btn btn-primary" onClick={onSave}>Simpan</button>
      </div>
    </Modal>
  );
}
