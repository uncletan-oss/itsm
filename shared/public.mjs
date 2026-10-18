/**
 * Data untuk situs publik (tanpa login). Hanya field yang aman dipublikasikan
 * yang dikembalikan — tidak ada detail tiket, nama petugas, atau CI.
 */
const OPEN_INC = ['new', 'assigned', 'in_progress', 'pending'];
const same = (a, b) => a && b && String(a._id || a) === String(b._id || b);

/**
 * Status layanan publik: major_outage | degraded | maintenance | operational.
 * Item katalog permintaan (requestable) bukan layanan operasional, jadi tidak ditampilkan.
 */
export function serviceStatuses(services, incidents, changes) {
  const RANK = { operational: 0, maintenance: 1, degraded: 2, major_outage: 3 };
  return services.filter((s) => !s.requestable).map((s) => {
    let status = 'operational';
    let since = null;
    const bump = (next, at) => {
      if (RANK[next] > RANK[status]) {
        status = next;
        since = at;
      }
    };
    for (const i of incidents) {
      if (!OPEN_INC.includes(i.status) || !same(i.service, s)) continue;
      if (i.majorIncident || i.priority === 1) bump('major_outage', i.createdAt);
      else if (i.priority === 2) bump('degraded', i.createdAt);
    }
    for (const c of changes) {
      if (c.status === 'implementing' && (same(c.service, s))) bump('maintenance', c.actualStart || c.plannedStart);
    }
    return { _id: String(s._id), name: s.name, type: s.type, criticality: s.criticality, availabilityTarget: s.availabilityTarget, supportHours: s.supportHours, status, since };
  });
}

/** Jadwal pemeliharaan terencana yang diumumkan ke publik. */
export const publicMaintenance = (changes, services, now = new Date()) =>
  changes
    .filter((c) => ['approved', 'scheduled'].includes(c.status) && c.plannedStart && new Date(c.plannedStart) >= now && c.service)
    .sort((a, b) => new Date(a.plannedStart) - new Date(b.plannedStart))
    .slice(0, 5)
    .map((c) => ({
      service: services.find((s) => same(c.service, s))?.name || '-',
      plannedStart: c.plannedStart,
      plannedEnd: c.plannedEnd,
      type: c.type,
    }));

export const publicArticle = (a, withContent = false) => ({
  _id: String(a._id), number: a.number, title: a.title, category: a.category, articleType: a.articleType,
  publishedAt: a.publishedAt, tags: a.tags || [], ...(withContent ? { content: a.content } : {}),
});

export const publicService = (s) => ({
  _id: String(s._id), name: s.name, description: s.description, requestCategory: s.requestCategory, requiresApproval: !!s.requiresApproval,
});
