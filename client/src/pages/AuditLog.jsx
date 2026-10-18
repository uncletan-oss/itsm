import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { fmtDateTime } from '../components/format.jsx';

export default function AuditLog() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({ items: [], total: 0 });
  const [error, setError] = useState('');
  const query = Object.fromEntries(params.entries());
  useEffect(() => {
    api('/audit-logs', { query: { limit: 200, ...query } }).then(setData).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()]);
  const set = (k, v) => {
    const n = new URLSearchParams(params);
    v ? n.set(k, v) : n.delete(k);
    setParams(n);
  };

  return (
    <div>
      <h1>🧾 Audit Log</h1>
      <p className="muted">Jejak audit append-only atas seluruh perubahan data, transisi status, persetujuan dan login (akuntabilitas & non-repudiation).</p>
      <div className="toolbar">
        <input placeholder="resource (mis. changes)" defaultValue={query.resource || ''} onKeyDown={(e) => e.key === 'Enter' && set('resource', e.target.value)} />
        <select value={query.action || ''} onChange={(e) => set('action', e.target.value)}>
          <option value="">Semua aksi</option>
          {['create', 'update', 'delete', 'transition', 'approval', 'login', 'login_failed', 'sync_controls', 'change_password'].map((a) => <option key={a}>{a}</option>)}
        </select>
        {query.recordId && <span className="chip">record {query.recordId.slice(-6)} <button onClick={() => set('recordId', '')}>×</button></span>}
        <span className="muted">{data.total} entri</span>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Resource</th><th>Record</th><th>Perubahan</th><th>IP</th></tr></thead>
          <tbody>
            {data.items.map((a) => (
              <tr key={a._id}>
                <td className="small nowrap">{fmtDateTime(a.at)}</td>
                <td>{a.actorName || '—'}</td>
                <td><code>{a.action}</code></td>
                <td>{a.resource}</td>
                <td>{a.recordNumber}</td>
                <td className="small"><code className="changes">{a.changes ? JSON.stringify(a.changes) : ''}</code></td>
                <td className="small">{a.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
