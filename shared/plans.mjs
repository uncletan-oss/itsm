/**
 * Paket langganan SaaS — modul default & batas pengguna per tenant.
 * Operator platform dapat menimpa daftar modul per tenant (Tenant.modules) dan batas pengguna (Tenant.maxUsers).
 */
export const DOMAINS = {
  core: { name: 'IT Service Management', modules: ['incidents', 'requests', 'problems', 'changes', 'knowledge', 'services', 'sla-policies', 'configuration-items', 'assets'] },
  grc: { name: 'GRC & Assurance', modules: ['vendors', 'contracts', 'risks', 'risk-actions', 'controls', 'control-tests', 'findings'] },
  bcm: { name: 'Ketahanan (BCM & DR)', modules: ['bia', 'continuity', 'dr-tests'] },
  dcim: { name: 'Data Center (DCIM)', modules: ['datacenters', 'racks', 'dc-access'] },
  procurement: { name: 'E-Procurement', modules: ['catalog-items', 'requisitions', 'rfqs', 'quotations'] },
  finance: { name: 'Keuangan TI (ITFM)', modules: ['budgets', 'purchase-orders', 'invoices', 'payments', 'journals'] },
  planning: { name: 'Arsitektur & Perencanaan', modules: ['initiatives', 'architecture', 'projects', 'sprints', 'backlog'] },
};
const CORE = DOMAINS.core.modules;
const GRC = [...DOMAINS.grc.modules, ...DOMAINS.bcm.modules];
const EA = [...DOMAINS.dcim.modules, ...DOMAINS.procurement.modules, ...DOMAINS.finance.modules, ...DOMAINS.planning.modules];
export const ALL_MODULES = Object.values(DOMAINS).flatMap((d) => d.modules);

export const PLANS = {
  starter: {
    name: 'Starter', price: 'Rp 1,5 jt / bulan', maxUsers: 15, modules: CORE,
    summary: 'Service desk ITIL 4 inti untuk tim TI yang sedang bertumbuh.',
    features: ['Incident, request, problem & change', 'Service catalog & SLA', 'CMDB & aset TI', 'Knowledge base & situs bantuan publik'],
  },
  professional: {
    name: 'Professional', price: 'Rp 6 jt / bulan', maxUsers: 100, modules: [...CORE, ...GRC],
    summary: 'ITSM + GRC, assurance & ketahanan untuk industri teregulasi.',
    features: ['Semua fitur Starter', 'Risiko, mitigasi, pengujian kontrol & temuan audit', 'Vendor & kontrak penyedia jasa TI', 'BIA, BCP/DRP & uji DR'],
  },
  enterprise: {
    name: 'Enterprise', price: 'Hubungi kami', maxUsers: null, modules: [...CORE, ...GRC, ...EA],
    summary: 'Platform lengkap: ITSM, GRC, DCIM, keuangan TI, arsitektur & portofolio.',
    features: ['Semua fitur Professional', 'E-Procurement: e-katalog, permintaan pembelian, RFQ/tender & evaluasi penawaran', 'Keuangan TI: anggaran, PO, tagihan, pembayaran, jurnal', 'DCIM: data center, rak & akses fisik', 'Perencanaan TI, TOGAF, proyek & Scrum'],
  },
};

export const PLAN_KEYS = Object.keys(PLANS);

export const RESERVED_SLUGS = ['www', 'api', 'admin', 'app', 'portal', 'platform', 'public', 'status', 'help', 'signup', 'login', 't'];
export const SLUG_RX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export function validateSlug(slug) {
  if (!SLUG_RX.test(slug || '')) return 'Kode workspace 3–40 karakter: huruf kecil, angka, tanda minus';
  if (RESERVED_SLUGS.includes(slug)) return 'Kode workspace tidak tersedia';
  return null;
}
