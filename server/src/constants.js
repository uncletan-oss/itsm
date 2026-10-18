// Peran (RBAC) — dipetakan ke peran praktik ITIL 4 & tata kelola TI
const ROLES = {
  admin: 'Administrator Sistem',
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
  vendor_manager: 'Supplier / Vendor Manager',
  auditor: 'Auditor (read-only)',
  requester: 'Pengguna Layanan (End User)',
};

const IMPACT = [1, 2, 3]; // 1 = Tinggi, 2 = Sedang, 3 = Rendah
const URGENCY = [1, 2, 3];

module.exports = { ROLES, ROLE_KEYS: Object.keys(ROLES), IMPACT, URGENCY };
