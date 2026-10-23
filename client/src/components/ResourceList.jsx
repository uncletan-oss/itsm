import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { MODULES } from '../config/modules.js';
import { MODULE_DEFS, LEGACY_STATUS } from '../../../shared/modules.mjs';
import { STATUS_LABELS, PRIORITY_LABELS } from '../config/labels.js';
import { FormatValue, refLabel, fmtDate, fmtDateTime } from './format.jsx';
import Icon from './Icon.jsx';
import { Empty, PageHeader, SkeletonRows, useToast } from './ui.jsx';
import { WorkflowButton } from './Workflow.jsx';

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
  changes: 'draft,submitted,assessment,cab_review,approved,scheduled,implementing,review',
};

export function statusOptions(resource) {
  const spec = MODULE_DEFS[resource]?.workflow;
  if (spec) return [...new Set([...Object.keys(spec.transitions), ...Object.values(spec.transitions).flat()])].map((st) => [st, STATUS_LABELS[st] || st]);
  if (LEGACY_STATUS[resource]) return LEGACY_STATUS[resource].map((st) => [st, STATUS_LABELS[st] || st]);
  const wf = WORKFLOW_STATUSES[resource];
  if (wf) return wf.split(',').map((s) => [s, STATUS_LABELS[s] || s]);
  return MODULES[resource].fields.find((f) => f.key === 'status')?.options || null;
}

const colLabel = (mod, key) =>
  ({ number: 'Nomor', status: 'Status', slaStatus: 'SLA', createdAt: 'Dibuat', updatedAt: 'Diubah' })[key] ||
  mod.fields.find((f) => f.key === key)?.label.replace(/\s*\(.*\)$/, '') ||
  key;

/** Nilai teks untuk ekspor CSV. */
function csvValue(field, v) {
  if (v == null || v === '') return '';
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? refLabel(x) : x)).join('; ');
  if (typeof v === 'object') return refLabel(v);
  if (field?.key === 'status') return STATUS_LABELS[v] || v;
  if (field?.key === 'priority' && typeof v === 'number') return PRIORITY_LABELS[v];
  if (field?.type === 'date') return fmtDate(v);
  if (field?.type === 'datetime') return fmtDateTime(v);
  if (field?.options) return field.options.find(([k]) => String(k) === String(v))?.[1] ?? v;
  return v;
}

async function exportCsv(resource, mod, query) {
  const rows = [];
  for (let page = 1; page <= 10; page += 1) {
    const r = await api(`/${resource}`, { query: { ...query, page, limit: 200 } });
    rows.push(...r.items);
    if (rows.length >= r.total) break;
  }
  const fields = [{ key: 'number', label: 'Nomor' }, { key: 'status', label: 'Status' }, ...mod.fields.filter((f) => f.key !== 'status'), { key: 'createdAt', label: 'Dibuat', type: 'datetime' }];
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [fields.map((f) => esc(f.label)).join(','), ...rows.map((it) => fields.map((f) => esc(csvValue(f, it[f.key]))).join(','))];
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${resource}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  return rows.length;
}

