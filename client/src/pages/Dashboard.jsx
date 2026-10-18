import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { STATUS_LABELS, PRIORITY_LABELS } from '../config/labels.js';
import { FormatValue, fmtDateTime } from '../components/format.jsx';

const Tile = ({ label, value, to, tone }) => {
  const body = (
    <div className={`tile ${tone ? `tile-${tone}` : ''}`}>
      <div className="tile-value">{value ?? '—'}</div>
      <div className="tile-label">{label}</div>
    </div>
  );
  return to ? <Link to={to} className="tile-link">{body}</Link> : body;
};

function Bars({ title, data, labels = STATUS_LABELS, to }) {
  const entries = Object.entries(data || {}).filter(([k]) => k !== 'none');
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="card">
      <h3>{title}</h3>
      {!entries.length && <p className="muted small">Belum ada data</p>}
      {entries.map(([k, v]) => (
        <Link key={k} to={to ? to(k) : '#'} className="bar-row">
          <span className="bar-label">{labels[k] || k}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(v / max) * 100}%` }} /></span>
          <span className="bar-val">{v}</span>
        </Link>
      ))}
    </div>
  );
}

const sum = (o, keys) => keys.reduce((s, k) => s + (o?.[k] || 0), 0);

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/dashboard').then(setD).catch((e) => setError(e.message)); }, []);
  if (error) return <div className="alert">{error}</div>;
  if (!d) return <div className="muted">Memuat…</div>;

  if (d.role === 'requester') {
    return (
      <div>
        <h1>Selamat datang 👋</h1>
        <div className="tiles">
          <Tile label="Incident saya (terbuka)" value={sum(d.incidents.byStatus, ['new', 'assigned', 'in_progress', 'pending'])} to="/m/incidents" />
          <Tile label="Permintaan saya (terbuka)" value={sum(d.requests.byStatus, ['submitted', 'pending_approval', 'approved', 'fulfilling'])} to="/m/requests" />
        </div>
        <div className="row"><Link className="btn btn-primary" to="/portal">Buka Portal Layanan →</Link></div>
      </div>
    );
  }

  const inc = d.incidents;
  return (
    <div>
      <h1>Dashboard Operasional TI</h1>
      <div className="tiles">
        <Tile label="Incident terbuka" value={sum(inc.byStatus, ['new', 'assigned', 'in_progress', 'pending'])} to="/m/incidents?status=new,assigned,in_progress,pending" />
        <Tile label="Major incident aktif" value={inc.majorOpen} tone={inc.majorOpen ? 'red' : ''} to="/m/incidents?majorIncident=true" />
        <Tile label="Melewati SLA (terbuka)" value={inc.openBreached} tone={inc.openBreached ? 'red' : ''} />
        <Tile label="Kepatuhan SLA 30 hari" value={inc.slaCompliance30d == null ? '—' : `${inc.slaCompliance30d}%`} tone={inc.slaCompliance30d != null && inc.slaCompliance30d < 90 ? 'amber' : 'green'} />
        <Tile label="Belum dilaporkan ke regulator" value={inc.regulatoryPending} tone={inc.regulatoryPending ? 'red' : ''} to="/m/incidents?regulatoryReportable=true" />
        <Tile label="Change menunggu CAB" value={d.changes.byStatus?.cab_review || 0} to="/m/changes?status=cab_review" />
        <Tile label="Lisensi kedaluwarsa ≤30 hr" value={d.assets.licensesExpiring30d} tone={d.assets.licensesExpiring30d ? 'amber' : ''} to="/m/assets?category=license" />
        <Tile label="Garansi habis ≤30 hr" value={d.assets.warrantyExpiring30d} />
        <Tile label="Kontrak vendor habis ≤90 hr" value={d.vendors.contractsEnding90d} tone={d.vendors.contractsEnding90d ? 'amber' : ''} to="/m/vendors" />
        <Tile label="Uji DRP terlambat" value={d.continuity.testOverdue} tone={d.continuity.testOverdue ? 'red' : ''} to="/m/continuity" />
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Incident prioritas tertinggi</h3>
          <table>
            <tbody>
              {inc.recent.map((i) => (
                <tr key={i._id}>
                  <td><Link to={`/m/incidents/${i._id}`}>{i.number}</Link></td>
                  <td>{i.title}</td>
                  <td><FormatValue name="priority" value={i.priority} /></td>
                  <td><FormatValue name="status" value={i.status} /></td>
                  <td className="small muted">{i.assignee?.name || 'belum ditugaskan'}</td>
                </tr>
              ))}
              {!inc.recent.length && <tr><td className="muted">Tidak ada incident terbuka 🎉</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Jadwal change mendatang</h3>
          <table>
            <tbody>
              {d.changes.upcoming.map((c) => (
                <tr key={c._id}>
                  <td><Link to={`/m/changes/${c._id}`}>{c.number}</Link></td>
                  <td>{c.title}</td>
                  <td><FormatValue name="risk" value={c.risk} /></td>
                  <td className="small">{fmtDateTime(c.plannedStart)}</td>
                </tr>
              ))}
              {!d.changes.upcoming.length && <tr><td className="muted">Belum ada change terjadwal</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-3">
        <Bars title="Incident terbuka per prioritas" data={inc.openByPriority} labels={PRIORITY_LABELS} to={(k) => `/m/incidents?priority=${k}&status=new,assigned,in_progress,pending`} />
        <Bars title="Status Change" data={d.changes.byStatus} to={(k) => `/m/changes?status=${k}`} />
        <Bars title="Status Problem" data={d.problems.byStatus} to={(k) => `/m/problems?status=${k}`} />
        <Bars title="Risiko terbuka per level (inheren)" data={d.risks.openByLevel} labels={{ critical: 'Kritis', high: 'Tinggi', medium: 'Sedang', low: 'Rendah' }} to={(k) => `/m/risks?inherentLevel=${k}`} />
        <Bars title="Service Request" data={d.requests.byStatus} to={(k) => `/m/requests?status=${k}`} />
        <Bars title="Kesehatan proyek aktif" data={d.projects.byHealth} labels={{ green: 'Hijau', amber: 'Kuning', red: 'Merah' }} to={(k) => `/m/projects?health=${k}`} />
      </div>
    </div>
  );
}
