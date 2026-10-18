/**
 * Dashboard KPI lintas domain (pure). Input: array dokumen per resource yang boleh dibaca user.
 * Setiap seksi hanya dihitung bila datanya tersedia.
 */
const DAY = 864e5;
const t = (v) => (v ? new Date(v).getTime() : null);
const id = (v) => (v && typeof v === 'object' ? String(v._id) : v ? String(v) : null);
const sum = (xs, f) => xs.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const avg = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const countBy = (items, f) => items.reduce((acc, d) => { const k = f(d) ?? 'none'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});

function months(now, n) {
  const out = [];
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = n - 1; i >= 0; i -= 1) {
    const s = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const e = new Date(d.getFullYear(), d.getMonth() - i + 1, 1);
    out.push({ key: s.toISOString().slice(0, 7), label: s.toLocaleDateString('id-ID', { month: 'short' }), start: s.getTime(), end: e.getTime() });
  }
  return out;
}
const inM = (m, v) => t(v) >= m.start && t(v) < m.end;
/** KPI dengan nilai sekarang, nilai periode sebelumnya & deret tren. */
const kpi = (label, series, { unit = '', better = 'up', format } = {}) => {
  const vals = series.map((p) => p.value);
  const cur = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  return { label, value: cur, previous: prev, delta: cur != null && prev != null ? Math.round((cur - prev) * 10) / 10 : null, unit, better, format, series };
};

