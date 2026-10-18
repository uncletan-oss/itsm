import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { MODULES } from '../config/modules.js';
import { FormatValue, fmtDateTime } from '../components/format.jsx';
import Icon from '../components/Icon.jsx';
import { Empty, PageHeader, Tabs } from '../components/ui.jsx';

function Row({ it }) {
  const mod = MODULES[it.resource];
  return (
    <Link to={`/m/${it.resource}/${it._id}`} className="list-row">
      <span className="kpi-ic" style={{ width: 34, height: 34 }}><Icon name={mod?.icon} size="sm" /></span>
      <span className="grow">
        <span className="list-title">{it.title}</span>
        <div className="list-meta"><span className="mono">{it.number}</span> · {mod?.label} · dibuat {fmtDateTime(it.createdAt)}{it.plannedStart && ` · jadwal ${fmtDateTime(it.plannedStart)}`}</div>
      </span>
      {it.kind && <span className="badge badge-gold plain">{it.kind}</span>}
      {it.needsConfirmation && <span className="badge badge-green plain">Konfirmasi penyelesaian</span>}
      {typeof it.priority === 'number' && <FormatValue name="priority" value={it.priority} />}
      {it.sla?.resolutionDue && <span className="small muted nowrap hide-sm">SLA {fmtDateTime(it.sla.resolutionDue)}</span>}
      <FormatValue name="status" value={it.status} />
    </Link>
  );
}

export default function MyWork() {
  const [w, setW] = useState(null);
  const [tab, setTab] = useState(null);
  useEffect(() => { api('/my-work').then((r) => { setW(r); setTab(r.approvals.length && !r.assigned.length ? 'approvals' : r.assigned.length ? 'assigned' : 'requested'); }); }, []);
  if (!w) return <div className="card"><div className="skeleton" /><br /><div className="skeleton" style={{ width: '60%' }} /></div>;
  const lists = { assigned: w.assigned, approvals: w.approvals, requested: w.requested };
  const EMPTY = {
    assigned: ['Tidak ada pekerjaan yang ditugaskan', 'Tiket, problem, change, backlog, dan risiko yang ditugaskan kepada Anda akan muncul di sini.'],
    approvals: ['Tidak ada yang menunggu persetujuan Anda', 'Persetujuan CAB, permintaan layanan, dan review artikel akan muncul di sini.'],
    requested: ['Tidak ada tiket yang Anda ajukan', 'Incident dan permintaan yang Anda ajukan akan dipantau di sini.'],
  };
  return (
    <div>
      <PageHeader icon="inbox" title="Pekerjaan Saya" description="Satu antrean untuk semua yang membutuhkan tindakan Anda, diurutkan berdasarkan prioritas." />
      <Tabs value={tab} onChange={setTab} tabs={[['assigned', 'Ditugaskan ke saya', w.assigned.length], ['approvals', 'Menunggu persetujuan saya', w.approvals.length], ['requested', 'Yang saya ajukan', w.requested.length]]} />
      <div className="card">
        {lists[tab]?.map((it) => <Row key={`${it.resource}-${it._id}`} it={it} />)}
        {!lists[tab]?.length && <Empty icon="check" title={EMPTY[tab]?.[0]}>{EMPTY[tab]?.[1]}</Empty>}
      </div>
    </div>
  );
}
