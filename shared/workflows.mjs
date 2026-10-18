/**
 * State machine per praktik. Setiap workflow:
 *  - transitions: status asal -> daftar status tujuan yang diizinkan
 *  - guards[to](doc, user, ctx): kembalikan pesan error (string) bila transisi tidak boleh
 *  - onEnter[to](doc, user, now): efek samping saat masuk ke status
 */
import { hasRole } from './roles.mjs';

const same = (a, b) => a && b && String(a._id || a) === String(b._id || b);
const requireFields = (doc, fields) => {
  const missing = fields.filter(([f]) => doc[f] === undefined || doc[f] === null || doc[f] === '');
  return missing.length ? `Wajib diisi: ${missing.map(([, label]) => label).join(', ')}` : null;
};

const incident = {
  transitions: {
    new: ['assigned', 'in_progress', 'cancelled'],
    assigned: ['in_progress', 'pending', 'resolved', 'cancelled'],
    in_progress: ['pending', 'resolved'],
    pending: ['in_progress', 'resolved'],
    resolved: ['closed', 'in_progress'],
    closed: [],
    cancelled: [],
  },
  guards: {
    assigned: (d) => requireFields(d, [['assignee', 'Assignee']]),
    in_progress: (d) => requireFields(d, [['assignee', 'Assignee']]),
    pending: (d) => requireFields(d, [['pendingReason', 'Alasan pending']]),
    resolved: (d) => requireFields(d, [['resolutionCode', 'Kode resolusi'], ['resolutionNotes', 'Catatan resolusi']]),
  },
  onEnter: {
    resolved: (d, u, now) => { d.resolvedAt = now; },
    closed: (d, u, now) => { d.closedAt = now; },
    in_progress: (d) => { d.resolvedAt = undefined; },
  },
};

const request = {
  transitions: {
    submitted: ['pending_approval', 'fulfilling', 'cancelled'],
    pending_approval: ['approved', 'rejected', 'cancelled'],
    approved: ['fulfilling'],
    rejected: [],
    fulfilling: ['fulfilled'],
    fulfilled: ['closed', 'fulfilling'],
    closed: [],
    cancelled: [],
  },
  guards: {
    fulfilling: (d) => (d.requiresApproval && !d.approvedAt ? 'Permintaan ini memerlukan persetujuan terlebih dahulu' : null),
    fulfilled: (d) => requireFields(d, [['fulfillmentNotes', 'Catatan pemenuhan']]),
  },
  onEnter: {
    approved: (d, u, now) => { d.approvedAt = now; d.approver = d.approver || u._id; },
    pending_approval: (d) => { if (!d.requiresApproval) d.requiresApproval = true; },
    fulfilled: (d, u, now) => { d.resolvedAt = now; },
    closed: (d, u, now) => { d.closedAt = now; },
  },
};

const problem = {
  transitions: {
    new: ['investigating', 'closed'],
    investigating: ['known_error', 'resolved'],
    known_error: ['resolved', 'investigating'],
    resolved: ['closed', 'investigating'],
    closed: [],
  },
  guards: {
    investigating: (d) => requireFields(d, [['assignee', 'Assignee']]),
    known_error: (d) => requireFields(d, [['workaround', 'Workaround']]),
    resolved: (d) => requireFields(d, [['rootCause', 'Root cause'], ['permanentFix', 'Permanent fix']]),
  },
  onEnter: {
    known_error: (d) => { d.knownError = true; },
    resolved: (d, u, now) => { d.resolvedAt = now; },
    closed: (d, u, now) => { d.closedAt = now; },
  },
};

const change = {
  transitions: {
    draft: ['submitted', 'cancelled'],
    submitted: ['assessment', 'draft', 'cancelled'],
    assessment: ['cab_review', 'approved', 'draft', 'cancelled'],
    cab_review: ['approved', 'rejected'],
    approved: ['scheduled', 'cancelled'],
    rejected: ['draft'],
    scheduled: ['implementing', 'cancelled'],
    implementing: ['review'],
    review: ['closed'],
    closed: [],
    cancelled: [],
  },
  guards: {
    submitted: (d) => {
      const err = requireFields(d, [
        ['implementationPlan', 'Rencana implementasi'],
        ['backoutPlan', 'Rencana backout/rollback'],
        ['plannedStart', 'Jadwal mulai'],
        ['plannedEnd', 'Jadwal selesai'],
      ]);
      if (err) return err;
      if (new Date(d.plannedEnd) <= new Date(d.plannedStart)) return 'Jadwal selesai harus setelah jadwal mulai';
      return null;
    },
    assessment: (d, u) => (hasRole(u, ['change_manager']) ? null : 'Hanya Change Manager yang dapat melakukan assessment'),
    cab_review: (d) => (d.type === 'standard' ? 'Standard change sudah pre-approved, tidak perlu CAB' : null),
    approved: (d, u, ctx) => {
      if (ctx?.viaApproval) return null;
      if (d.type === 'standard') return hasRole(u, ['change_manager']) ? null : 'Hanya Change Manager';
      if (d.type === 'emergency') {
        if (!hasRole(u, ['change_manager'])) return 'Emergency change disetujui oleh Change Manager (ECAB)';
        if (same(d.requester, u) || same(d.createdBy, u)) return 'Segregation of duties: pemohon tidak boleh menyetujui change-nya sendiri';
        return null;
      }
      return 'Normal change harus disetujui melalui CAB (gunakan tombol Approve/Reject)';
    },
    rejected: (d, u, ctx) => (ctx?.viaApproval ? null : 'Gunakan tombol Approve/Reject CAB'),
    implementing: (d, u) => (hasRole(u, ['change_manager', 'technician']) ? null : 'Tidak berwenang mengimplementasikan'),
    closed: (d) => requireFields(d, [['outcome', 'Hasil implementasi'], ['pirNotes', 'Catatan Post Implementation Review']]),
  },
  onEnter: {
    cab_review: (d) => { d.requiredApprovals = d.risk === 'high' ? 2 : 1; },
    implementing: (d, u, now) => { d.actualStart = now; },
    review: (d, u, now) => { d.actualEnd = now; },
    closed: (d, u, now) => { d.closedAt = now; },
  },
};

