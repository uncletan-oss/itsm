/**
 * Matriks hak akses default (least privilege) per resource & halaman.
 * Admin tenant dapat menimpa read/write per resource melalui menu "Peran & Akses".
 * Menu portal dibangun dari matriks efektif ini, sehingga tiap peran hanya melihat modul yang relevan.
 */
import { ROLE_KEYS, hasRole } from './roles.mjs';
import { PLANS } from './plans.mjs';

export const ALL = ['*'];

export const DEFAULT_PERMISSIONS = {
  incidents: { read: ALL, create: ALL, write: ['service_desk', 'technician', 'incident_manager', 'security_officer'] },
  requests: { read: ALL, create: ALL, write: ['service_desk', 'technician'] },
  problems: {
    read: ['service_desk', 'technician', 'incident_manager', 'problem_manager', 'change_manager', 'knowledge_manager', 'security_officer', 'auditor'],
    write: ['problem_manager', 'incident_manager', 'technician'],
  },
  changes: {
    read: ['technician', 'incident_manager', 'problem_manager', 'change_manager', 'cab_member', 'asset_manager', 'security_officer', 'architect', 'project_manager', 'risk_officer', 'auditor'],
    write: ['change_manager', 'technician', 'architect', 'project_manager', 'security_officer', 'asset_manager'],
  },
  knowledge: { read: ALL, write: ['knowledge_manager', 'service_desk', 'technician', 'problem_manager'] },
  services: { read: ALL, write: ['asset_manager', 'architect'], remove: ['admin'] },
  'sla-policies': { read: ['service_desk', 'technician', 'incident_manager', 'auditor'], write: ['incident_manager'], remove: ['admin'] },
  'configuration-items': {
    read: ['service_desk', 'technician', 'incident_manager', 'problem_manager', 'change_manager', 'cab_member', 'asset_manager', 'architect', 'security_officer', 'risk_officer', 'auditor'],
    write: ['asset_manager', 'technician'],
    remove: ['asset_manager'],
  },
  assets: { read: ['asset_manager', 'technician', 'service_desk', 'vendor_manager', 'risk_officer', 'auditor'], write: ['asset_manager'] },
  vendors: { read: ['vendor_manager', 'risk_officer', 'security_officer', 'asset_manager', 'auditor'], write: ['vendor_manager', 'risk_officer'] },
  risks: { read: ['risk_officer', 'security_officer', 'architect', 'project_manager', 'vendor_manager', 'auditor'], write: ['risk_officer', 'security_officer'] },
  controls: { read: ['risk_officer', 'security_officer', 'auditor'], write: ['risk_officer', 'security_officer'] },
  continuity: { read: ['risk_officer', 'security_officer', 'asset_manager', 'technician', 'incident_manager', 'auditor'], write: ['risk_officer', 'asset_manager', 'security_officer'] },
  architecture: { read: ['architect', 'project_manager', 'change_manager', 'asset_manager', 'auditor'], write: ['architect'] },
  projects: { read: ['project_manager', 'architect', 'change_manager', 'auditor'], write: ['project_manager'] },
  sprints: { read: ['project_manager', 'architect', 'technician'], write: ['project_manager'] },
  backlog: { read: ['project_manager', 'architect', 'technician'], write: ['project_manager', 'technician', 'architect'] },
};

export const RESOURCE_KEYS = Object.keys(DEFAULT_PERMISSIONS);

/** Halaman non-resource (tidak dapat diubah tenant). */
export const PAGES = {
  dashboard: ALL,
  'my-work': ALL,
  portal: ALL,
  reports: ['service_desk', 'incident_manager', 'problem_manager', 'change_manager', 'risk_officer', 'security_officer', 'auditor'],
  compliance: ['risk_officer', 'security_officer', 'auditor'],
  audit: ['auditor', 'risk_officer', 'security_officer'],
  users: ['admin'],
  access: ['admin'],
  settings: ['admin'],
};

const uniq = (a) => [...new Set(a)];
const clean = (roles) => (Array.isArray(roles) ? uniq(roles.filter((r) => r === '*' || ROLE_KEYS.includes(r))) : null);

/**
 * Matriks efektif untuk sebuah tenant: default ⊕ override tenant ⊖ modul di luar paket langganan.
 * write selalu menyiratkan read.
 */
export function effectivePermissions(tenant = {}) {
  const overrides = tenant.permissions || {};
  const planModules = PLANS[tenant.plan]?.modules;
  const out = {};
  for (const [res, def] of Object.entries(DEFAULT_PERMISSIONS)) {
    const o = overrides[res] || {};
    const write = clean(o.write) || def.write;
    const read = clean(o.read) || def.read;
    const enabled = !planModules || planModules.includes(res);
    out[res] = {
      enabled,
      read: enabled ? (read.includes('*') ? ALL : uniq([...read, ...write])) : [],
      write: enabled ? write : [],
      create: enabled ? (def.create && !o.write ? def.create : write) : [],
      remove: enabled ? def.remove || [] : [],
    };
  }
  return out;
}

export const canAccess = (user, perms, resource, action = 'read') => !!perms?.[resource]?.enabled && hasRole(user, perms[resource][action]);
export const canPage = (user, page) => hasRole(user, PAGES[page]);

/** Validasi & normalisasi override yang dikirim admin tenant. */
export function sanitizeOverrides(input = {}) {
  const out = {};
  for (const res of RESOURCE_KEYS) {
    const o = input[res];
    if (!o) continue;
    const read = clean(o.read);
    const write = clean(o.write);
    if (read || write) out[res] = { ...(read ? { read } : {}), ...(write ? { write: write.filter((r) => r !== '*') } : {}) };
  }
  return out;
}
