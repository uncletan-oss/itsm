import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { MODULES } from '../config/modules.js';
import { STATUS_LABELS } from '../config/labels.js';
import { FormatValue } from './format.jsx';

const WORKFLOW_STATUSES = {
  incidents: 'new,assigned,in_progress,pending,resolved,closed,cancelled',
  requests: 'submitted,pending_approval,approved,rejected,fulfilling,fulfilled,closed,cancelled',
  problems: 'new,investigating,known_error,resolved,closed',
  changes: 'draft,submitted,assessment,cab_review,approved,rejected,scheduled,implementing,review,closed,cancelled',
  knowledge: 'draft,review,published,retired',
  risks: 'identified,assessed,treating,monitoring,closed',
  projects: 'initiating,planning,executing,monitoring,closing,closed,on_hold,cancelled',
  sprints: 'planned,active,completed',
};
const OPEN_PRESET = {
  incidents: 'new,assigned,in_progress,pending',
  requests: 'submitted,pending_approval,approved,fulfilling',
  problems: 'new,investigating,known_error',
};

export function statusOptions(resource) {
  const wf = WORKFLOW_STATUSES[resource];
  if (wf) return wf.split(',').map((s) => [s, STATUS_LABELS[s] || s]);
  return MODULES[resource].fields.find((f) => f.key === 'status')?.options || null;
}

const colLabel = (mod, key) =>
  ({ number: 'Nomor', status: 'Status', slaStatus: 'SLA', createdAt: 'Dibuat', updatedAt: 'Diubah' })[key] ||
  mod.fields.find((f) => f.key === key)?.label.replace(/\s*\(.*\)$/, '') ||
  key;

export default function ResourceList() {
  const { resource } = useParams();
  const mod = MODULES[resource];
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({ items: [], total: 0 });
  const [error, setError] = useState('');
  const [view, setView] = useState('table');
  const q = params.get('q') || '';
  const status = params.get('status') || '';
  const page = Number(params.get('page') || 1);
  const extra = Object.fromEntries([...params.entries()].filter(([k]) => !['q', 'status', 'page'].includes(k)));

  const load = useCallback(() => {
    setError('');
    api(`/${resource}`, { query: { q, status, page, limit: view === 'board' ? 200 : 25, ...extra } })
      .then(setData)
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, q, status, page, view, params.toString()]);
  useEffect(load, [load]);
  useEffect(() => setView('table'), [resource]);

  if (!mod) return <div className="card">Modul tidak ditemukan</div>;
  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    v ? next.set(k, v) : next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };
  const canCreate = mod.create?.includes('*') || hasRole(mod.write);
  const opts = statusOptions(resource);
  const pages = Math.max(1, Math.ceil(data.total / 25));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{mod.icon} {mod.plural}</h1>
          <p className="muted">{mod.description}</p>
        </div>
        <div className="row">
          {mod.board && (
            <button className="btn" onClick={() => setView(view === 'board' ? 'table' : 'board')}>
              {view === 'board' ? '☰ Tabel' : '▦ Board'}
            </button>
          )}
          {canCreate && <Link className="btn btn-primary" to={`/m/${resource}/new`}>+ {mod.label} baru</Link>}
        </div>
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Cari…" defaultValue={q} onKeyDown={(e) => e.key === 'Enter' && setParam('q', e.target.value)} />
        {opts && (
          <select value={status} onChange={(e) => setParam('status', e.target.value)}>
            <option value="">Semua status</option>
            {OPEN_PRESET[resource] && <option value={OPEN_PRESET[resource]}>Masih terbuka</option>}
            {opts.filter(([k]) => k).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        )}
        {Object.entries(extra).map(([k, v]) => (
          <span key={k} className="chip">{k}={v} <button onClick={() => setParam(k, '')}>×</button></span>
        ))}
        <span className="muted">{data.total} data</span>
      </div>
      {error && <div className="alert">{error}</div>}

      {view === 'board' ? (
        <Board resource={resource} mod={mod} items={data.items} reload={load} canEdit={hasRole(mod.write)} />
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>{mod.columns.map((c) => <th key={c}>{colLabel(mod, c)}</th>)}</tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it._id} className="clickable" onClick={() => navigate(`/m/${resource}/${it._id}`)}>
                  {mod.columns.map((c) => (
                    <td key={c}><FormatValue name={c} value={it[c]} field={mod.fields.find((f) => f.key === c)} /></td>
                  ))}
                </tr>
              ))}
              {!data.items.length && (
                <tr><td colSpan={mod.columns.length} className="muted center">Belum ada data</td></tr>
              )}
            </tbody>
          </table>
          {pages > 1 && (
            <div className="pager">
              <button className="btn" disabled={page <= 1} onClick={() => setParam('page', page - 1)}>‹</button>
              <span>Hal. {page} / {pages}</span>
              <button className="btn" disabled={page >= pages} onClick={() => setParam('page', page + 1)}>›</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Board({ resource, mod, items, reload, canEdit }) {
  const cols = mod.fields.find((f) => f.key === 'status').options;
  const move = async (it, to) => {
    await api(`/${resource}/${it._id}`, { method: 'PUT', body: { status: to } });
    reload();
  };
  return (
    <div className="board">
      {cols.map(([k, l], idx) => {
        const list = items.filter((i) => i.status === k);
        const pts = list.reduce((s, i) => s + (i.storyPoints || 0), 0);
        return (
          <div key={k} className="board-col">
            <div className="board-head">{l} <span className="muted">{list.length} · {pts} pts</span></div>
            {list.map((it) => (
              <div key={it._id} className="board-card">
                <Link to={`/m/${resource}/${it._id}`}>{it.number}</Link> <span className="muted">{it.itemType}</span>
                <div>{it.title}</div>
                <div className="row small">
                  {it.storyPoints != null && <span className="badge badge-indigo">{it.storyPoints} pts</span>}
                  {it.assignee && <span className="muted">{it.assignee.name}</span>}
                  {canEdit && (
                    <span className="board-moves">
                      {idx > 0 && <button onClick={() => move(it, cols[idx - 1][0])}>←</button>}
                      {idx < cols.length - 1 && <button onClick={() => move(it, cols[idx + 1][0])}>→</button>}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
