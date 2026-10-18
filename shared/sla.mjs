const MIN = 60 * 1000;

function computeDueDates(start, policy) {
  const t = new Date(start).getTime();
  return {
    policy: policy._id,
    responseDue: new Date(t + policy.responseMinutes * MIN),
    resolutionDue: new Date(t + policy.resolutionMinutes * MIN),
    targetMinutes: policy.resolutionMinutes,
  };
}

const RESOLVED_STATES = ['resolved', 'fulfilled'];
const PAUSE_STATES = ['pending', 'pending_approval'];

/** Memperbarui SLA saat transisi status (respons pertama, pause/resume, penyelesaian, reopen). */
function applyTransition(sla, from, to, now = new Date()) {
  if (!sla) return sla;
  const startStates = ['new', 'submitted'];
  if (startStates.includes(from) && !sla.respondedAt && to !== 'cancelled') {
    sla.respondedAt = now;
    sla.responseBreached = !!sla.responseDue && now > sla.responseDue;
  }
  if (PAUSE_STATES.includes(from) && sla.pausedAt) {
    const paused = Math.round((now - new Date(sla.pausedAt)) / MIN);
    sla.pausedMinutes = (sla.pausedMinutes || 0) + paused;
    if (sla.resolutionDue) sla.resolutionDue = new Date(new Date(sla.resolutionDue).getTime() + paused * MIN);
    sla.pausedAt = undefined;
  }
  if (PAUSE_STATES.includes(to)) sla.pausedAt = now;
  if (RESOLVED_STATES.includes(to)) {
    sla.resolvedAt = now;
    sla.resolutionBreached = !!sla.resolutionDue && now > sla.resolutionDue;
  }
  if (RESOLVED_STATES.includes(from) && !['closed', 'cancelled'].includes(to)) {
    sla.resolvedAt = undefined; // reopen
  }
  return sla;
}

/** Status SLA untuk tampilan & dashboard. */
function slaStatus(sla, now = new Date()) {
  if (!sla || !sla.resolutionDue) return 'none';
  if (sla.resolvedAt) return sla.resolutionBreached ? 'breached' : 'met';
  if (sla.pausedAt) return 'paused';
  const due = new Date(sla.resolutionDue).getTime();
  if (now.getTime() > due) return 'breached';
  const start = due - (sla.targetMinutes || 0) * MIN;
  if (sla.targetMinutes && (now.getTime() - start) / (due - start) >= 0.75) return 'at_risk';
  if (due - now.getTime() < 60 * MIN) return 'at_risk';
  return 'on_track';
}

export { computeDueDates, applyTransition, slaStatus };
