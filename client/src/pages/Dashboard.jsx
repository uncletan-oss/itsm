import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PRIORITY_LABELS, STATUS_LABELS } from '../config/labels.js';
import { FormatValue, fmtDateTime } from '../components/format.jsx';
import { Donut, HBars, Gauge } from '../components/charts.jsx';
import Icon from '../components/Icon.jsx';
import { Empty } from '../components/ui.jsx';

export const Kpi = ({ icon, label, value, to, tone }) => {
  const body = (
    <>
      <span className="kpi-ic"><Icon name={icon} /></span>
      <span><div className="kpi-value">{value ?? '—'}</div><div className="kpi-label">{label}</div></span>
    </>
  );
  return to ? <Link to={to} className={`kpi ${tone ? `tone-${tone}` : ''}`}>{body}</Link> : <div className={`kpi ${tone ? `tone-${tone}` : ''}`}>{body}</div>;
};

const sum = (o, keys) => keys.reduce((s, k) => s + (o?.[k] || 0), 0);
const PRIO_COLORS = { 1: 'var(--red)', 2: 'var(--orange)', 3: 'var(--amber)', 4: 'var(--green)' };
const greet = () => {
  const h = new Date().getHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam';
};

export default function Dashboard() {
  const { user, tenant, can } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/dashboard').then(setD).catch((e) => setError(e.message)); }, []);
  if (error) return <div className="alert">{error}</div>;
  if (!d) return <div className="kpis">{Array.from({ length: 4 }, (_, i) => <div key={i} className="kpi"><div className="skeleton" style={{ width: '100%', height: 40 }} /></div>)}</div>;

  const first = user.name.split(' ')[0];
  if (d.role === 'requester') {
    return (
      <div>
        <div className="welcome">
          <div><h1>{greet()}, {first}</h1><p>Ada kendala TI hari ini? Kami siap membantu.</p></div>
          <div className="row"><Link className="btn btn-accent" to="/m/incidents/new">Laporkan gangguan</Link><Link className="btn" to="/portal">Portal layanan</Link></div>
        </div>
        <div className="kpis">
          <Kpi icon="alert" label="Incident saya (terbuka)" value={sum(d.incidents.byStatus, ['new', 'assigned', 'in_progress', 'pending'])} to="/m/incidents" />
          <Kpi icon="request" label="Permintaan saya (terbuka)" value={sum(d.requests.byStatus, ['submitted', 'pending_approval', 'approved', 'fulfilling'])} to="/m/requests" />
          <Kpi icon="check" tone="green" label="Menunggu konfirmasi Anda" value={sum(d.incidents.byStatus, ['resolved']) + sum(d.requests.byStatus, ['fulfilled'])} to="/my-work" />
        </div>
      </div>
    );
  }

  const inc = d.incidents;
  const v = new Set(d.visible || []);
  const openInc = sum(inc.byStatus, ['new', 'assigned', 'in_progress', 'pending']);
  return (
    <div>
      <div className="welcome">
        <div>
          <h1>{greet()}, {first}</h1>
          <p>Ringkasan operasional {tenant?.name} · {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="row">
          <Link className="btn btn-accent" to="/my-work"><Icon name="inbox" size="sm" />Pekerjaan saya</Link>
          {can('incidents', 'create') && <Link className="btn" to="/m/incidents/new"><Icon name="plus" size="sm" />Incident baru</Link>}
        </div>
      </div>

      <div className="kpis">
        {v.has('incidents') && <Kpi icon="alert" label="Incident terbuka" value={openInc} to="/m/incidents?status=new,assigned,in_progress,pending" />}
        {v.has('incidents') && <Kpi icon="zap" tone={inc.majorOpen ? 'red' : ''} label="Major incident aktif" value={inc.majorOpen} to="/m/incidents?majorIncident=true" />}
        {v.has('incidents') && <Kpi icon="clock" tone={inc.openBreached ? 'red' : 'green'} label="Melewati SLA (terbuka)" value={inc.openBreached} />}
        {v.has('incidents') && <Kpi icon="shield" tone={inc.regulatoryPending ? 'red' : ''} label="Belum dilaporkan ke regulator" value={inc.regulatoryPending} to="/m/incidents?regulatoryReportable=true" />}
        {v.has('changes') && <Kpi icon="change" tone={d.changes.byStatus?.cab_review ? 'gold' : ''} label="Change menunggu CAB" value={d.changes.byStatus?.cab_review || 0} to="/m/changes?status=cab_review" />}
        {v.has('assets') && <Kpi icon="box" tone={d.assets.licensesExpiring30d ? 'amber' : ''} label="Lisensi berakhir ≤ 30 hari" value={d.assets.licensesExpiring30d} to="/m/assets?category=license" />}
        {v.has('vendors') && <Kpi icon="briefcase" tone={d.vendors.contractsEnding90d ? 'amber' : ''} label="Kontrak vendor berakhir ≤ 90 hari" value={d.vendors.contractsEnding90d} to="/m/vendors" />}
        {v.has('continuity') && <Kpi icon="lifebuoy" tone={d.continuity.testOverdue ? 'red' : 'green'} label="Uji DRP terlambat" value={d.continuity.testOverdue} to="/m/continuity" />}
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        {v.has('incidents') && (
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div className="row between"><h3>Incident prioritas tertinggi</h3><Link className="small" to="/m/incidents?status=new,assigned,in_progress,pending">Lihat semua</Link></div>
            {inc.recent.map((i) => (
              <Link key={i._id} to={`/m/incidents/${i._id}`} className="list-row">
                <FormatValue name="priority" value={i.priority} />
                <span className="grow"><span className="list-title">{i.title}</span><div className="list-meta"><span className="mono">{i.number}</span> · {i.assignee?.name || 'belum ditugaskan'}</div></span>
                <FormatValue name="status" value={i.status} />
              </Link>
            ))}
            {!inc.recent.length && <Empty icon="check" title="Tidak ada incident terbuka" />}
          </div>
        )}
        {v.has('incidents') && (
          <div className="card">
            <h3>Kesehatan layanan</h3>
            <div className="row" style={{ justifyContent: 'space-around', marginTop: 8 }}>
              <Gauge value={inc.slaCompliance30d} label="Kepatuhan SLA 30 hari" />
              <Gauge value={openInc ? Math.round(((openInc - inc.openBreached) / openInc) * 100) : 100} label="Tiket terbuka dalam SLA" />
            </div>
            <p className="small muted center" style={{ marginBottom: 0 }}>{inc.resolved30d} incident diselesaikan dalam 30 hari terakhir</p>
          </div>
        )}
      </div>

      <div className="grid-3">
        {v.has('incidents') && <div className="card"><h3>Incident terbuka per prioritas</h3><Donut data={inc.openByPriority} labels={PRIORITY_LABELS} colors={PRIO_COLORS} /></div>}
        {v.has('changes') && (
          <div className="card">
            <h3>Change mendatang</h3>
            {d.changes.upcoming.map((c) => (
              <Link key={c._id} to={`/m/changes/${c._id}`} className="list-row">
                <Icon name="calendar" size="sm" />
                <span className="grow"><span className="list-title">{c.title}</span><div className="list-meta">{fmtDateTime(c.plannedStart)} · {c.type}</div></span>
                <FormatValue name="risk" value={c.risk} />
              </Link>
            ))}
            {!d.changes.upcoming.length && <p className="muted small">Belum ada change terjadwal.</p>}
          </div>
        )}
        {v.has('risks') && <div className="card"><h3>Risiko terbuka (inheren)</h3><Donut data={d.risks.openByLevel} labels={{ critical: 'Kritis', high: 'Tinggi', medium: 'Sedang', low: 'Rendah' }} colors={{ critical: 'var(--red)', high: 'var(--orange)', medium: 'var(--amber)', low: 'var(--green)' }} /></div>}
        {v.has('changes') && <div className="card"><h3>Status change</h3><HBars data={d.changes.byStatus} labels={STATUS_LABELS} to={(k) => `/m/changes?status=${k}`} /></div>}
        {v.has('requests') && <div className="card"><h3>Service request</h3><HBars data={d.requests.byStatus} labels={STATUS_LABELS} to={(k) => `/m/requests?status=${k}`} color="var(--chart-3)" /></div>}
        {v.has('problems') && <div className="card"><h3>Problem</h3><HBars data={d.problems.byStatus} labels={STATUS_LABELS} to={(k) => `/m/problems?status=${k}`} color="var(--chart-2)" /></div>}
        {v.has('projects') && <div className="card"><h3>Kesehatan proyek aktif</h3><Donut data={d.projects.byHealth} labels={{ green: 'Hijau', amber: 'Kuning', red: 'Merah' }} colors={{ green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)' }} /></div>}
      </div>
    </div>
  );
}
