/**
 * Panduan alur kerja (untuk UI): arti tiap status, apa yang terjadi pada setiap transisi,
 * siapa yang boleh menjalankannya, data yang wajib diisi, persetujuan & otomatisasi sistem.
 * Disusun dari definisi workflow yang sama dengan server (shared/workflows.mjs, shared/modules.mjs, shared/approvals.mjs).
 */
import { workflows } from './workflows.mjs';
import { MODULE_DEFS } from './modules.mjs';
import { APPROVALS } from './approvals.mjs';
import { ROLES } from './roles.mjs';

/** Arti umum status (dipakai lintas modul; dapat ditimpa per modul di STATUS_HELP_BY). */
export const STATUS_HELP = {
  new: 'Baru dicatat dan belum ditangani.',
  assigned: 'Sudah ditugaskan ke penanggung jawab, menunggu mulai dikerjakan.',
  in_progress: 'Sedang dikerjakan oleh penanggung jawab.',
  pending: 'Ditunda sementara (menunggu pihak lain); SLA dijeda.',
  resolved: 'Sudah diselesaikan, menunggu konfirmasi / penutupan.',
  closed: 'Ditutup — proses selesai.',
  cancelled: 'Dibatalkan — tidak diproses lebih lanjut.',
  submitted: 'Sudah diajukan dan menunggu ditindaklanjuti.',
  draft: 'Masih berupa draf; dapat diubah sebelum diajukan.',
  pending_approval: 'Menunggu keputusan persetujuan sesuai tahapan di panel persetujuan.',
  approved: 'Sudah disetujui dan siap dilanjutkan.',
  rejected: 'Ditolak; perbaiki lalu ajukan ulang bila diperlukan.',
  fulfilling: 'Sedang dipenuhi oleh tim pelaksana.',
  fulfilled: 'Sudah dipenuhi, menunggu konfirmasi pemohon.',
  investigating: 'Analisis akar masalah (RCA) sedang berjalan.',
  known_error: 'Akar masalah diketahui dan workaround tersedia.',
  assessment: 'Sedang dinilai (risiko, dampak, kelayakan).',
  cab_review: 'Menunggu keputusan Change Advisory Board (CAB).',
  scheduled: 'Sudah dijadwalkan untuk diimplementasikan.',
  implementing: 'Implementasi sedang berlangsung.',
  review: 'Dalam tahap review.',
  published: 'Terbit / tayang dan dapat digunakan.',
  retired: 'Tidak digunakan lagi.',
  identified: 'Risiko teridentifikasi, belum dinilai.',
  assessed: 'Risiko sudah dinilai (likelihood × impact).',
  treating: 'Rencana penanganan risiko sedang dijalankan.',
  monitoring: 'Dipantau secara berkala.',
  active: 'Aktif digunakan.',
  expired: 'Masa berlaku berakhir.',
  terminated: 'Hubungan / kontrak diakhiri.',
  received: 'Diterima dan menunggu diverifikasi.',
  verified: 'Sudah diverifikasi.',
  disputed: 'Dalam sengketa — perlu klarifikasi dengan pihak terkait.',
  paid: 'Lunas dibayar.',
  executed: 'Sudah dieksekusi.',
  reconciled: 'Sudah direkonsiliasi dengan rekening koran.',
  posted: 'Sudah diposting ke buku besar.',
  reversed: 'Sudah dibalik dengan jurnal balik.',
  open: 'Terbuka, menunggu ditindaklanjuti.',
  completed: 'Selesai dikerjakan.',
  ordered: 'Sudah dipesan ke penyedia.',
  planned: 'Direncanakan.',
  on_hold: 'Ditunda sementara.',
  failed: 'Gagal — perlu diulang.',
  awarded: 'Pemenang telah ditetapkan.',
  evaluation: 'Penawaran dibuka dan sedang dievaluasi.',
  in_procurement: 'Sedang diproses pengadaan (PO / RFQ sudah terbit otomatis).',
  suspended: 'Ditangguhkan sementara.',
};

const STATUS_HELP_BY = {
  requisitions: { approved: 'Disetujui — sistem segera menerbitkan PO (item katalog) dan RFQ (item non-katalog).' },
  rfqs: { published: 'Diumumkan ke penyedia undangan; penawaran tersegel sampai batas waktu.', pending_approval: 'Usulan pemenang menunggu penetapan.' },
  quotations: { submitted: 'Penawaran masuk dan tersegel sampai pembukaan.', evaluated: 'Sudah dinilai (skor harga & teknis).', lost: 'Tidak terpilih sebagai pemenang.' },
  'catalog-items': { published: 'Tayang di E-Katalog dan dapat dibeli pengguna.' },
  'purchase-orders': { received: 'Barang/jasa diterima (BAST) — siap ditagihkan.' },
  invoices: { verified: '3-way match (PO – penerimaan – tagihan) sudah cocok.' },
  findings: { action_plan: 'Manajemen telah menyusun rencana tindak lanjut.', in_remediation: 'Remediasi sedang dikerjakan pemilik.' },
};

