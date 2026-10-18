import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { fmtDateTime } from '../components/format.jsx';
import Icon from '../components/Icon.jsx';
import { PageHeader, SkeletonRows } from '../components/ui.jsx';

const ACTIONS = ['create', 'update', 'delete', 'transition', 'approval', 'login', 'login_failed', 'sync_controls', 'update_access', 'change_password', 'signup'];

export default function AuditLog() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const query = Object.fromEntries(params.entries());
  useEffect(() => {
    setData(null);
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
      <PageHeader icon="scroll" title="Audit Log" description="Jejak audit append-only atas perubahan data, transisi status, persetujuan, login, dan perubahan hak akses di workspace ini." />
      {error && <div className="alert">{error}</div>}
      <div className="card flush">
        <div className="toolbar">
          <label className="search"><Icon name="filter" size="sm" /><input placeholder="resource (mis. changes)" defaultValue={query.resource || ''} onKeyDown={(e) => e.key === 'Enter' && set('resource', e.target.value)} /></label>
          <select value={query.action || ''} onChange={(e) => set('action', e.target.value)} aria-label="Aksi">
            <option value="">Semua aksi</option>
            {ACTIONS.map((a) => <option key={a}>{a}</option>)}
          </select>
          {query.recordId && <span className="chip">record …{query.recordId.slice(-6)} <button onClick={() => set('recordId', '')}>×</button></span>}
          <span className="muted small" style={{ marginLeft: 'auto' }}>{data ? `${data.total} entri` : ''}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Resource</th><th>Record</th><th>Perubahan</th></tr></thead>
            {!data ? <SkeletonRows cols={6} /> : (
              <tbody>
                {data.items.map((a) => (
                  <tr key={a._id}>
                    <td className="small nowrap">{fmtDateTime(a.at)}</td>
                    <td>{a.actorName || '—'}</td>
                    <td><span className={`badge plain ${a.action.includes('fail') || a.action === 'delete' ? 'badge-red' : a.action === 'approval' ? 'badge-green' : 'badge-gray'}`}>{a.action}</span></td>
                    <td>{a.resource}</td>
                    <td className="mono small">{a.recordNumber}</td>
                    <td className="small"><code style={{ wordBreak: 'break-all', display: 'block', maxWidth: 520 }}>{a.changes ? JSON.stringify(a.changes) : ''}</code></td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