const knowledge = {
  transitions: {
    draft: ['review'],
    review: ['published', 'draft'],
    published: ['retired', 'draft'],
    retired: ['draft'],
  },
  guards: {
    published: (d, u) => {
      if (!hasRole(u, ['knowledge_manager'])) return 'Hanya Knowledge Manager yang dapat mempublikasikan';
      if (same(d.author, u) || same(d.createdBy, u)) return 'Segregation of duties: artikel harus direview oleh orang lain';
      return null;
    },
  },
  onEnter: {
    published: (d, u, now) => {
      d.publishedAt = now;
      d.reviewer = u._id;
      d.reviewDue = new Date(now.getTime() + 365 * 24 * 3600 * 1000);
    },
  },
};

const risk = {
  transitions: {
    identified: ['assessed', 'closed'],
    assessed: ['treating', 'pending_approval', 'monitoring', 'closed'],
    treating: ['monitoring', 'pending_approval'],
    pending_approval: ['monitoring', 'assessed'],
    monitoring: ['treating', 'closed'],
    closed: ['identified'],
  },
  guards: {
    pending_approval: (d) => (d.treatment !== 'accept' ? 'Persetujuan penerimaan risiko hanya untuk strategi "Terima"' : requireFields(d, [['acceptanceRationale', 'Alasan penerimaan risiko'], ['reviewDate', 'Tanggal review']])),
    assessed: (d) => requireFields(d, [['owner', 'Risk owner'], ['likelihood', 'Likelihood'], ['impact', 'Impact']]),
    treating: (d) => requireFields(d, [['treatment', 'Strategi penanganan'], ['treatmentPlan', 'Rencana penanganan']]),
    closed: (d) => (d.treatment === 'accept' || d.residualScore ? null : 'Isi residual risk atau terima risiko (accept) sebelum menutup'),
  },
};

const project = {
  transitions: {
    initiating: ['planning', 'cancelled'],
    planning: ['executing', 'on_hold', 'cancelled'],
    executing: ['monitoring', 'closing', 'on_hold', 'cancelled'],
    monitoring: ['executing', 'closing', 'on_hold'],
    on_hold: ['planning', 'executing', 'cancelled'],
    closing: ['closed'],
    closed: [],
    cancelled: [],
  },
  guards: {
    planning: (d) => requireFields(d, [['manager', 'Project manager'], ['objectives', 'Tujuan proyek (project charter)']]),
    executing: (d) => requireFields(d, [['scope', 'Ruang lingkup'], ['startDate', 'Tanggal mulai'], ['endDate', 'Tanggal selesai']]),
    closed: (d) => requireFields(d, [['lessonsLearned', 'Lessons learned']]),
  },
  onEnter: { closed: (d) => { d.percentComplete = 100; } },
};

const sprint = {
  transitions: { planned: ['active'], active: ['completed'], completed: [] },
  guards: {
    active: (d) => requireFields(d, [['goal', 'Sprint goal'], ['startDate', 'Tanggal mulai'], ['endDate', 'Tanggal selesai']]),
    completed: (d) => requireFields(d, [['reviewNotes', 'Catatan Sprint Review'], ['retrospectiveNotes', 'Catatan Retrospective']]),
  },
};

/**
 * Bangun state machine dari spesifikasi deklaratif:
 *  transitions, required {to: [[field,label]]}, roles {to: [peran]}, sod {to: [field user yang tidak boleh sama]},
 *  stamp {to: field} (tanggal/aktor otomatis), viaEffect [status yang hanya diset efek sistem].
 */