/** Field wajib untuk workflow lama (label sama dengan pesan validasi server). */
const LEGACY_REQUIRED = {
  incidents: { assigned: ['Assignee'], in_progress: ['Assignee'], pending: ['Alasan pending'], resolved: ['Kode resolusi', 'Catatan resolusi'] },
  requests: { fulfilled: ['Catatan pemenuhan'] },
  problems: { investigating: ['Assignee'], known_error: ['Workaround'], resolved: ['Root cause', 'Permanent fix'] },
  changes: { submitted: ['Rencana implementasi', 'Rencana backout', 'Jadwal mulai & selesai'], closed: ['Hasil implementasi', 'Catatan PIR'] },
  risks: { assessed: ['Risk owner', 'Likelihood', 'Impact'], treating: ['Strategi & rencana penanganan'], pending_approval: ['Strategi "Terima"', 'Alasan penerimaan', 'Tanggal review'] },
  projects: { planning: ['Project manager', 'Tujuan proyek'], executing: ['Ruang lingkup', 'Tanggal mulai & selesai'], closed: ['Lessons learned'] },
  sprints: { active: ['Sprint goal', 'Tanggal mulai & selesai'], completed: ['Catatan Sprint Review & Retrospective'] },
};
const LEGACY_ROLES = {
  changes: { assessment: ['change_manager'], implementing: ['change_manager', 'technician'] },
  knowledge: { published: ['knowledge_manager'] },
};
const LEGACY_WF = {
  incidents: 'incident', requests: 'request', problems: 'problem', changes: 'change', knowledge: 'knowledge', risks: 'risk', projects: 'project', sprints: 'sprint',
  vendors: 'vendor', assets: 'asset', 'configuration-items': 'configurationItem', continuity: 'continuity', architecture: 'architecture',
};

/** Apa yang terjadi saat transisi (efek otomatis & aturan penting). */
const ACTION_HINTS = {
  incidents: { resolved: 'Waktu penyelesaian dicatat untuk SLA; pemohon dapat menutup atau membuka kembali.', pending: 'Jam SLA dijeda sampai dilanjutkan.' },
  requests: { pending_approval: 'Diteruskan ke approver yang ditunjuk (bukan pemohon).', fulfilling: 'Tim mulai memenuhi permintaan.' },
  problems: { known_error: 'Ditandai sebagai known error — workaround dapat diterbitkan ke knowledge base.' },
  changes: { submitted: 'Diajukan ke Change Manager untuk assessment.', cab_review: 'Masuk agenda CAB (risiko tinggi butuh 2 persetujuan).', approved: 'Standard/emergency change disetujui Change Manager.', implementing: 'Waktu mulai aktual dicatat.', review: 'Post Implementation Review (PIR) dilakukan.' },
  knowledge: { review: 'Diajukan ke Knowledge Manager; penulis tidak boleh menerbitkan artikelnya sendiri.', published: 'Artikel tayang di portal/situs bantuan; jadwal review tahunan dibuat.' },
  vendors: { pending_approval: 'Masuk persetujuan berjenjang: Procurement → Risk → CISO/Eksekutif sesuai kritikalitas.' },
  'purchase-orders': { pending_approval: 'Sistem mengecek sisa anggaran (commitment control) sebelum persetujuan.', approved: 'Nilai PO tercatat sebagai komitmen anggaran.', received: 'Berita acara penerimaan menjadi dasar 3-way match tagihan.' },
  invoices: { verified: 'Sistem menjalankan 3-way match otomatis (PO – penerimaan – nilai tagihan).', pending_approval: 'Diteruskan ke AP & Controller (≥ Rp 100 jt).' },
  payments: { pending_approval: 'Maker-checker: pembuat tidak boleh menyetujui.', executed: 'Jurnal pembayaran dibuat otomatis; tagihan menjadi lunas bila terbayar penuh.' },
  journals: { pending_approval: 'Debit harus sama dengan kredit.', reversed: 'Jurnal balik dibuat otomatis.' },
  'catalog-items': { pending_approval: 'Dicek: kontrak payung aktif milik penyedia yang sama & masa berlaku harga.', draft: 'Item ditarik dari etalase untuk revisi harga/spesifikasi lalu diajukan ulang.' },
  requisitions: { pending_approval: 'Harga dikunci ke harga katalog terbit; minimum order & anggaran dicek.' },
  rfqs: { published: 'Undangan dikirim ke penyedia (min. 3; penunjukan langsung wajib justifikasi).', evaluation: 'Penawaran dibuka & skor dihitung otomatis; penawaran di atas HPS gugur.', pending_approval: 'Usulan pemenang diajukan ke panitia & Controller.', failed: 'Tender gagal — dapat diulang dari draf.' },
  quotations: { withdrawn: 'Penawaran ditarik sebelum pembukaan.', disqualified: 'Penawaran tidak diikutkan evaluasi.' },
  'control-tests': { pending_approval: 'Hasil uji direview pihak independen (≠ penguji).' },
  findings: { pending_approval: 'Auditor memvalidasi bukti remediasi sebelum temuan ditutup.' },
  'risk-actions': { verified: 'Diverifikasi pihak independen (≠ penanggung jawab).' },
  'dr-tests': { executed: 'RTO/RPO aktual dibandingkan dengan target.', reported: 'Rencana BCP/DRP diperbarui; temuan dibuat otomatis bila target terlampaui.' },
  'dc-access': { checked_in: 'Identitas pengunjung wajib diverifikasi.' },
  initiatives: { in_execution: 'Inisiatif dijalankan sebagai proyek.' },
};

