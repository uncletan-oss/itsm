/**
 * Perhitungan dashboard, laporan & "Pekerjaan Saya" dari array dokumen (pure, tanpa I/O).
 * Dipakai server (dokumen lean per tenant) dan backend demo di browser.
 */
import { APPROVALS, approvalError, approvalProgress } from './approvals.mjs';

const DAY = 864e5;
const t = (v) => (v ? new Date(v).getTime() : null);
const id = (v) => (v && typeof v === 'object' ? String(v._id) : v ? String(v) : null);
const same = (a, b) => !!a && !!b && id(a) === id(b);
const countBy = (items, field) => items.reduce((acc, d) => ({ ...acc, [d[field] ?? 'none']: (acc[d[field] ?? 'none'] || 0) + 1 }), {});

export const OPEN = {
  incidents: ['new', 'assigned', 'in_progress', 'pending'],
  requests: ['submitted', 'pending_approval', 'approved', 'fulfilling'],
  problems: ['new', 'investigating', 'known_error'],
  changes: ['draft', 'submitted', 'assessment', 'cab_review', 'approved', 'scheduled', 'implementing', 'review'],
  backlog: ['backlog', 'todo', 'in_progress', 'review'],
  risks: ['identified', 'assessed', 'treating', 'monitoring'],
  knowledge: ['draft', 'review'],
  'risk-actions': ['open', 'in_progress'],
  findings: ['open', 'action_plan', 'in_remediation'],
};

const brief = (resource, d, userName) => ({
  resource, _id: id(d._id), number: d.number, title: d.title || d.name, status: d.status, priority: d.priority,
  sla: d.sla, createdAt: d.createdAt, updatedAt: d.updatedAt, plannedStart: d.plannedStart, dueDate: d.dueDate,
  assignee: d.assignee ? { _id: id(d.assignee), name: userName?.(d.assignee) } : null,
});

export function computeDashboard(data, { now = new Date(), userName } = {}) {
  const { incidents = [], requests = [], problems = [], changes = [], risks = [], assets = [], vendors = [], continuity = [], projects = [] } = data;
  const nowMs = now.getTime();
  const openInc = incidents.filter((i) => OPEN.incidents.includes(i.status));
  const resolved30 = incidents.filter((i) => t(i.sla?.resolvedAt) >= nowMs - 30 * DAY);
  const between = (v, days) => v && t(v) >= nowMs && t(v) <= nowMs + days * DAY;
  return {
    role: 'staff',
    incidents: {
      byStatus: countBy(incidents, 'status'),
      openByPriority: countBy(openInc, 'priority'),
      openBreached: openInc.filter((i) => i.sla?.resolutionDue && !i.sla.pausedAt && t(i.sla.resolutionDue) < nowMs).length,
      majorOpen: openInc.filter((i) => i.majorIncident).length,
      regulatoryPending: incidents.filter((i) => i.regulatoryReportable && !i.regulatorReportedAt && i.status !== 'cancelled').length,
      slaCompliance30d: resolved30.length ? Math.round((resolved30.filter((i) => !i.sla.resolutionBreached).length / resolved30.length) * 100) : null,
      resolved30d: resolved30.length,
      recent: [...openInc].sort((a, b) => (a.priority || 9) - (b.priority || 9) || t(b.createdAt) - t(a.createdAt)).slice(0, 6).map((i) => brief('incidents', i, userName)),
    },
    requests: { byStatus: countBy(requests, 'status') },
    problems: { byStatus: countBy(problems, 'status') },
    changes: {
      byStatus: countBy(changes, 'status'),
      upcoming: changes
        .filter((c) => ['approved', 'scheduled'].includes(c.status) && t(c.plannedStart) >= nowMs)
        .sort((a, b) => t(a.plannedStart) - t(b.plannedStart))
        .slice(0, 5)
        .map((c) => ({ ...brief('changes', c, userName), type: c.type, risk: c.risk })),
    },
    risks: { openByLevel: countBy(risks.filter((r) => r.status !== 'closed'), 'inherentLevel') },
    assets: {
      byStatus: countBy(assets, 'status'),
      licensesExpiring30d: assets.filter((a) => between(a.licenseExpiry, 30)).length,
      warrantyExpiring30d: assets.filter((a) => between(a.warrantyEnd, 30)).length,
    },
    vendors: {
      contractsEnding90d: vendors.filter((v) => v.status === 'active' && between(v.contractEnd, 90)).length,
      critical: vendors.filter((v) => v.criticality === 'critical' && v.status === 'active').length,
    },
    continuity: { testOverdue: continuity.filter((c) => c.status !== 'retired' && (!c.lastTestDate || t(c.nextTestDate) < nowMs)).length },
    projects: { byHealth: countBy(projects.filter((p) => !['closed', 'cancelled'].includes(p.status)), 'health') },
  };
}

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const hours = (a, b) => (t(b) - t(a)) / 36e5;
const avg = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

