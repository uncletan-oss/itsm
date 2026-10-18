// Peran (RBAC) — dipetakan ke peran praktik ITIL 4 & tata kelola TI
export const ROLES = {
  admin: 'Administrator Tenant',
  service_desk: 'Service Desk Agent',
  technician: 'Technical Support / Resolver Group',
  incident_manager: 'Incident Manager',
  problem_manager: 'Problem Manager',
  change_manager: 'Change Manager',
  cab_member: 'Anggota CAB',
  asset_manager: 'IT Asset & Configuration Manager',
  knowledge_manager: 'Knowledge Manager',
  risk_officer: 'IT Risk & Compliance Officer',
  security_officer: 'Information Security Officer (CISO)',
  architect: 'Enterprise Architect',
  project_manager: 'Project Manager / Scrum Master',
  vendor_manager: 'Procurement / Vendor Manager',
  finance_manager: 'Finance Manager / IT Controller',
  accountant: 'Akuntan / Accounts Payable',
  treasurer: 'Treasury / Bendahara',
  dc_manager: 'Data Center Manager (DCIM)',
  bcm_manager: 'BCM / DR Coordinator',
  executive: 'Eksekutif (CIO / Direksi)',
  auditor: 'Auditor (read-only)',
  requester: 'Pengguna Layanan (End User)',
};
export const ROLE_KEYS = Object.keys(ROLES);

export function hasRole(user, roles) {
  if (!roles || roles.includes('*')) return true;
  return user.roles.includes('admin') || user.roles.some((r) => roles.includes(r));
}

/** Peran operator platform SaaS (tidak terikat tenant, tidak dapat melihat data tenant). */
export const PLATFORM_ROLE = 'platform_admin';
