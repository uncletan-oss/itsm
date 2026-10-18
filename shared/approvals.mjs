/**
 * Mesin persetujuan generik multi-tahap.
 * Kebijakan per resource: record yang masuk ke `status` memerlukan persetujuan berurutan per `steps`.
 *  step: { name, roles?: [peran], field?: 'approver' (user yang ditunjuk di record), min?: n | (doc)=>n, when?: (doc)=>bool }
 *  sod: field user yang tidak boleh menyetujui (pembuat/pemohon) — maker-checker.
 *  Satu orang hanya boleh memberi satu keputusan per putaran (approvalRound); penolakan menutup putaran.
 */
import { hasRole } from './roles.mjs';

const id = (v) => (v && typeof v === 'object' ? String(v._id) : v ? String(v) : null);
const big = (n) => (d) => Number(d.total ?? d.amount ?? d.value ?? 0) >= n;

export const APPROVALS = {
  changes: {
    status: 'cab_review', approved: 'approved', rejected: 'rejected', sod: ['requester', 'createdBy', 'assignee'], label: 'Change Advisory Board',
    steps: [{ name: 'CAB', roles: ['cab_member', 'change_manager'], min: (d) => (d.risk === 'high' ? 2 : 1) }],
  },
  requests: {
    status: 'pending_approval', approved: 'approved', rejected: 'rejected', sod: ['requester', 'createdBy'], label: 'Persetujuan permintaan',
    steps: [{ name: 'Atasan / approver', field: 'approver', roles: ['service_desk'] }],
  },
  vendors: {
    status: 'pending_approval', approved: 'active', rejected: 'rejected', sod: ['createdBy'], label: 'Onboarding vendor',
    steps: [
      { name: 'Procurement / Vendor Manager', roles: ['vendor_manager'] },
      { name: 'Risk & Compliance', roles: ['risk_officer'] },
      { name: 'CISO (vendor kritikal)', roles: ['security_officer'], when: (d) => ['critical', 'high'].includes(d.criticality) },
      { name: 'Eksekutif (data di luar negeri)', roles: ['executive'], when: (d) => !!d.dataLocation && !/indonesia/i.test(d.dataLocation) },
    ],
  },
  contracts: {
    status: 'pending_approval', approved: 'active', rejected: 'rejected', sod: ['createdBy'], label: 'Persetujuan kontrak',
    steps: [
      { name: 'Vendor Manager', roles: ['vendor_manager'] },
      { name: 'Risk & Compliance', roles: ['risk_officer'] },
      { name: 'Eksekutif (≥ Rp 1 M / material)', roles: ['executive'], when: (d) => big(1e9)(d) || !!d.material },
    ],
  },
  assets: {
    status: 'pending_approval', approved: 'disposed', rejected: 'retired', sod: ['createdBy'], label: 'Persetujuan disposal aset',
    steps: [{ name: 'Asset Manager', roles: ['asset_manager'] }, { name: 'CISO (sanitasi data)', roles: ['security_officer'] }],
  },
  continuity: {
    status: 'pending_approval', approved: 'approved', rejected: 'draft', sod: ['createdBy'], label: 'Pengesahan BCP/DRP',
    steps: [{ name: 'BCM Coordinator', roles: ['bcm_manager'] }, { name: 'Eksekutif', roles: ['executive'] }],
  },
  architecture: {
    status: 'pending_approval', approved: 'approved', rejected: 'draft', sod: ['owner', 'createdBy'], label: 'Architecture Review Board',
    steps: [
      { name: 'Architecture Review Board', roles: ['architect'] },
      { name: 'CIO (target state / investasi)', roles: ['executive'], when: (d) => d.state === 'target' || d.lifecycle === 'invest' },
    ],
  },
  risks: {
    status: 'pending_approval', approved: 'monitoring', rejected: 'assessed', sod: [], label: 'Penerimaan risiko (risk acceptance)',
    steps: [
      { name: 'Risk owner', field: 'owner' },
      { name: 'Risk Officer / CRO', roles: ['risk_officer'] },
      { name: 'Eksekutif (risiko tinggi/kritis)', roles: ['executive'], when: (d) => ['high', 'critical'].includes(d.inherentLevel) },
    ],
  },
  budgets: {
    status: 'pending_approval', approved: 'active', rejected: 'rejected', sod: ['createdBy'], label: 'Pengesahan anggaran',
    steps: [{ name: 'IT Controller', roles: ['finance_manager'] }, { name: 'CIO / Direksi', roles: ['executive'] }],
  },
  'purchase-orders': {
    status: 'pending_approval', approved: 'approved', rejected: 'rejected', sod: ['createdBy', 'requester'], label: 'Persetujuan PO',
    steps: [
      { name: 'Procurement', roles: ['vendor_manager'] },
      { name: 'IT Controller (cek anggaran)', roles: ['finance_manager'] },
      { name: 'CIO / Direksi (≥ Rp 500 jt)', roles: ['executive'], when: big(5e8) },
    ],
  },
  invoices: {
    status: 'pending_approval', approved: 'approved', rejected: 'rejected', sod: ['createdBy'], label: 'Persetujuan tagihan',
    steps: [{ name: 'Accounts Payable', roles: ['accountant'] }, { name: 'IT Controller (≥ Rp 100 jt)', roles: ['finance_manager'], when: big(1e8) }],
  },
  payments: {
    status: 'pending_approval', approved: 'approved', rejected: 'rejected', sod: ['createdBy'], label: 'Persetujuan pembayaran (maker-checker)',
    steps: [{ name: 'Treasury', roles: ['treasurer'] }, { name: 'Finance Manager (≥ Rp 100 jt)', roles: ['finance_manager'], when: big(1e8) }],
  },
  journals: {
    status: 'pending_approval', approved: 'posted', rejected: 'rejected', sod: ['createdBy'], label: 'Posting jurnal manual',
    steps: [{ name: 'Finance Manager', roles: ['finance_manager'] }],
  },
  'control-tests': {
    status: 'pending_approval', approved: 'concluded', rejected: 'in_progress', sod: ['tester', 'createdBy'], label: 'Review independen pengujian',
    steps: [{ name: 'Reviewer (Audit / Risk)', roles: ['auditor', 'risk_officer'] }],
  },
  findings: {
    status: 'pending_approval', approved: 'closed', rejected: 'in_remediation', sod: ['owner'], label: 'Validasi penutupan temuan',
    steps: [{ name: 'Validasi auditor', roles: ['auditor'] }, { name: 'Eksekutif (temuan kritis)', roles: ['executive'], when: (d) => d.severity === 'critical' }],
  },
  bia: {
    status: 'pending_approval', approved: 'approved', rejected: 'review', sod: ['createdBy'], label: 'Pengesahan BIA',
    steps: [{ name: 'Pemilik proses', field: 'processOwner' }, { name: 'BCM Coordinator', roles: ['bcm_manager'] }],
  },
  'dr-tests': {
    status: 'pending_approval', approved: 'approved', rejected: 'planned', sod: ['createdBy'], label: 'Persetujuan rencana uji DR',
    steps: [
      { name: 'BCM Coordinator', roles: ['bcm_manager'] },
      { name: 'Eksekutif (failover penuh / aktivasi)', roles: ['executive'], when: (d) => ['full_failover', 'actual_invocation'].includes(d.testType) },
    ],
  },
  'dc-access': {
    status: 'pending_approval', approved: 'approved', rejected: 'rejected', sod: ['createdBy'], label: 'Izin akses data center',
    steps: [{ name: 'Data Center Manager', roles: ['dc_manager'] }, { name: 'Keamanan informasi (pihak luar)', roles: ['security_officer'], when: (d) => d.visitorType !== 'employee' }],
  },
  initiatives: {
    status: 'pending_approval', approved: 'approved', rejected: 'rejected', sod: ['createdBy'], label: 'IT Steering Committee',
    steps: [{ name: 'Enterprise Architect', roles: ['architect'] }, { name: 'Finance (estimasi biaya)', roles: ['finance_manager'], when: big(1e9) }, { name: 'IT Steering Committee', roles: ['executive'] }],
  },
};

