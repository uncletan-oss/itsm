import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge } from '../components/format.jsx';

const TYPE = { regulation: ['Regulasi', 'red'], standard: ['Standar', 'indigo'], best_practice: ['Best Practice', 'teal'] };
const SEGMENTS = [
  ['implemented', 'green', 'Diterapkan'],
  ['partial', 'amber', 'Sebagian'],
  ['not_implemented', 'red', 'Belum'],
  ['not_assessed', 'gray', 'Belum dinilai'],
  ['not_applicable', 'light', 'N/A'],
];

export default function Compliance() {
  const { hasRole } = useAuth();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const load = () => api('/compliance/summary').then(setData).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const sync = async () => {
    try {
      const r = await api('/compliance/sync', { method: 'POST' });
      setMsg(`${r.created} kontrol baru dibuat dari ${r.frameworks.length} framework aktif.`);
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };

  if (!data) return <div className="muted">Memuat…</div>;
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>📋 Kepatuhan & Best Practice</h1>
          <p className="muted">
            Framework aktif untuk industri <b>{data.industry}</b>. Skor = (diterapkan + ½ sebagian) / kontrol yang berlaku.
            Kontrol merupakan ringkasan tingkat domain — verifikasi dengan naskah resmi regulasi.
          </p>
        </div>
        {hasRole('risk_officer', 'security_officer') && <button className="btn btn-primary" onClick={sync}>⟳ Sinkronkan kontrol</button>}
      </div>
      {msg && <div className="alert info">{msg}</div>}
      <div className="compliance-grid">
        {data.summary.map((f) => (
          <Link key={f.id} to={`/m/controls?frameworkId=${f.id}`} className="card compliance-card">
            <div className="row between">
              <Badge tone={TYPE[f.type]?.[1]}>{TYPE[f.type]?.[0]}</Badge>
              <span className="score">{f.counts.total ? `${f.score}%` : '—'}</span>
            </div>
            <h3>{f.name}</h3>
            <div className="muted small">{f.issuer} · {f.counts.total} kontrol</div>
            {f.note && <div className="small note">{f.note}</div>}
            <div className="stack-bar">
              {SEGMENTS.map(([k, tone]) => f.counts[k] ? <span key={k} className={`seg seg-${tone}`} style={{ flex: f.counts[k] }} title={`${k}: ${f.counts[k]}`} /> : null)}
            </div>
            <div className="legend small">
              {SEGMENTS.filter(([k]) => f.counts[k]).map(([k, tone, l]) => <span key={k}><i className={`dot seg-${tone}`} />{l} {f.counts[k]}</span>)}
            </div>
            {!f.counts.total && <div className="muted small">Belum ada kontrol — klik “Sinkronkan kontrol”.</div>}
          </Link>
        ))}
      </div>
    </div>
  );
}
