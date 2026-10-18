import { useState } from 'react';
import { Link } from 'react-router-dom';

const C = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

/** Bar horizontal berlabel — untuk distribusi kategori. */
export function HBars({ data, labels = {}, to, color }) {
  const entries = (Array.isArray(data) ? data : Object.entries(data || {})).filter(([k, v]) => k !== 'none' && v);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <p className="muted small">Belum ada data</p>;
  return entries.map(([k, v]) => {
    const body = (
      <>
        <span className="nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{labels[k] || k}</span>
        <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(v / max) * 100}%`, background: color }} /></span>
        <span className="hbar-val">{v}</span>
      </>
    );
    return to ? <Link key={k} to={to(k)} className="hbar">{body}</Link> : <div key={k} className="hbar">{body}</div>;
  });
}

/** Donut dengan total di tengah. */
export function Donut({ data, labels = {}, colors = {}, size = 132, center }) {
  const entries = Object.entries(data || {}).filter(([k, v]) => k !== 'none' && v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const r = 52;
  const circ = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox="0 0 132 132" role="img" aria-label="diagram donat">
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--gray-bg)" strokeWidth="14" />
        {entries.map(([k, v], i) => {
          const len = (v / total) * circ;
          const el = (
            <circle key={k} cx="66" cy="66" r={r} fill="none" stroke={colors[k] || C[i % C.length]} strokeWidth="14"
              strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-off} transform="rotate(-90 66 66)">
              <title>{`${labels[k] || k}: ${v}`}</title>
            </circle>
          );
          off += len;
          return el;
        })}
        <text x="66" y="62" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--text)">{center ?? total}</text>
        <text x="66" y="80" textAnchor="middle" fontSize="11" fill="var(--muted)">total</text>
      </svg>
      <div className="stack small">
        {entries.map(([k, v], i) => (
          <span key={k}><i className="dot" style={{ background: colors[k] || C[i % C.length] }} />{labels[k] || k} <b>{v}</b></span>
        ))}
        {!entries.length && <span className="muted">Belum ada data</span>}
      </div>
    </div>
  );
}

/** Grafik kolom berkelompok per tanggal (mis. incident dibuat vs selesai). */
export function ColumnChart({ rows, series, height = 200 }) {
  const [tip, setTip] = useState(null);
  const W = 640;
  const H = height;
  const pad = { l: 28, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...rows.flatMap((r) => series.map((s) => r[s.key])));
  const step = (W - pad.l - pad.r) / rows.length;
  const bw = Math.max(2, (step * 0.7) / series.length);
  const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const ticks = [0, Math.ceil(max / 2), max];
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="grafik tren">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t ? '3 3' : ''} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{t}</text>
          </g>
        ))}
        {rows.map((r, i) => (
          <g key={r.date}>
            {series.map((s, j) => (
              <rect key={s.key} x={pad.l + i * step + (step - bw * series.length) / 2 + j * bw} y={y(r[s.key])} width={bw - 1} height={H - pad.b - y(r[s.key])}
                rx="2" fill={s.color} onMouseEnter={(e) => setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, text: `${r.date.slice(5)} · ${s.label}: ${r[s.key]}` })} onMouseLeave={() => setTip(null)} />
            ))}
            {(i % Math.ceil(rows.length / 8) === 0 || i === rows.length - 1) && (
              <text x={pad.l + i * step + step / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{r.date.slice(8)}/{r.date.slice(5, 7)}</text>
            )}
          </g>
        ))}
      </svg>
      {tip && <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
      <div className="chart-legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}</div>
    </div>
  );
}

/** Meter progres melingkar kecil untuk persentase. */
export function Gauge({ value, label, tone }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const r = 30;
  const circ = 2 * Math.PI * r;
  const color = tone || (v >= 90 ? 'var(--green)' : v >= 75 ? 'var(--amber)' : 'var(--red)');
  return (
    <div className="stack" style={{ alignItems: 'center', gap: 4 }}>
      <svg width="78" height="78" viewBox="0 0 78 78">
        <circle cx="39" cy="39" r={r} fill="none" stroke="var(--gray-bg)" strokeWidth="8" />
        <circle cx="39" cy="39" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(v / 100) * circ} ${circ}`} transform="rotate(-90 39 39)" />
        <text x="39" y="44" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--text)">{value == null ? '—' : `${value}%`}</text>
      </svg>
      <span className="small muted center">{label}</span>
    </div>
  );
}