export default function ResourceList() {
  const { resource } = useParams();
  const mod = MODULES[resource];
  const navigate = useNavigate();
  const { can, enabled, hasRole } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('table');
  const q = params.get('q') || '';
  const status = params.get('status') || '';
  const page = Number(params.get('page') || 1);
  const extra = Object.fromEntries([...params.entries()].filter(([k]) => !['q', 'status', 'page'].includes(k)));

  const load = useCallback(() => {
    if (!mod || !can(resource)) return;
    setError('');
    api(`/${resource}`, { query: { q, status, page, limit: view === 'board' ? 200 : 25, ...extra } })
      .then(setData)
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, q, status, page, view, params.toString()]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => setView('table'), [resource]);

  if (!mod) return <Empty icon="alert" title="Modul tidak ditemukan" />;
  if (!enabled(resource)) {
    return (
      <div className="card">
        <Empty icon="lock" title={`${mod.plural} tidak termasuk paket langganan Anda`} action={hasRole('admin') && <Link className="btn btn-primary" to="/settings">Lihat paket & upgrade</Link>}>
          Modul ini tersedia pada paket yang lebih tinggi.
        </Empty>
      </div>
    );
  }
  if (!can(resource)) return <div className="card"><Empty icon="lock" title="Anda tidak memiliki akses ke modul ini">Hubungi admin workspace untuk menyesuaikan peran Anda.</Empty></div>;

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    v ? next.set(k, v) : next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };
  const canCreate = can(resource, 'create');
  const opts = statusOptions(resource);
  const pages = data ? Math.max(1, Math.ceil(data.total / 25)) : 1;
  const doExport = async () => {
    try {
      const n = await exportCsv(resource, mod, { q, status, ...extra });
      toast(`${n} baris diekspor ke CSV`);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div>
      <PageHeader
        icon={mod.icon}
        title={mod.plural}
        description={mod.description}
        actions={<>
          {mod.board && <button className="btn" onClick={() => setView(view === 'board' ? 'table' : 'board')}><Icon name={view === 'board' ? 'list' : 'kanban'} size="sm" />{view === 'board' ? 'Tabel' : 'Board'}</button>}
          <WorkflowButton resource={resource} />
          <button className="btn" onClick={doExport}><Icon name="download" size="sm" />Ekspor CSV</button>
          {canCreate && <Link className="btn btn-primary" to={`/m/${resource}/new`}><Icon name="plus" size="sm" />{mod.label} baru</Link>}
        </>}
      />
      {error && <div className="alert"><Icon name="alert" size="sm" />{error}</div>}

      <div className="card flush">
        <div className="toolbar">
          <label className="search">
            <Icon name="search" size="sm" />
            <input type="search" placeholder={`Cari ${mod.plural.toLowerCase()}…`} defaultValue={q} key={q} onKeyDown={(e) => e.key === 'Enter' && setParam('q', e.target.value)} aria-label="Cari" />
          </label>
          {opts && (
            <select value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Filter status">
              <option value="">Semua status</option>
              {OPEN_PRESET[resource] && <option value={OPEN_PRESET[resource]}>Masih terbuka</option>}
              {opts.filter(([k]) => k).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          )}
          {Object.entries(extra).map(([k, v]) => (
            <span key={k} className="chip"><Icon name="filter" size="sm" />{colLabel(mod, k)}: {v} <button onClick={() => setParam(k, '')} aria-label="Hapus filter">×</button></span>
          ))}
          <span className="muted small" style={{ marginLeft: 'auto' }}>{data ? `${data.total} data` : ''}</span>
        </div>

        {view === 'board' ? (
          <div className="card-body"><Board resource={resource} mod={mod} items={data?.items || []} reload={load} canEdit={can(resource, 'write')} /></div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>{mod.columns.map((c) => <th key={c}>{colLabel(mod, c)}</th>)}</tr>
                </thead>
                {!data ? <SkeletonRows cols={mod.columns.length} /> : (
                  <tbody>
                    {data.items.map((it) => (
                      <tr key={it._id} className="clickable" onClick={() => navigate(`/m/${resource}/${it._id}`)}>
                        {mod.columns.map((c) => (
                          <td key={c} className={c === 'number' ? 'mono nowrap' : ''}>
                            {c === mod.titleField ? <b style={{ fontWeight: 600 }}>{it[c]}</b> : <FormatValue name={c} value={it[c]} field={mod.fields.find((f) => f.key === c)} />}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
              {data && !data.items.length && (
                <Empty icon={mod.icon} title={q || status || Object.keys(extra).length ? 'Tidak ada data yang cocok' : `Belum ada ${mod.plural.toLowerCase()}`}
                  action={canCreate && !q && <Link className="btn btn-primary" to={`/m/${resource}/new`}><Icon name="plus" size="sm" />Buat {mod.label.toLowerCase()} pertama</Link>}>
                  {q || status ? 'Coba ubah kata kunci atau filter.' : null}
                </Empty>
              )}
            </div>
            {data && data.total > 25 && (
              <div className="pager">
                <span>Menampilkan {(page - 1) * 25 + 1}–{Math.min(page * 25, data.total)} dari {data.total}</span>
                <span className="row">
                  <button className="btn btn-sm" disabled={page <= 1} onClick={() => setParam('page', page - 1)}><Icon name="chevronLeft" size="sm" /></button>
                  <span>{page} / {pages}</span>
                  <button className="btn btn-sm" disabled={page >= pages} onClick={() => setParam('page', page + 1)}><Icon name="chevronRight" size="sm" /></button>
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Board({ resource, mod, items, reload, canEdit }) {
  const toast = useToast();
  const cols = mod.fields.find((f) => f.key === 'status').options;
  const move = async (it, to) => {
    try {
      await api(`/${resource}/${it._id}`, { method: 'PUT', body: { status: to } });
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
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
                <div className="row between"><Link to={`/m/${resource}/${it._id}`} className="mono small">{it.number}</Link><span className="badge badge-gray plain">{it.itemType}</span></div>
                <div style={{ margin: '6px 0', fontWeight: 600 }}>{it.title}</div>
                <div className="row small">
                  {it.storyPoints != null && <span className="badge badge-indigo plain">{it.storyPoints} pts</span>}
                  {it.assignee && <span className="muted">{it.assignee.name}</span>}
                  {canEdit && (
                    <span className="board-moves">
                      {idx > 0 && <button onClick={() => move(it, cols[idx - 1][0])} aria-label="Pindah kiri">←</button>}
                      {idx < cols.length - 1 && <button onClick={() => move(it, cols[idx + 1][0])} aria-label="Pindah kanan">→</button>}
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