export function fromSpec(spec) {
  const guards = {};
  const onEnter = {};
  const targets = new Set(Object.values(spec.transitions).flat());
  for (const to of targets) {
    guards[to] = (d, u, ctx) => {
      if (spec.viaEffect?.includes(to) && !ctx?.viaEffect) return 'Status ini diperbarui otomatis oleh sistem';
      if (spec.roles?.[to] && !hasRole(u, spec.roles[to])) return `Hanya peran ${spec.roles[to].join(' / ')} yang dapat melakukan langkah ini`;
      for (const f of spec.sod?.[to] || []) if (same(d[f], u)) return 'Segregation of duties: langkah ini harus dilakukan oleh orang lain';
      return spec.required?.[to] ? requireFields(d, spec.required[to]) : null;
    };
    if (spec.stamp?.[to]) {
      const f = spec.stamp[to];
      onEnter[to] = (d, u, now) => { d[f] = f.endsWith('By') ? u._id : now; };
    }
  }
  return { transitions: spec.transitions, guards, onEnter, canOwner: spec.canOwner };
}

// ---- Workflow end-to-end untuk modul yang sebelumnya hanya berupa status bebas ----
const vendor = fromSpec({
  transitions: {
    prospect: ['due_diligence'], due_diligence: ['pending_approval', 'prospect'], pending_approval: ['active', 'rejected'], rejected: ['prospect'],
    active: ['under_review', 'terminated'], under_review: ['active', 'terminated'], terminated: [],
  },
  required: {
    pending_approval: [['dueDiligenceDate', 'Tanggal due diligence'], ['dueDiligenceResult', 'Hasil due diligence'], ['riskRating', 'Peringkat risiko']],
    terminated: [['exitStrategy', 'Exit strategy']],
  },
});
const vendorPending = vendor.guards.pending_approval;
vendor.guards.pending_approval = (d, u, ctx) =>
  vendorPending(d, u, ctx) ||
  (d.dueDiligenceResult === 'failed' ? 'Vendor tidak lulus due diligence' : null) ||
  (['critical', 'high'].includes(d.criticality) && !d.exitStrategy ? 'Vendor kritikal/tinggi wajib memiliki exit strategy' : null) ||
  (d.dataLocation && !/indonesia/i.test(d.dataLocation) && !d.offshoreApproval ? 'Data di luar Indonesia: isi referensi persetujuan penempatan di luar negeri' : null);

const asset = fromSpec({
  transitions: {
    requested: ['ordered'], ordered: ['in_stock'], in_stock: ['deployed', 'retired'], deployed: ['in_repair', 'in_stock', 'retired'],
    in_repair: ['deployed', 'retired'], retired: ['pending_approval', 'in_stock'], pending_approval: ['disposed', 'retired'], disposed: [],
  },
  required: {
    deployed: [['assignedTo', 'Pengguna / pemegang aset']],
    pending_approval: [['disposalMethod', 'Metode disposal'], ['disposalCertificate', 'No. sertifikat sanitasi/pemusnahan']],
  },
  stamp: { disposed: 'disposalDate' },
});

const configurationItem = fromSpec({
  transitions: { planned: ['in_build', 'active'], in_build: ['active'], active: ['maintenance', 'retired'], maintenance: ['active', 'retired'], retired: [] },
  required: { active: [['owner', 'Pemilik CI'], ['environment', 'Environment']] },
});

const continuity = fromSpec({
  transitions: {
    draft: ['review'], review: ['pending_approval', 'draft'], pending_approval: ['approved', 'draft'], approved: ['needs_update', 'retired'],
    tested: ['needs_update', 'retired'], needs_update: ['review'], retired: [],
  },
  required: { review: [['owner', 'Pemilik'], ['rtoHours', 'RTO'], ['rpoHours', 'RPO'], ['description', 'Ruang lingkup / prosedur']] },
});

const architecture = fromSpec({
  transitions: { draft: ['review'], review: ['pending_approval', 'draft'], pending_approval: ['approved', 'draft'], approved: ['deprecated', 'review'], deprecated: [] },
  required: { review: [['owner', 'Pemilik'], ['description', 'Deskripsi']] },
});

const workflows = { incident, request, problem, change, knowledge, risk, project, sprint, vendor, asset, configurationItem, continuity, architecture };

/**
 * Validasi transisi. Bila workflow memiliki kebijakan persetujuan (workflow.approval), keputusan
 * keluar dari status persetujuan hanya boleh melalui mesin persetujuan (ctx.viaApproval).
 */
function checkTransition(workflow, doc, to, user, ctx) {
  const from = doc.status;
  const allowed = workflow.transitions[from] || [];
  if (!allowed.includes(to)) return `Transisi ${from} → ${to} tidak diizinkan`;
  const a = workflow.approval;
  if (a && from === a.status && [a.approved, a.rejected].includes(to) && !ctx?.viaApproval) {
    return 'Keputusan diambil melalui panel persetujuan (Setujui / Tolak)';
  }
  const guard = workflow.guards?.[to];
  return guard ? guard(doc, user, ctx) : null;
}

export { workflows, checkTransition };
