// Label status & enum (Bahasa Indonesia + istilah ITIL)
export const STATUS_LABELS = {
  new: 'Baru', assigned: 'Ditugaskan', in_progress: 'Dikerjakan', pending: 'Pending', resolved: 'Selesai (Resolved)',
  closed: 'Ditutup', cancelled: 'Dibatalkan', submitted: 'Diajukan', pending_approval: 'Menunggu Persetujuan',
  approved: 'Disetujui', rejected: 'Ditolak', fulfilling: 'Diproses', fulfilled: 'Terpenuhi',
  investigating: 'Investigasi', known_error: 'Known Error', draft: 'Draft', assessment: 'Assessment',
  cab_review: 'CAB Review', scheduled: 'Terjadwal', implementing: 'Implementasi', review: 'Review (PIR)',
  published: 'Terbit', retired: 'Retired', identified: 'Teridentifikasi', assessed: 'Dinilai', treating: 'Penanganan',
  monitoring: 'Monitoring', initiating: 'Inisiasi', planning: 'Perencanaan', executing: 'Eksekusi', closing: 'Penutupan',
  on_hold: 'Ditunda', planned: 'Direncanakan', active: 'Aktif', completed: 'Selesai', backlog: 'Backlog', todo: 'To Do',
  done: 'Done', live: 'Live', pipeline: 'Pipeline', maintenance: 'Maintenance', requested: 'Diminta', ordered: 'Dipesan',
  in_stock: 'Di Gudang', deployed: 'Terpasang', in_repair: 'Perbaikan', disposed: 'Dimusnahkan', prospect: 'Prospek',
  onboarding: 'Onboarding', under_review: 'Dalam Review', terminated: 'Diputus', tested: 'Teruji', needs_update: 'Perlu Update',
  not_assessed: 'Belum Dinilai', not_implemented: 'Belum Diterapkan', partial: 'Sebagian', implemented: 'Diterapkan',
  not_applicable: 'Tidak Berlaku',
  due_diligence: 'Due Diligence', legal_review: 'Review Legal', renewal_review: 'Review Perpanjangan', expired: 'Berakhir',
  received: 'Diterima', verified: 'Terverifikasi', disputed: 'Sengketa', paid: 'Lunas', executed: 'Dieksekusi', reconciled: 'Direkonsiliasi',
  posted: 'Diposting', reversed: 'Dibalik', open: 'Terbuka', action_plan: 'Rencana Tindak Lanjut', in_remediation: 'Remediasi',
  concluded: 'Disimpulkan', commissioning: 'Commissioning', operational: 'Operasional', decommissioned: 'Dinonaktifkan', full: 'Penuh',
  checked_in: 'Check-in', checked_out: 'Check-out', proposed: 'Diusulkan', in_execution: 'Dieksekusi', delivered: 'Selesai Dikirim',
  pending_disposal: 'Menunggu Disposal', in_build: 'Pembangunan',
  suspended: 'Ditangguhkan', in_procurement: 'Dalam Pengadaan', evaluation: 'Evaluasi', awarded: 'Pemenang Ditetapkan', failed: 'Gagal',
  evaluated: 'Dievaluasi', lost: 'Tidak Terpilih', withdrawn: 'Ditarik', disqualified: 'Didiskualifikasi',
};

export const STATUS_TONE = {
  new: 'blue', submitted: 'blue', draft: 'gray', identified: 'blue', initiating: 'blue', planned: 'gray', backlog: 'gray', todo: 'gray',
  assigned: 'indigo', in_progress: 'indigo', investigating: 'indigo', fulfilling: 'indigo', assessment: 'indigo', implementing: 'indigo',
  executing: 'indigo', active: 'indigo', treating: 'indigo',
  pending: 'amber', pending_approval: 'amber', cab_review: 'amber', review: 'amber', known_error: 'amber', on_hold: 'amber',
  partial: 'amber', needs_update: 'amber', under_review: 'amber', in_repair: 'amber', not_assessed: 'gray',
  resolved: 'green', fulfilled: 'green', approved: 'green', published: 'green', done: 'green', completed: 'green',
  implemented: 'green', live: 'green', deployed: 'green', tested: 'green', scheduled: 'teal', monitoring: 'teal',
  closed: 'gray', cancelled: 'gray', retired: 'gray', disposed: 'gray', not_applicable: 'gray',
  rejected: 'red', not_implemented: 'red', terminated: 'red',
  due_diligence: 'indigo', legal_review: 'amber', renewal_review: 'amber', expired: 'gray', received: 'blue', verified: 'teal',
  disputed: 'red', paid: 'green', executed: 'teal', reconciled: 'green', posted: 'green', reversed: 'gray', open: 'blue',
  action_plan: 'indigo', in_remediation: 'amber', concluded: 'green', commissioning: 'indigo', operational: 'green',
  decommissioned: 'gray', full: 'amber', checked_in: 'indigo', checked_out: 'green', proposed: 'blue', in_execution: 'indigo',
  delivered: 'green', in_build: 'indigo',
  suspended: 'amber', in_procurement: 'indigo', evaluation: 'indigo', awarded: 'green', failed: 'red', evaluated: 'teal', lost: 'gray',
  withdrawn: 'gray', disqualified: 'red',
};

export const PRIORITY_LABELS = { 1: 'P1 - Kritis', 2: 'P2 - Tinggi', 3: 'P3 - Sedang', 4: 'P4 - Rendah' };
export const LEVEL_TONE = { critical: 'red', high: 'orange', medium: 'amber', low: 'green' };
export const SLA_LABELS = { on_track: 'On track', at_risk: 'At risk', breached: 'Breached', met: 'Terpenuhi', paused: 'Paused', none: '-' };
export const SLA_TONE = { on_track: 'green', at_risk: 'amber', breached: 'red', met: 'green', paused: 'gray', none: 'gray' };