const need = (step, doc) => (typeof step.min === 'function' ? step.min(doc) : step.min || 1);

/** Ringkasan progres persetujuan untuk ditampilkan & dievaluasi. */
export function approvalProgress(policy, doc) {
  const round = doc.approvalRound || 1;
  const decisions = (doc.approvals || []).filter((a) => (a.round || 1) === round);
  const steps = policy.steps.filter((s) => !s.when || s.when(doc)).map((s) => {
    const approved = decisions.filter((a) => a.step === s.name && a.decision === 'approved');
    return { name: s.name, roles: s.roles || [], field: s.field, required: need(s, doc), approved: approved.length, approvers: approved.map((a) => a.approverName), done: approved.length >= need(s, doc) };
  });
  const current = steps.find((s) => !s.done) || null;
  return { label: policy.label, round, steps, current, complete: !current, rejected: decisions.some((a) => a.decision === 'rejected'), decisions };
}

/** Apakah user boleh memutuskan langkah saat ini? Mengembalikan pesan error atau null. */
export function approvalError(policy, doc, user) {
  if (doc.status !== policy.status) return 'Record tidak sedang menunggu persetujuan';
  const p = approvalProgress(policy, doc);
  if (!p.current) return 'Semua tahap persetujuan sudah selesai';
  if (policy.sod.some((f) => id(doc[f]) && id(doc[f]) === id(user._id))) return 'Segregation of duties: pembuat/pemohon tidak boleh menyetujui record ini';
  if (p.decisions.some((a) => id(a.approver) === id(user._id))) return 'Anda sudah memberikan keputusan pada putaran ini';
  const step = policy.steps.find((s) => s.name === p.current.name);
  const designated = step.field && id(doc[step.field]);
  const eligible = designated ? designated === id(user._id) || hasRole(user, ['admin']) : hasRole(user, step.roles || []);
  if (!eligible) return `Tahap "${step.name}" harus diputuskan oleh ${designated ? 'orang yang ditunjuk' : (step.roles || []).join(' / ')}`;
  return null;
}

/** Catat keputusan. Mengembalikan { record, outcome: 'approved' | 'rejected' | 'pending', next } */
export function decide(policy, doc, user, decision, comment) {
  const p = approvalProgress(policy, doc);
  const record = {
    step: p.current.name, decision: decision === 'rejected' ? 'rejected' : 'approved', comment,
    approver: user._id, approverName: user.name, round: p.round, at: new Date().toISOString(),
  };
  doc.approvals = [...(doc.approvals || []), record];
  if (record.decision === 'rejected') return { record, outcome: 'rejected' };
  const after = approvalProgress(policy, doc);
  return { record, outcome: after.complete ? 'approved' : 'pending', next: after.current };
}

/** Saat record (kembali) masuk ke status persetujuan, mulai putaran baru. */
export function startRound(policy, doc, to) {
  if (policy && to === policy.status) doc.approvalRound = (doc.approvalRound || 0) + 1;
}

/** Penerima notifikasi untuk tahap tertentu: { roles } atau { userIds }. */
export function stepAudience(policy, doc, stepName) {
  const step = policy.steps.find((s) => s.name === stepName);
  if (!step) return null;
  if (step.field && id(doc[step.field])) return { userIds: [id(doc[step.field])] };
  return { roles: step.roles || [] };
}