/** Sparkline kecil untuk kartu KPI. */
export function Sparkline({ values, color = 'var(--chart-1)', width = 120, height = 34 }) {
  const vs = values.map((v) => (v == null ? null : Number(v)));
  const nums = vs.filter((v) => v != null);
  if (nums.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const x = (i) => (i / (vs.length - 1)) * (width - 4) + 2;
  const y = (v) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const pts = vs.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={`${d} L${last[0]},${height} L${pts[0][0]},${height} Z`} fill={color} opacity="0.08" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.8" fill={color} />
    </svg>
  );
}

/** Grafik garis multi-seri dengan sumbu & tooltip. */
export function LineChart({ labels, series, height = 220, format = (v) => v }) {
  const [tip, setTip] = useState(null);
  const W = 640;
  const pad = { l: 46, r: 12, t: 12, b: 26 };
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  const max = Math.max(1, ...all);
  const x = (i) => pad.l + (i / Math.max(1, labels.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => height - pad.b - (v / max) * (height - pad.t - pad.b);
  const ticks = [0, max / 2, max];
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label="grafik tren">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t ? '3 3' : ''} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{format(Math.round(t * 10) / 10, true)}</text>
          </g>
        ))}
        {labels.map((l, i) => <text key={l + i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="10.5" fill="var(--muted)">{l}</text>)}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v), v, i])).filter(Boolean);
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
          return (
            <g key={s.label}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" />
              {pts.map((p) => (
                <circle key={p[3]} cx={p[0]} cy={p[1]} r="4" fill="var(--surface)" stroke={s.color} strokeWidth="2"
                  onMouseEnter={(e) => setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, text: `${labels[p[3]]} · ${s.label}: ${format(p[2])}` })} onMouseLeave={() => setTip(null)} />
              ))}
            </g>
          );
        })}
      </svg>
      {tip && <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
      <div className="chart-legend">{series.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>)}</div>
    </div>
  );
}

/** Heatmap risiko 5×5 (likelihood × impact). */
export function RiskHeatmap({ grid, title }) {
  const tone = (l, i) => {
    const s = l * i;
    return s >= 20 ? 'var(--red)' : s >= 10 ? 'var(--orange)' : s >= 5 ? '#d29a35' : 'var(--green)';
  };
  return (
    <div className="heatmap">
      {title && <div className="small muted" style={{ marginBottom: 6 }}>{title}</div>}
      <div className="heat-grid">
        <span className="heat-axis-y">Likelihood →</span>
        {grid.map((row, ri) => row.map((n, ci) => {
          const l = 5 - ri;
          const i = ci + 1;
          return (
            <span key={`${ri}-${ci}`} className="heat-cell" style={{ background: tone(l, i), opacity: n ? 1 : 0.22 }} title={`Likelihood ${l} × Impact ${i}: ${n} risiko`}>
              {n || ''}
            </span>
          );
        }))}
      </div>
      <div className="small muted center" style={{ marginTop: 4 }}>Impact →</div>
    </div>
  );
}

/** Bar anggaran: pagu vs komitmen vs realisasi. */
export function BudgetBars({ rows, format }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <div className="stack" style={{ gap: 12 }}>
      {rows.map((r) => (
        <div key={r._id || r.name}>
          <div className="row between small"><span className="nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' }}>{r.name}</span><span className="muted">{format(r.actual)} / {format(r.amount)}</span></div>
          <div className="budget-track" style={{ width: `${(r.amount / max) * 100}%` }}>
            <span className="budget-committed" style={{ width: `${Math.min(100, (r.committed / (r.amount || 1)) * 100)}%` }} />
            <span className="budget-actual" style={{ width: `${Math.min(100, (r.actual / (r.amount || 1)) * 100)}%` }} />
          </div>
        </div>
      ))}
      <div className="chart-legend"><span><i style={{ background: 'var(--gray-bg)', border: '1px solid var(--border-strong)' }} />Pagu</span><span><i style={{ background: 'var(--chart-2)' }} />Terkomitmen (PO)</span><span><i style={{ background: 'var(--chart-1)' }} />Realisasi</span></div>
    </div>
  );
}
