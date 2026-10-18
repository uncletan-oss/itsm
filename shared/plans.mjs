/** Paket langganan SaaS — menentukan modul yang aktif dan batas pengguna per tenant. */
const CORE = ['incidents', 'requests', 'problems', 'changes', 'knowledge', 'services', 'sla-policies', 'configuration-items', 'assets'];
const GRC = ['vendors', 'risks', 'controls', 'continuity'];
const EA = ['architecture', 'projects', 'sprints', 'backlog'];

export const PLANS = {
  starter: {
    name: 'Starter', price: 'Rp 1,5 jt / bulan', maxUsers: 15, modules: CORE,
    summary: 'Service desk ITIL 4 inti untuk tim TI yang sedang bertumbuh.',
    features: ['Incident, request, problem & change', 'Service catalog & SLA', 'CMDB & aset TI', 'Knowledge base & situs bantuan publik'],
  },
  professional: {
    name: 'Professional', price: 'Rp 6 jt / bulan', maxUsers: 100, modules: [...CORE, ...GRC],
    summary: 'ITSM + tata kelola, risiko & kepatuhan untuk industri teregulasi.',
    features: ['Semua fitur Starter', 'Risk register & kontrol kepatuhan', 'Manajemen vendor / penyedia jasa TI', 'BCP / DRP'],
  },
  enterprise: {
    name: 'Enterprise', price: 'Hubungi kami', maxUsers: null, modules: [...CORE, ...GRC, ...EA],
    summary: 'Platform lengkap ITSM, GRC, arsitektur & portofolio proyek.',
    features: ['Semua fitur Professional', 'Repositori arsitektur TOGAF', 'Proyek, sprint & backlog', 'Pengguna tanpa batas'],
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