/** Laporan operasional untuk periode `days` terakhir. */
export function computeReports(data, { days = 30, now = new Date(), serviceName } = {}) {
  const { incidents = [], requests = [], changes = [], problems = [] } = data;
  const nowMs = now.getTime();
  const start = nowMs - days * DAY;
  const inWindow = (v) => t(v) >= start && t(v) <= nowMs;

  const trend = [];
  for (let d = days - 1; d >= 0; d -= 1) trend.push({ date: dayKey(nowMs - d * DAY), created: 0, resolved: 0 });
  const idx = Object.fromEntries(trend.map((r, i) => [r.date, i]));
  for (const i of incidents) {
    if (inWindow(i.createdAt)) trend[idx[dayKey(t(i.createdAt))]] && (trend[idx[dayKey(t(i.createdAt))]].created += 1);
    if (inWindow(i.resolvedAt)) trend[idx[dayKey(t(i.resolvedAt))]] && (trend[idx[dayKey(t(i.resolvedAt))]].resolved += 1);
  }

  const resolvedInc = incidents.filter((i) => inWindow(i.resolvedAt));
  const mttr = {};
  const sla = {};
  for (const p of [1, 2, 3, 4]) {
    const set = resolvedInc.filter((i) => i.priority === p);
    mttr[p] = avg(set.map((i) => hours(i.createdAt, i.resolvedAt)));
    const withSla = set.filter((i) => i.sla?.resolutionDue);
    sla[p] = { met: withSla.filter((i) => !i.sla.resolutionBreached).length, breached: withSla.filter((i) => i.sla.resolutionBreached).length };
  }
  const allSla = Object.values(sla).reduce((a, s) => ({ met: a.met + s.met, breached: a.breached + s.breached }), { met: 0, breached: 0 });

  const closedChanges = changes.filter((c) => c.outcome && inWindow(c.closedAt || c.updatedAt));
  const outcome = countBy(closedChanges, 'outcome');
  const ok = (outcome.successful || 0) + (outcome.successful_with_issues || 0);

  const createdInc = incidents.filter((i) => inWindow(i.createdAt));
  const byService = {};
  for (const i of createdInc) {
    const k = i.service ? serviceName?.(i.service) || 'Lainnya' : 'Tanpa layanan';
    byService[k] = (byService[k] || 0) + 1;
  }
  const topServices = Object.entries(byService).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const openInc = incidents.filter((i) => OPEN.incidents.includes(i.status));
  const aging = { '< 1 hari': 0, '1–3 hari': 0, '3–7 hari': 0, '> 7 hari': 0 };
  for (const i of openInc) {
    const age = (nowMs - t(i.createdAt)) / DAY;
    aging[age < 1 ? '< 1 hari' : age < 3 ? '1–3 hari' : age < 7 ? '3–7 hari' : '> 7 hari'] += 1;
  }

  const fulfilled = requests.filter((r) => inWindow(r.resolvedAt));
  return {
    days,
    incidentTrend: trend,
    totals: {
      incidentsCreated: createdInc.length,
      incidentsResolved: resolvedInc.length,
      requestsCreated: requests.filter((r) => inWindow(r.createdAt)).length,
      problemsOpen: problems.filter((p) => OPEN.problems.includes(p.status)).length,
      mttrHours: avg(resolvedInc.map((i) => hours(i.createdAt, i.resolvedAt))),
      slaCompliance: allSla.met + allSla.breached ? Math.round((allSla.met / (allSla.met + allSla.breached)) * 100) : null,
      requestFulfillmentHours: avg(fulfilled.map((r) => hours(r.createdAt, r.resolvedAt))),
      changeSuccessRate: closedChanges.length ? Math.round((ok / closedChanges.length) * 100) : null,
    },
    mttrByPriority: mttr,
    slaByPriority: sla,
    changeOutcome: outcome,
    changeByType: countBy(changes.filter((c) => inWindow(c.createdAt)), 'type'),
    incidentsByCategory: countBy(createdInc, 'category'),
    topServices,
    backlogAging: aging,
  };
}

/** Pekerjaan untuk user: ditugaskan, menunggu persetujuannya, dan tiket yang ia ajukan. */
export function computeMyWork(data, user, { hasRole, canRead }) {
  const mine = (d, f = 'assignee') => same(d[f], user._id);
  const assigned = [];
  const add = (resource, items, field) => {
    if (!canRead(resource)) return;
    for (const d of items || []) if (OPEN[resource].includes(d.status) && mine(d, field)) assigned.push(brief(resource, d));
  };
  add('incidents', data.incidents);
  add('requests', data.requests);
  add('problems', data.problems);
  add('changes', data.changes);
  add('backlog', data.backlog);
  add('risks', data.risks, 'owner');
  add('risk-actions', data['risk-actions'], 'owner');
  add('findings', data.findings, 'owner');

  // Antrean persetujuan generik: semua record yang tahap persetujuan saat ini dapat diputuskan user
  const approvals = [];
  for (const [res, policy] of Object.entries(APPROVALS)) {
    for (const d of data[res] || []) {
      if (d.status !== policy.status || approvalError(policy, d, user)) continue;
      const step = approvalProgress(policy, d).current;
      approvals.push({ ...brief(res, d), kind: `${policy.label} · ${step.name}`, amount: d.total ?? d.amount ?? d.value ?? d.subtotal ?? d.recommendedAmount ?? d.unitPrice });
    }
  }
  if (canRead('knowledge') && hasRole(user, ['knowledge_manager'])) {
    for (const k of data.knowledge || []) {
      if (k.status === 'review' && !same(k.author, user._id) && !same(k.createdBy, user._id)) approvals.push({ ...brief('knowledge', k), kind: 'Review artikel' });
    }
  }

  const requested = [];
  for (const res of ['incidents', 'requests']) {
    for (const d of data[res] || []) {
      if (OPEN[res].includes(d.status) && (same(d.requester, user._id) || same(d.createdBy, user._id)) && !mine(d)) requested.push(brief(res, d));
    }
    for (const d of data[res] || []) {
      if (['resolved', 'fulfilled'].includes(d.status) && same(d.requester, user._id)) requested.push({ ...brief(res, d), needsConfirmation: true });
    }
  }
  const byPriority = (a, b) => (a.priority || 9) - (b.priority || 9) || t(a.createdAt) - t(b.createdAt);
  return { assigned: assigned.sort(byPriority), approvals, requested: requested.sort(byPriority) };
}
