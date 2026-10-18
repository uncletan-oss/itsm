import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge } from '../components/format.jsx';
import Icon from '../components/Icon.jsx';
import { PageHeader, useToast } from '../components/ui.jsx';

const TYPE = { regulation: ['Regulasi', 'red'], standard: ['Standar', 'indigo'], best_practice: ['Best practice', 'teal'] };
const SEGMENTS = [
  ['implemented', 'green', 'Diterapkan'],
  ['partial', 'amber', 'Sebagian'],
  ['not_implemented', 'red', 'Belum'],
  ['not_assessed', 'gray', 'Belum dinilai'],
  ['not_applicable', 'light', 'N/A'],
];

export default function Compliance() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const load = () => api('/compliance/summary').then(setData).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = async () => {
    try {
      const r = await api('/compliance/sync', { method: 'POST' });
      toast(`${r.created} kontrol baru dibuat dari ${r.frameworks.length} framework aktif`);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  if (!data) return <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>;
  const total = data.summary.reduce((a, f) => ({ n: a.n + (f.counts.total ? 1 : 0), s: a.s + f.score }), { n: 0, s: 0 });

  return (
    <div>
      <PageHeader icon="clipboard" title="Kepatuhan & Best Practice"
        description="Skor = (diterapkan + ½ sebagian) / kontrol yang berlaku. Kontrol adalah ringkasan tingkat domain — verifikasi dengan naskah resmi regulasi."
        actions={hasRole('risk_officer', 'security_officer') && <button className="btn btn-primary" onClick={sync}><Icon name="change" size="sm" />Sinkronkan kontrol</button>} />
      <div className="kpis">
        <div className="kpi"><span className="kpi-ic"><Icon name="clipboard" /></span><span><div className="kpi-value">{data.summary.length}</div><div className="kpi-label">Framework aktif ({data.industry})</div></span></div>
        <div className="kpi tone-gold"><span className="kpi-ic"><Icon name="chart" /></span><span><div className="kpi-value">{total.n ? Math.round(total.s / total.n) : 0}%</div><div className="kpi-label">Rata-rata skor kepatuhan</div></span></div>
      </div>
      <div className="compliance-grid">
        {data.summary.map((f) => (
          <Link key={f.id} to={`/m/controls?frameworkId=${f.id}`} className="card compliance-card">
            <div className="row between">
              <Badge tone={TYPE[f.type]?.[1]}>{TYPE[f.type]?.[0]}</Badge>
              <span className="score">{f.counts.total ? `${f.score}%` : '—'}</span>
            </div>
            <h3 style={{ margin: 0 }}>{f.name}</h3>
            <div className="muted small">{f.issuer} · {f.counts.total} kontrol</div>
            {f.note && <div className="small note">{f.note}</div>}
            <div className="stack-bar">
              {SEGMENTS.map(([k, tone]) => (f.counts[k] ? <span key={k} className={`seg-${tone}`} style={{ flex: f.counts[k] }} title={`${k}: ${f.counts[k]}`} /> : null))}
            </div>
            <div className="legend small">
              {SEGMENTS.filter(([k]) => f.counts[k]).map(([k, tone, l]) => <span key={k}><i className={`dot seg-${tone}`} />{l} {f.counts[k]}</span>)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
