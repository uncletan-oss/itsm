import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge } from '../components/format.jsx';

const EMPTY = { name: '', email: '', password: '', department: '', roles: ['requester'], active: true };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState({});
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/users', { query: { active: 'all' } }).then((r) => setUsers(r.items));
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
      setForm(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };
  const toggleRole = (r) => setForm({ ...form, roles: form.roles.includes(r) ? form.roles.filter((x) => x !== r) : [...form.roles, r] });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>👥 Pengguna & Peran</h1>
          <p className="muted">Role-based access control. Terapkan prinsip least privilege & segregation of duties.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}>+ Pengguna baru</button>
      </div>
      {form && (
        <form className="card highlight" onSubmit={save}>
          {error && <div className="alert">{error}</div>}
          <div className="form-grid">
            <label><span>Nama</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label><span>Email</span><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label><span>Departemen</span><input value={form.department || ''} onChange={(e) => setForm({ ...form, department: e.target.value })} /></label>
            <label><span>{form._id ? 'Password baru (opsional)' : 'Password (min. 8)'}</span><input type="password" value={form.password || ''} required={!form._id} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            <label className="inline"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Aktif</label>
            <div className="full">
              <span className="label">Peran</span>
              <div className="role-grid">
                {Object.entries(roles).map(([k, l]) => (
                  <label key={k} className="inline small"><input type="checkbox" checked={form.roles.includes(k)} onChange={() => toggleRole(k)} /> {l}</label>
                ))}
              </div>
            </div>
          </div>
          <div className="row end">
            <button type="button" className="btn" onClick={() => setForm(null)}>Batal</button>
            <button className="btn btn-primary">Simpan</button>
          </div>
        </form>
      )}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Nama</th><th>Email</th><th>Departemen</th><th>Peran</th><th>Status</th><th>Login terakhir</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id} className="clickable" onClick={() => setForm({ ...u, password: '' })}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.department}</td>
                <td>{u.roles.map((r) => <Badge key={r} tone="indigo">{r}</Badge>)}</td>
                <td>{u.active ? <Badge tone="green">aktif</Badge> : <Badge tone="gray">nonaktif</Badge>}</td>
                <td className="small">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('id-ID') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
