import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { PRIORITY_LABELS, STATUS_LABELS } from '../config/labels.js';
import { BudgetBars, ColumnChart, Donut, Gauge, HBars, LineChart, RiskHeatmap, Sparkline } from '../components/charts.jsx';
import { fmtMoney } from '../components/format.jsx';
import Icon from '../components/Icon.jsx';
import { Empty, PageHeader, Tabs } from '../components/ui.jsx';

const short = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 0 })} jt`;
  return n.toLocaleString('id-ID');
};
const SOURCING = { catalog: 'E-katalog', rfq: 'RFQ', limited_tender: 'Tender terbatas', open_tender: 'Tender terbuka', direct: 'Penunjukan langsung', contract: 'Kontrak berjalan' };
const SEV = { critical: 'Kritis', high: 'Tinggi', medium: 'Sedang', low: 'Rendah' };
const SEV_COLORS = { critical: 'var(--red)', high: 'var(--orange)', medium: 'var(--amber)', low: 'var(--green)' };

/** Kartu KPI dengan nilai, delta vs bulan sebelumnya (warna sesuai arah "lebih baik"), dan sparkline tren. */
function TrendCard({ k }) {
  const fmt = k.format === 'money' ? (v) => `Rp ${short(v)}` : (v) => (v == null ? '—' : `${v.toLocaleString('id-ID')}${k.unit}`);
  const good = k.delta == null || k.delta === 0 || k.better === 'neutral' ? 'flat' : (k.delta > 0) === (k.better === 'up') ? 'good' : 'bad';
  return (
    <div className="kpi-trend">
      <span className="small muted">{k.label}</span>
      <div className="row between" style={{ flexWrap: 'nowrap' }}>
        <span className="kpi-value">{fmt(k.value)}</span>
        <Sparkline values={k.series.map((p) => p.value)} color={good === 'bad' ? 'var(--red)' : 'var(--chart-1)'} />
      </div>
      <span className="small">
        {k.delta != null ? <span className={`delta ${good}`}>{k.delta > 0 ? '▲' : k.delta < 0 ? '▼' : '■'} {k.format === 'money' ? `Rp ${short(Math.abs(k.delta))}` : `${Math.abs(k.delta).toLocaleString('id-ID')}${k.unit}`}</span> : <span className="muted">—</span>}
        <span className="muted"> vs bulan lalu</span>
      </span>
    </div>
  );
}

const Section = ({ title, children, to }) => (
  <div className="card">
    <div className="row between"><h3>{title}</h3>{to && <Link className="small" to={to}>Detail →</Link>}</div>
    {children}
  </div>
);

export default function Kpi() {
  const [k, setK] = useState(null);
  const [months, setMonths] = useState(6);
  const [tab, setTab] = useState('exec');
  const [error, setError] = useState('');
  useEffect(() => { setK(null); api('/kpi', { query: { months } }).then(setK).catch((e) => setError(e.message)); }, [months]);
  const labels = useMemo(() => (k?.months || []).map((m) => m.label), [k]);

  if (error) return <div className="alert">{error}</div>;
  const tabs = [['exec', 'Ringkasan eksekutif'], k?.operations && ['ops', 'Operasional ITSM'], k?.procurement && ['proc', 'E-Procurement'], k?.finance && ['fin', 'Keuangan TI'], k?.grc && ['grc', 'GRC & Assurance'], k?.dcim && ['dc', 'Data Center'], k?.bcm && ['bcm', 'Ketahanan (BCM/DR)']].filter(Boolean);
  const ops = k?.operations;
  const fin = k?.finance;
  const grc = k?.grc;
  const proc = k?.procurement;
  const series = (kk) => kk.series.map((p) => p.value);

  return (
    <div>
      <PageHeader icon="trend" title="Dashboard KPI" description="Indikator kinerja lintas domain dengan tren bulanan — operasional ITSM, keuangan TI, GRC & assurance, data center, dan ketahanan."
        actions={<select value={months} onChange={(e) => setMonths(Number(e.target.value))} style={{ width: 'auto' }} aria-label="Periode">{[3, 6, 12].map((m) => <option key={m} value={m}>{m} bulan terakhir</option>)}</select>} />
      {!k ? <div className="card"><div className="skeleton" style={{ height: 240 }} /></div> : (
        <>
          <Tabs value={tab} onChange={setTab} tabs={tabs} />

          {tab === 'exec' && (
            <>
              <div className="kpis">
                {[...(ops?.kpis || []).slice(1, 3), ...(fin?.kpis || []).slice(0, 1), ...(grc?.kpis || []).slice(0, 2), ...(ops?.kpis || []).slice(4, 5)].map((x) => <TrendCard key={x.label} k={x} />)}
              </div>
              <div className="grid-3">
                {fin && (
                  <Section title="Serapan anggaran TI" to="/m/budgets">
                    <div className="row" style={{ justifyContent: 'space-around' }}>
                      <Gauge value={fin.totals.utilization} label="Terkomitmen" tone="var(--chart-2)" />
                      <Gauge value={fin.totals.absorption} label="Realisasi" tone="var(--chart-1)" />
                    </div>
                    <p className="small muted center">Pagu {fmtMoney(fin.totals.amount)} · sisa {fmtMoney(fin.totals.available)}</p>
                  </Section>
                )}
                {grc && <Section title="Peta risiko residual" to="/m/risks"><RiskHeatmap grid={grc.heatmapResidual} /></Section>}
                {k.bcm && (
                  <Section title="Kesiapan pemulihan" to="/m/continuity">
                    <div className="row" style={{ justifyContent: 'space-around' }}>
                      <Gauge value={k.bcm.testedWithin12m} label="Rencana diuji ≤ 12 bln" />
                      <Gauge value={k.bcm.criticalServices ? Math.round(((k.bcm.criticalServices - k.bcm.criticalWithoutBia.length) / k.bcm.criticalServices) * 100) : null} label="Layanan kritikal ber-BIA" />
                    </div>
                  </Section>
                )}
                {ops && <Section title="Volume incident" to="/m/incidents"><ColumnChart rows={ops.volume.map((v) => ({ ...v, date: v.key + '-01' }))} series={[{ key: 'created', label: 'Dibuat', color: 'var(--chart-1)' }, { key: 'resolved', label: 'Diselesaikan', color: 'var(--chart-2)' }]} height={170} /></Section>}
                {grc && <Section title="Temuan terbuka per tingkat" to="/m/findings"><Donut data={grc.findingsBySeverity} labels={SEV} colors={SEV_COLORS} /></Section>}
                {k.dcim && <Section title="Utilisasi daya data center" to="/m/datacenters"><HBars data={k.dcim.sites.map((s) => [s.name, s.power || 0])} color="var(--chart-3)" /></Section>}
              </div>
            </>
          )}

          {tab === 'ops' && ops && (
            <>
              <div className="kpis">{ops.kpis.map((x) => <TrendCard key={x.label} k={x} />)}</div>
              <div className="grid-2">
                <Section title="Tren MTTR & kepatuhan SLA">
                  <LineChart labels={labels} series={[{ label: 'Kepatuhan SLA (%)', values: series(ops.kpis[2]), color: 'var(--chart-1)' }, { label: 'Diselesaikan ≤ 4 jam (%)', values: series(ops.kpis[3]), color: 'var(--chart-2)' }]} />
                </Section>
                <Section title="MTTR per bulan (jam)"><LineChart labels={labels} series={[{ label: 'MTTR (jam)', values: series(ops.kpis[1]), color: 'var(--chart-5)' }]} /></Section>
                <Section title="Incident terbuka per prioritas"><Donut data={ops.byPriority} labels={PRIORITY_LABELS} colors={{ 1: 'var(--red)', 2: 'var(--orange)', 3: 'var(--amber)', 4: 'var(--green)' }} /></Section>
                <Section title="Problem & change">
                  <div className="kpis" style={{ marginBottom: 8 }}>
                    <div className="kpi"><span className="kpi-ic"><Icon name="problem" /></span><span><div className="kpi-value">{ops.problemsOpen ?? '—'}</div><div className="kpi-label">Problem terbuka</div></span></div>
                    <div className="kpi tone-gold"><span className="kpi-ic"><Icon name="book" /></span><span><div className="kpi-value">{ops.knownErrors ?? '—'}</div><div className="kpi-label">Known error aktif</div></span></div>
                  </div>
                  {ops.changeTypes && <HBars data={ops.changeTypes} labels={{ standard: 'Standard', normal: 'Normal', emergency: 'Emergency' }} />}
                </Section>
              </div>
            </>
          )}

          {tab === 'proc' && proc && (
            <>
              <div className="kpis">
                <div className="kpi"><span className="kpi-ic"><Icon name="cart" /></span><span><div className="kpi-value">Rp {short(proc.totals.poValue)}</div><div className="kpi-label">Nilai PO terbit ({months} bln)</div></span></div>
                <div className="kpi tone-gold"><span className="kpi-ic"><Icon name="grid" /></span><span><div className="kpi-value">{proc.totals.catalogShare ?? 0}%</div><div className="kpi-label">Belanja melalui e-katalog</div></span></div>
                <div className="kpi tone-green"><span className="kpi-ic"><Icon name="trend" /></span><span><div className="kpi-value">Rp {short(proc.totals.savings)}</div><div className="kpi-label">Penghematan vs HPS ({proc.totals.savingsPct ?? 0}%)</div></span></div>
                <div className="kpi"><span className="kpi-ic"><Icon name="gavel" /></span><span><div className="kpi-value">{proc.totals.competitiveShare ?? '—'}%</div><div className="kpi-label">Non-katalog via kompetisi</div></span></div>
                <div className="kpi"><span className="kpi-ic"><Icon name="users" /></span><span><div className="kpi-value">{proc.totals.avgBids ?? '—'}</div><div className="kpi-label">Rata-rata penawaran / RFQ</div></span></div>
                <div className="kpi"><span className="kpi-ic"><Icon name="clock" /></span><span><div className="kpi-value">{proc.totals.prCycleDays ?? '—'} hari</div><div className="kpi-label">Siklus PR → pengadaan</div></span></div>
              </div>
              <div className="kpis">{proc.kpis.map((x) => <TrendCard key={x.label} k={x} />)}</div>
              <div className="grid-3">
                <Section title="Nilai PO per metode pengadaan" to="/m/purchase-orders"><Donut data={Object.fromEntries(Object.entries(proc.bySourcing).map(([kk, v]) => [kk, Math.round(v / 1e6)]))} labels={SOURCING} center={short(proc.totals.poValue)} /><p className="small muted">juta rupiah</p></Section>
                <Section title="HPS vs nilai kontrak tender" to="/m/rfqs">
                  {proc.savingsByRfq.length ? <BudgetBars rows={proc.savingsByRfq.map((r) => ({ ...r, amount: r.hps, committed: r.awarded, actual: 0 }))} format={(v) => `Rp ${short(v)}`} legend={['HPS', 'Nilai pemenang']} /> : <p className="muted small">Belum ada tender yang ditetapkan.</p>}
                </Section>
                <Section title="Penyedia terbesar (nilai PO)" to="/m/vendors"><HBars data={proc.topVendors.map((v) => [v.name, Math.round(v.amount / 1e6)])} color="var(--chart-2)" /><p className="small muted">juta rupiah</p></Section>
                <Section title="Tren porsi e-katalog"><LineChart labels={labels} series={[{ label: 'Porsi e-katalog (%)', values: series(proc.kpis[1]), color: 'var(--chart-1)' }]} height={180} /></Section>
                {proc.prByStatus && <Section title="Permintaan pembelian per status" to="/m/requisitions"><HBars data={proc.prByStatus} labels={STATUS_LABELS} color="var(--chart-3)" /></Section>}
                {proc.rfqByStatus && <Section title="RFQ & tender per status" to="/m/rfqs"><HBars data={proc.rfqByStatus} labels={STATUS_LABELS} color="var(--chart-5)" /></Section>}
              </div>
              {proc.totals.catalogExpiring30d > 0 && <div className="alert warn"><Icon name="alert" size="sm" />{proc.totals.catalogExpiring30d} item e-katalog akan habis masa berlaku harganya dalam 30 hari — perbarui harga atau kontrak payung.</div>}
            </>
          )}

          {tab === 'fin' && fin && (
            <>
              <div className="kpis">
                <div className="kpi"><span className="kpi-ic"><Icon name="wallet" /></span><span><div className="kpi-value">Rp {short(fin.totals.amount)}</div><div className="kpi-label">Pagu anggaran aktif</div></span></div>
                <div className="kpi tone-gold"><span className="kpi-ic"><Icon name="cart" /></span><span><div className="kpi-value">Rp {short(fin.totals.committed)}</div><div className="kpi-label">Terkomitmen PO ({fin.totals.utilization ?? 0}%)</div></span></div>
                <div className="kpi tone-green"><span className="kpi-ic"><Icon name="receipt" /></span><span><div className="kpi-value">Rp {short(fin.totals.actual)}</div><div className="kpi-label">Realisasi ({fin.totals.absorption ?? 0}%)</div></span></div>
                <div className={`kpi ${fin.overduePayables ? 'tone-red' : ''}`}><span className="kpi-ic"><Icon name="clock" /></span><span><div className="kpi-value">{fin.overduePayables}</div><div className="kpi-label">Tagihan lewat jatuh tempo</div></span></div>
                <div className="kpi"><span className="kpi-ic"><Icon name="checkSquare" /></span><span><div className="kpi-value">{fin.invoicesPendingApproval}</div><div className="kpi-label">Tagihan dalam verifikasi/persetujuan</div></span></div>
              </div>
              <div className="grid-2">
                <Section title="Anggaran vs komitmen vs realisasi" to="/m/budgets"><BudgetBars rows={fin.byBudget} format={(v) => `Rp ${short(v)}`} /></Section>
                <Section title="Belanja TI bulanan"><LineChart labels={labels} series={[{ label: 'Belanja (tagihan disetujui)', values: fin.spend.map((p) => p.value), color: 'var(--chart-1)' }, ...(fin.kpis[1] ? [{ label: 'Pembayaran dieksekusi', values: fin.kpis[1].series.map((p) => p.value), color: 'var(--chart-2)' }] : [])]} format={(v) => `Rp ${short(v)}`} /></Section>
                <Section title="Aging utang usaha (AP)" to="/m/invoices?status=approved"><HBars data={Object.entries(fin.apAging).map(([kk, v]) => [kk, Math.round(v / 1e6)])} color="var(--chart-2)" /><p className="small muted">dalam juta rupiah, sisa yang belum dibayar</p></Section>
                <Section title="Portofolio Run–Grow–Transform"><Donut data={Object.fromEntries(Object.entries(fin.byPortfolio).map(([kk, v]) => [kk, Math.round(v / 1e6)]))} labels={{ run: 'Run', grow: 'Grow', transform: 'Transform' }} center={`${short(fin.totals.amount)}`} /><p className="small muted">pagu (juta rupiah)</p></Section>
              </div>
            </>
          )}

          {tab === 'grc' && grc && (
            <>
              <div className="kpis">
                {grc.kpis.map((x) => <TrendCard key={x.label} k={x} />)}
                <div className={`kpi ${grc.findingsOverdue ? 'tone-red' : ''}`}><span className="kpi-ic"><Icon name="flag" /></span><span><div className="kpi-value">{grc.findingsOverdue}</div><div className="kpi-label">Temuan lewat target</div></span></div>
                {grc.actionsOverdue != null && <div className={`kpi ${grc.actionsOverdue ? 'tone-amber' : ''}`}><span className="kpi-ic"><Icon name="target" /></span><span><div className="kpi-value">{grc.actionsOverdue}</div><div className="kpi-label">Mitigasi terlambat</div></span></div>}
              </div>
              <div className="grid-3">
                <Section title="Heatmap risiko inheren" to="/m/risks"><RiskHeatmap grid={grc.heatmapInherent} /></Section>
                <Section title="Heatmap risiko residual" to="/m/risks"><RiskHeatmap grid={grc.heatmapResidual} /></Section>
                <Section title="Efektivitas kontrol (hasil pengujian)" to="/m/control-tests"><Donut data={grc.controlEffectiveness} labels={{ effective: 'Efektif', partially_effective: 'Sebagian', ineffective: 'Tidak efektif' }} colors={{ effective: 'var(--green)', partially_effective: 'var(--amber)', ineffective: 'var(--red)' }} /></Section>
                <Section title="Tren eksposur risiko"><LineChart labels={labels} series={[{ label: 'Σ skor risiko terbuka', values: series(grc.kpis[0]), color: 'var(--chart-5)' }]} height={180} /></Section>
                <Section title="Temuan per status" to="/m/findings"><HBars data={grc.findingsByStatus} labels={STATUS_LABELS} /></Section>
                {grc.actionsByStatus && <Section title="Tindakan mitigasi" to="/m/risk-actions"><HBars data={grc.actionsByStatus} labels={STATUS_LABELS} color="var(--chart-3)" /></Section>}
              </div>
            </>
          )}

          {tab === 'dc' && k.dcim && (
            <>
              <div className="grid-2">
                {k.dcim.sites.map((s) => (
                  <Link key={s._id} to={`/m/datacenters/${s._id}`} className="card site-card" style={{ color: 'inherit', textDecoration: 'none' }}>
                    <div className="row between"><b>{s.name}</b><span className="badge badge-indigo plain">Tier {s.tier} · {s.racks} rak</span></div>
                    <div className="row" style={{ justifyContent: 'space-around' }}>
                      <Gauge value={s.space} label="Utilisasi ruang (U)" tone="var(--chart-3)" />
                      <Gauge value={s.power} label={`Daya ${s.powerUsedKw ?? 0}/${s.powerCapacityKw ?? '—'} kW`} tone={s.power >= 80 ? 'var(--red)' : 'var(--chart-1)'} />
                    </div>
                  </Link>
                ))}
              </div>
              <div className="grid-2">
                <Section title="Rak mendekati kapasitas (daya ≥ 80% / ruang ≥ 90%)" to="/m/racks">
                  {k.dcim.hotRacks.length ? <HBars data={k.dcim.hotRacks.map((r) => [r.name, r.power])} color="var(--red)" /> : <p className="muted small">Tidak ada rak kritis.</p>}
                </Section>
                {k.dcim.accessByType && <Section title="Akses fisik DC per jenis pengunjung" to="/m/dc-access"><Donut data={k.dcim.accessByType} labels={{ employee: 'Pegawai', vendor: 'Vendor', auditor: 'Auditor', guest: 'Tamu' }} /></Section>}
              </div>
            </>
          )}

          {tab === 'bcm' && k.bcm && (
            <>
              <div className="kpis">
                <div className="kpi"><span className="kpi-ic"><Icon name="lifebuoy" /></span><span><div className="kpi-value">{k.bcm.testedWithin12m ?? '—'}%</div><div className="kpi-label">Rencana BCP/DRP diuji ≤ 12 bulan</div></span></div>
                <div className={`kpi ${k.bcm.testOverdue ? 'tone-red' : 'tone-green'}`}><span className="kpi-ic"><Icon name="clock" /></span><span><div className="kpi-value">{k.bcm.testOverdue}</div><div className="kpi-label">Uji terlambat</div></span></div>
                <div className={`kpi ${k.bcm.criticalWithoutBia.length ? 'tone-amber' : 'tone-green'}`}><span className="kpi-ic"><Icon name="activity" /></span><span><div className="kpi-value">{k.bcm.criticalWithoutBia.length}</div><div className="kpi-label">Layanan kritikal tanpa BIA disetujui</div></span></div>
              </div>
              <div className="grid-3">
                <Section title="RTO aktual vs target (jam)" to="/m/dr-tests">
                  {k.bcm.rtoPerformance.length ? k.bcm.rtoPerformance.map((r) => (
                    <div key={r._id} className="hbar"><span className="nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                      <span className="hbar-track"><span className="hbar-fill" style={{ width: `${Math.min(100, (r.actual / Math.max(r.actual, r.target)) * 100)}%`, background: r.actual > r.target ? 'var(--red)' : 'var(--green)' }} /></span>
                      <span className="hbar-val">{r.actual}/{r.target}</span></div>
                  )) : <p className="muted small">Belum ada uji DR terlaksana.</p>}
                </Section>
                <Section title="Hasil uji DR"><Donut data={k.bcm.drResults} labels={{ success: 'Berhasil', partial: 'Sebagian', failed: 'Gagal' }} colors={{ success: 'var(--green)', partial: 'var(--amber)', failed: 'var(--red)' }} /></Section>
                <Section title="BIA per tingkat dampak" to="/m/bia"><Donut data={k.bcm.biaByImpact || {}} labels={SEV} colors={SEV_COLORS} /></Section>
              </div>
              {k.bcm.criticalWithoutBia.length > 0 && <div className="alert warn"><Icon name="alert" size="sm" />Layanan kritikal tanpa BIA disetujui: {k.bcm.criticalWithoutBia.join(', ')}</div>}
            </>
          )}
          {tabs.length === 1 && !ops && <Empty icon="chart" title="Belum ada data KPI yang dapat Anda akses" />}
        </>
      )}
    </div>
  );
}