export function computeKpi(data, { now = new Date(), period = 6 } = {}) {
  const M = months(now, period);
  const nowMs = now.getTime();
  const out = { months: M.map(({ key, label }) => ({ key, label })) };
  const { incidents, changes, requests, problems } = data;

  if (incidents) {
    const series = (fn) => M.map((m) => ({ key: m.key, label: m.label, value: fn(m) }));
    const resolvedIn = (m) => incidents.filter((i) => inM(m, i.resolvedAt || i.sla?.resolvedAt));
    const createdIn = (m) => incidents.filter((i) => inM(m, i.createdAt));
    const mttr = series((m) => avg(resolvedIn(m).filter((i) => i.createdAt).map((i) => (t(i.resolvedAt || i.sla?.resolvedAt) - t(i.createdAt)) / 36e5)));
    const sla = series((m) => { const r = resolvedIn(m).filter((i) => i.sla?.resolutionDue); return pct(r.filter((i) => !i.sla.resolutionBreached).length, r.length); });
    const fcr = series((m) => { const r = resolvedIn(m); return pct(r.filter((i) => (t(i.resolvedAt || i.sla?.resolvedAt) - t(i.createdAt)) <= 4 * 36e5).length, r.length); });
    out.operations = {
      kpis: [
        kpi('Incident baru / bulan', series((m) => createdIn(m).length), { better: 'down' }),
        kpi('MTTR', mttr, { unit: ' jam', better: 'down' }),
        kpi('Kepatuhan SLA resolusi', sla, { unit: '%' }),
        kpi('Diselesaikan ≤ 4 jam', fcr, { unit: '%' }),
        ...(changes ? [kpi('Keberhasilan change', series((m) => { const c = changes.filter((x) => x.outcome && inM(m, x.closedAt || x.updatedAt)); return pct(c.filter((x) => ['successful', 'successful_with_issues'].includes(x.outcome)).length, c.length); }), { unit: '%' })] : []),
        ...(requests ? [kpi('Request terpenuhi / bulan', series((m) => requests.filter((r) => inM(m, r.resolvedAt)).length))] : []),
      ],
      volume: M.map((m) => ({ key: m.key, label: m.label, created: createdIn(m).length, resolved: resolvedIn(m).length })),
      byPriority: countBy(incidents.filter((i) => ['new', 'assigned', 'in_progress', 'pending'].includes(i.status)), (i) => i.priority),
      changeTypes: changes ? countBy(changes.filter((c) => t(c.createdAt) >= M[0].start), (c) => c.type) : null,
      problemsOpen: problems ? problems.filter((p) => !['resolved', 'closed'].includes(p.status)).length : null,
      knownErrors: problems ? problems.filter((p) => p.knownError && p.status !== 'closed').length : null,
    };
  }

  const { budgets, invoices, payments } = data;
  if (budgets) {
    const active = budgets.filter((b) => ['active', 'closed'].includes(b.status));
    const amount = sum(active, (b) => b.amount);
    const committed = sum(active, (b) => b.committedAmount);
    const actual = sum(active, (b) => b.actualAmount);
    const spend = invoices ? M.map((m) => ({ key: m.key, label: m.label, value: sum(invoices.filter((i) => ['approved', 'paid'].includes(i.status) && inM(m, i.invoiceDate || i.createdAt)), (i) => i.amount) })) : [];
    const ap = { 'Belum jatuh tempo': 0, '1–30 hari': 0, '31–60 hari': 0, '> 60 hari': 0 };
    for (const i of (invoices || []).filter((x) => x.status === 'approved')) {
      const overdue = (nowMs - t(i.dueDate)) / DAY;
      const outstanding = (i.total || 0) - (i.paidAmount || 0);
      ap[!i.dueDate || overdue <= 0 ? 'Belum jatuh tempo' : overdue <= 30 ? '1–30 hari' : overdue <= 60 ? '31–60 hari' : '> 60 hari'] += outstanding;
    }
    out.finance = {
      totals: { amount, committed, actual, available: amount - committed, utilization: pct(committed, amount), absorption: pct(actual, amount) },
      byBudget: active.sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 8).map((b) => ({ _id: id(b._id), name: b.name, amount: b.amount || 0, committed: b.committedAmount || 0, actual: b.actualAmount || 0 })),
      byCategory: Object.entries(countBy(active, (b) => b.category)).map(([k]) => ({ key: k, amount: sum(active.filter((b) => b.category === k), (b) => b.amount), actual: sum(active.filter((b) => b.category === k), (b) => b.actualAmount) })),
      byPortfolio: Object.fromEntries(['run', 'grow', 'transform'].map((k) => [k, sum(active.filter((b) => b.portfolio === k), (b) => b.amount)])),
      spend,
      kpis: [
        kpi('Belanja TI / bulan (Rp)', spend, { better: 'neutral', format: 'money' }),
        ...(payments ? [kpi('Pembayaran dieksekusi / bulan (Rp)', M.map((m) => ({ key: m.key, label: m.label, value: sum(payments.filter((p) => ['executed', 'reconciled'].includes(p.status) && inM(m, p.paymentDate || p.updatedAt)), (p) => p.amount) })), { better: 'neutral', format: 'money' })] : []),
      ],
      apAging: ap,
      invoicesPendingApproval: (invoices || []).filter((i) => ['received', 'verified', 'pending_approval'].includes(i.status)).length,
      overduePayables: (invoices || []).filter((i) => i.status === 'approved' && i.dueDate && t(i.dueDate) < nowMs).length,
    };
  }

  const { risks, controls, findings } = data;
  const riskActions = data['risk-actions'];
  const controlTests = data['control-tests'];
  if (risks || findings || controls) {
    const open = (risks || []).filter((r) => r.status !== 'closed');
    const heat = (lk, im) => Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (__, j) => open.filter((r) => Number(r[lk]) === 5 - i && Number(r[im]) === j + 1).length));
    const openF = (findings || []).filter((f) => f.status !== 'closed');
    const concluded = (controlTests || []).filter((c) => c.status === 'concluded');
    const applicable = (controls || []).filter((c) => c.status !== 'not_applicable');
    const exposure = M.map((m) => ({ key: m.key, label: m.label, value: (risks || []).filter((r) => t(r.createdAt) < m.end && (r.status !== 'closed' || t(r.updatedAt) >= m.end)).reduce((s, r) => s + (r.residualScore || r.inherentScore || 0), 0) }));
    out.grc = {
      heatmapInherent: heat('likelihood', 'impact'),
      heatmapResidual: heat('residualLikelihood', 'residualImpact'),
      risksByLevel: countBy(open, (r) => r.residualLevel || r.inherentLevel),
      findingsBySeverity: countBy(openF, (f) => f.severity),
      findingsByStatus: countBy(openF, (f) => f.status),
      findingsOverdue: openF.filter((f) => f.dueDate && t(f.dueDate) < nowMs).length,
      actionsByStatus: riskActions ? countBy(riskActions, (a) => a.status) : null,
      actionsOverdue: riskActions ? riskActions.filter((a) => ['open', 'in_progress'].includes(a.status) && a.dueDate && t(a.dueDate) < nowMs).length : null,
      controlEffectiveness: countBy(concluded, (c) => c.conclusion),
      kpis: [
        kpi('Eksposur risiko (Σ skor)', exposure, { better: 'down' }),
        kpi('Temuan terbuka', M.map((m) => ({ key: m.key, label: m.label, value: (findings || []).filter((f) => t(f.createdAt) < m.end && (f.status !== 'closed' || t(f.updatedAt) >= m.end)).length })), { better: 'down' }),
        kpi('Kontrol diterapkan', M.map((m) => ({ key: m.key, label: m.label, value: pct(applicable.filter((c) => c.status === 'implemented' && (!c.lastAssessed || t(c.lastAssessed) < m.end)).length, applicable.length) })), { unit: '%' }),
      ],
    };
  }

  const { datacenters, racks } = data;
  const dcAccess = data['dc-access'];
  if (datacenters) {
    out.dcim = {
      sites: datacenters.map((dc) => {
        const rs = (racks || []).filter((r) => id(r.datacenter) === id(dc._id) && r.status !== 'decommissioned');
        const u = sum(rs, (r) => r.totalUnits);
        const pw = sum(rs, (r) => r.powerUsedKw);
        return { _id: id(dc._id), name: dc.name, siteType: dc.siteType, tier: dc.tier, racks: rs.length, space: pct(sum(rs, (r) => r.usedUnits), u), power: pct(pw, dc.powerCapacityKw), powerUsedKw: pw, powerCapacityKw: dc.powerCapacityKw };
      }),
      hotRacks: (racks || []).filter((r) => (r.powerUtilization || 0) >= 80 || (r.spaceUtilization || 0) >= 90).map((r) => ({ _id: id(r._id), name: r.name, power: r.powerUtilization, space: r.spaceUtilization })),
      access30d: dcAccess ? countBy(dcAccess.filter((a) => t(a.createdAt) >= nowMs - 30 * DAY), (a) => a.status) : null,
      accessByType: dcAccess ? countBy(dcAccess, (a) => a.visitorType) : null,
    };
  }

  const { continuity, bia, services } = data;
  const drTests = data['dr-tests'];
  if (continuity || bia || drTests) {
    const plans = (continuity || []).filter((p) => p.status !== 'retired');
    const tested12 = plans.filter((p) => p.lastTestDate && t(p.lastTestDate) >= nowMs - 365 * DAY);
    const done = (drTests || []).filter((d) => ['executed', 'reported', 'closed'].includes(d.status));
    const critical = (services || []).filter((s) => ['critical', 'high'].includes(s.criticality) && !s.requestable);
    const covered = new Set((bia || []).filter((b) => b.status === 'approved').map((b) => id(b.service)));
    out.bcm = {
      plansByStatus: countBy(plans, (p) => p.status),
      testedWithin12m: pct(tested12.length, plans.length),
      testOverdue: plans.filter((p) => !p.lastTestDate || (p.nextTestDate && t(p.nextTestDate) < nowMs)).length,
      drResults: countBy(done, (d) => d.result),
      rtoPerformance: done.filter((d) => d.targetRtoHours).map((d) => ({ _id: id(d._id), name: d.title, target: d.targetRtoHours, actual: d.actualRtoHours })),
      biaByImpact: bia ? countBy(bia, (b) => b.impactLevel) : null,
      criticalServices: critical.length,
      criticalWithoutBia: critical.filter((s) => !covered.has(id(s._id))).map((s) => s.name),
    };
  }

  const { assets, vendors, contracts } = data;
  if (assets || vendors) {
    out.assets = {
      byStatus: assets ? countBy(assets, (a) => a.status) : null,
      licenseCompliance: assets ? assets.filter((a) => a.licenseSeats).map((a) => ({ name: a.name, seats: a.licenseSeats, used: a.licenseSeatsUsed || 0 })) : null,
      vendorsByCriticality: vendors ? countBy(vendors.filter((v) => v.status === 'active'), (v) => v.criticality) : null,
      contractsExpiring90d: contracts ? contracts.filter((c) => c.status === 'active' && c.endDate && t(c.endDate) - nowMs <= 90 * DAY).length : null,
    };
  }
  return out;
}
