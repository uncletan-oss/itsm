import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, fmtDateTime } from '../components/format.jsx';
import Icon from '../components/Icon.jsx';
import { Modal, PageHeader, initials, useToast } from '../components/ui.jsx';
import Field from '../components/Field.jsx';

const EMPTY = { name: '', email: '', password: '', department: '', roles: ['requester'], active: true };

export default function Users() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [roles, setRoles] = useState({});
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('internal');
  const load = () => api('/users', { query: { active: 'all', kind: 'all' } }).then(setData);
  useEffect(() => {
    load();
    api('/users/roles').then(setRoles);
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const body = { ...form };
      if (!body.password) delete body.password;
      if (form._id) await api(`/users/${form._id}`, { method: 'PUT', body });
      else await api('/users', { method: 'POST', body });
      toast(form._id ? 'Pengguna diperbarui' : 'Pengguna ditambahkan');
      setForm(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };
  const toggleRole = (r) => setForm({ ...form, roles: form.roles.includes(r) ? form.roles.filter((x) => x !== r) : [...form.roles, r] });
  const isSup = (u) => u.roles.includes('supplier');
  const items = (data?.items || []).filter((u) => (kind === 'supplier') === isSup(u)).filter((u) => !q || `${u.name} ${u.email} ${u.department}`.toLowerCase().includes(q.toLowerCase()));
  const supplierForm = form?.roles.includes('supplier');

  return (
    <div>
      <PageHeader icon="users" title="Pengguna" description="Kelola akun dan peran di workspace ini. Terapkan least privilege & segregation of duties."
        actions={<button className="btn btn-primary" onClick={() => { setError(''); setForm({ ...EMPTY }); }}><Icon name="plus" size="sm" />Pengguna baru</button>} />
      {data && (
        <div className="kpis">
          <div className="kpi"><span className="kpi-ic"><Icon name="users" /></span><span><div className="kpi-value">{data.used}{data.limit ? ` / ${data.limit}` : ''}</div><div className="kpi-label">Pengguna aktif {data.limit ? '(batas paket)' : '(tanpa batas)'}</div></span></div>
        </div>
      )}
      <div className="card flush">
        <div className="toolbar">
          <label className="search"><Icon name="search" size="sm" /><input placeholder="Cari nama, email, departemen…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <button className={`chip-btn ${kind === 'internal' ? 'active' : ''}`} onClick={() => setKind('internal')}>Pengguna internal</button>
          <button className={`chip-btn ${kind === 'supplier' ? 'active' : ''}`} onClick={() => setKind('supplier')}>Akun penyedia ({(data?.items || []).filter(isSup).length})</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nama</th><th>Departemen</th><th>Peran</th><th>Status</th><th>Login terakhir</th></tr></thead>
            <tbody>
              {items.map((u) => (
                <tr key={u._id} className="clickable" onClick={() => { setError(''); setForm({ ...u, password: '' }); }}>
                  <td><span className="row" style={{ flexWrap: 'nowrap' }}><span className="avatar">{initials(u.name)}</span><span><b>{u.name}</b><div className="small muted">{u.email}</div></span></span></td>
                  <td>{isSup(u) ? <span className="small">{u.title || 'Penyedia'}</span> : u.department}</td>
                  <td>{u.roles.map((r) => <Badge key={r} tone={r === 'admin' ? 'gold' : 'indigo'}>{roles[r] || r}</Badge>)}</td>
                  <td>{u.active ? <Badge tone="green">Aktif</Badge> : <Badge tone="gray">Nonaktif</Badge>}</td>
                  <td className="small">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {form && (
        <Modal title={form._id ? `Ubah ${form.name}` : 'Pengguna baru'} onClose={() => setForm(null)} width={720}>
          <form onSubmit={save}>
            <div className="modal-body">
              {error && <div className="alert">{error}</div>}
              <div className="form-grid">
                <label><span>Nama</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <label><span>Email</span><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                <label><span>Departemen</span><input value={form.department || ''} onChange={(e) => setForm({ ...form, department: e.target.value })} /></label>
                <label><span>{form._id ? 'Password baru (opsional)' : 'Password (min. 8)'}</span><input type="password" value={form.password || ''} required={!form._id} minLength={8} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
                <label className="inline"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /><span>Akun aktif</span></label>
                <div className="full row">
                  <span className="label" style={{ margin: 0 }}>Jenis akun</span>
                  <button type="button" className={`chip-btn ${!supplierForm ? 'active' : ''}`} onClick={() => setForm({ ...form, roles: ['requester'], vendor: null })}>Internal</button>
                  <button type="button" className={`chip-btn ${supplierForm ? 'active' : ''}`} onClick={() => setForm({ ...form, roles: ['supplier'] })}>Penyedia (portal vendor)</button>
                </div>
                {supplierForm ? (
                  <label className="full"><span>Vendor *</span><Field field={{ type: 'ref', resource: 'vendors', labelField: 'name' }} value={form.vendor} onChange={(v) => setForm({ ...form, vendor: v })} />
                    <span className="hint">Akun penyedia hanya dapat mengakses portal penyedia (undangan, penawaran, PO, tagihan milik vendor ini) dan tidak memakai kuota pengguna.</span></label>
                ) : (
                <div className="full">
                  <span className="label">Peran</span>
                  <div className="role-grid">
                    {Object.entries(roles).filter(([k]) => k !== 'supplier').map(([k, l]) => (
                      <label key={k} className="inline small fw-item"><input type="checkbox" checked={form.roles.includes(k)} onChange={() => toggleRole(k)} /><span>{l}</span></label>
                    ))}
                  </div>
                </div>
                )}
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setForm(null)}>Batal</button>
              <button className="btn btn-primary">Simpan</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