/** Efek otomatis yang terjadi ketika masuk status tertentu (ditampilkan sebagai "Otomatis"). */
const AUTO_EFFECTS = {
  'purchase-orders': { approved: 'Komitmen anggaran diperbarui.' },
  invoices: { approved: 'Jurnal pengakuan utang dibuat otomatis.' },
  payments: { executed: 'Jurnal pembayaran & status lunas tagihan.' },
  journals: { reversed: 'Jurnal balik.' },
  'control-tests': { concluded: 'Status kontrol diperbarui; temuan dibuat bila tidak efektif.' },
  'dr-tests': { reported: 'Rencana BCP/DRP diperbarui; temuan bila RTO/RPO terlampaui.' },
  requisitions: { approved: 'PO per penyedia (item katalog) & RFQ (item non-katalog) diterbitkan otomatis.' },
  rfqs: { evaluation: 'Skor & peringkat penawaran dihitung otomatis.', awarded: 'PO untuk pemenang diterbitkan otomatis.' },
};

const NEGATIVE = ['cancelled', 'rejected', 'withdrawn', 'disqualified', 'failed', 'suspended', 'terminated', 'retired', 'disputed', 'expired', 'reversed', 'deprecated'];
export const isNegative = (to) => NEGATIVE.includes(to);

function specFor(resource) {
  const def = MODULE_DEFS[resource];
  if (def?.workflow) return { ...def.workflow, flow: def.statusFlow };
  const wf = workflows[LEGACY_WF[resource]];
  if (!wf) return null;
  return {
    transitions: wf.transitions, ...(wf.spec || {}),
    required: wf.spec?.required || null, legacyRequired: LEGACY_REQUIRED[resource], roles: { ...(wf.spec?.roles || {}), ...(LEGACY_ROLES[resource] || {}) },
  };
}

/** Informasi lengkap satu transisi from → to. */
export function transitionInfo(resource, from, to) {
  const spec = specFor(resource);
  if (!spec) return null;
  const policy = APPROVALS[resource];
  const required = spec.required?.[to]?.map(([, l]) => l) || spec.legacyRequired?.[to] || [];
  const roles = spec.roles?.[to] || [];
  const auto = !!spec.viaEffect?.includes(to);
  const viaApproval = !!policy && from === policy.status && [policy.approved, policy.rejected].includes(to);
  const startsApproval = !!policy && to === policy.status;
  return {
    from, to, required, auto, viaApproval, startsApproval, negative: isNegative(to),
    roles: roles.map((r) => ROLES[r] || r),
    owner: !!spec.canOwner?.includes(to),
    sod: (spec.sod?.[to] || []).length > 0,
    hint: ACTION_HINTS[resource]?.[to] || null,
    effect: AUTO_EFFECTS[resource]?.[to] || null,
    approval: startsApproval ? { label: policy.label, steps: policy.steps.map((s) => ({ name: s.name, who: s.field ? 'penyetuju yang ditunjuk' : (s.roles || []).map((r) => ROLES[r] || r).join(' / '), conditional: !!s.when })) } : null,
  };
}

export const statusHelp = (resource, status) => STATUS_HELP_BY[resource]?.[status] || STATUS_HELP[status] || '';

/** Panduan alur lengkap untuk modul: daftar status (alur utama dulu) beserta transisi keluar. */
export function workflowGuide(resource, flow) {
  const spec = specFor(resource);
  if (!spec) return null;
  const main = flow || spec.flow || Object.keys(spec.transitions);
  const all = [...new Set([...main, ...Object.keys(spec.transitions), ...Object.values(spec.transitions).flat()])];
  const policy = APPROVALS[resource];
  return {
    main,
    statuses: all.map((s) => ({
      status: s, main: main.includes(s), help: statusHelp(resource, s), final: !(spec.transitions[s] || []).length,
      next: (spec.transitions[s] || []).map((to) => transitionInfo(resource, s, to)),
    })),
    approval: policy ? { label: policy.label, status: policy.status, approved: policy.approved, rejected: policy.rejected, sod: policy.sod.length > 0, steps: transitionInfo(resource, null, policy.status).approval.steps } : null,
  };
}
