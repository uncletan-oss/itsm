import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PRIORITY_LABELS } from '../config/labels.js';
import { ColumnChart, Donut, HBars } from '../components/charts.jsx';
import { Kpi } from './Dashboard.jsx';
import { PageHeader } from '../components/ui.jsx';

const OUTCOME = { successful: 'Berhasil', successful_with_issues: 'Berhasil dgn isu', failed: 'Gagal', backed_out: 'Di-rollback' };
const TYPE = { standard: 'Standard', normal: 'Normal', emergency: 'Emergency' };

export default function Reports() {
  const [days, setDays] = useState(30);
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { setR(null); api('/reports', { query: { days } }).then(setR).catch((e) => setError(e.message)); }, [days]);

  return (
    <div>
      <PageHeader icon="chart" title="Laporan Operasional" description="Kinerja layanan TI: volume, MTTR, kepatuhan SLA, dan keberhasilan change — dasar Service Level Management & Continual Improvement."
        actions={<select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 'auto' }} aria-label="Periode">
          {[7, 30, 90, 180].map((d) => <option key={d} value={d}>{d} hari terakhir</option>)}
        </select>} />
      {error && <div className="alert">{error}</div>}
      {!r ? <div className="card"><div className="skeleton" style={{ height: 200 }} /></div> : (
        <>
          <div className="kpis">
            <Kpi icon="alert" label="Incident dibuat" value={r.totals.incidentsCreated} />
            <Kpi icon="check" tone="green" label="Incident diselesaikan" value={r.totals.incidentsResolved} />
            <Kpi icon="clock" label="MTTR rata-rata" value={r.totals.mttrHours == null ? '—' : `${r.totals.mttrHours} jam`} />
            <Kpi icon="shield" tone={r.totals.slaCompliance != null && r.totals.slaCompliance < 90 ? 'amber' : 'green'} label="Kepatuhan SLA resolusi" value={r.totals.slaCompliance == null ? '—' : `${r.totals.slaCompliance}%`} />
            <Kpi icon="request" label="Waktu pemenuhan request" value={r.totals.requestFulfillmentHours == null ? '—' : `${r.totals.requestFulfillmentHours} jam`} />
            <Kpi icon="change" tone={r.totals.changeSuccessRate != null && r.totals.changeSuccessRate < 85 ? 'amber' : 'green'} label="Tingkat keberhasilan change" value={r.totals.changeSuccessRate == null ? '—' : `${r.totals.changeSuccessRate}%`} />
          </div>
          <div className="card">
            <h3>Tren incident harian</h3>
            <ColumnChart rows={r.incidentTrend} series={[{ key: 'created', label: 'Dibuat', color: 'var(--chart-1)' }, { key: 'resolved', label: 'Diselesaikan', color: 'var(--chart-2)' }]} />
          </div>
          <div className="grid-3">
            <div className="card">
              <h3>MTTR per prioritas (jam)</h3>
              <HBars data={Object.entries(r.mttrByPriority).filter(([, v]) => v != null)} labels={PRIORITY_LABELS} />
            </div>
            <div className="card">
              <h3>SLA resolusi per prioritas</h3>
              {[1, 2, 3, 4].map((p) => {
                const s = r.slaByPriority[p];
                const total = s.met + s.breached;
                return (
                  <div key={p} className="hbar">
                    <span>{PRIORITY_LABELS[p]}</span>
                    <span className="hbar-track" style={{ display: 'flex' }}>
                      <span className="hbar-fill" style={{ width: `${total ? (s.met / total) * 100 : 0}%`, background: 'var(--green)', borderRadius: 0 }} />
                      <span className="hbar-fill" style={{ width: `${total ? (s.breached / total) * 100 : 0}%`, background: 'var(--red)', borderRadius: 0 }} />
                    </span>
                    <span className="hbar-val">{total ? `${Math.round((s.met / total) * 100)}%` : '—'}</span>
                  </div>
                );
              })}
              <div className="chart-legend"><span><i style={{ background: 'var(--green)' }} />Terpenuhi</span><span><i style={{ background: 'var(--red)' }} />Breach</span></div>
            </div>
            <div className="card"><h3>Hasil change</h3><Donut data={r.changeOutcome} labels={OUTCOME} colors={{ successful: 'var(--green)', successful_with_issues: 'var(--amber)', failed: 'var(--red)', backed_out: 'var(--orange)' }} /></div>
            <div className="card"><h3>Layanan dengan incident terbanyak</h3><HBars data={r.topServices} /></div>
            <div className="card"><h3>Incident per kategori</h3><HBars data={r.incidentsByCategory} color="var(--chart-3)" /></div>
            <div className="card"><h3>Umur incident terbuka</h3><HBars data={r.backlogAging} color="var(--chart-2)" /><h3 style={{ marginTop: 16 }}>Change per tipe</h3><HBars data={r.changeByType} labels={TYPE} /></div>
          </div>
        </>
      )}
    </div>
  );
}
