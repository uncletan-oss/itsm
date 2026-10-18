/**
 * Aturan notifikasi in-app. Mengembalikan daftar notifikasi dengan target userIds dan/atau roles;
 * server & backend demo yang menerjemahkan roles menjadi user di tenant yang sama.
 */
import { STATUS_TEXT } from './status-text.mjs';
import { APPROVALS, approvalProgress, stepAudience } from './approvals.mjs';

const id = (v) => (v && typeof v === 'object' ? String(v._id) : v ? String(v) : null);

export function notificationsFor({ event, resource, label, doc, before, actor, to, next }) {
  const out = [];
  const ref = doc.number || doc.name || doc.title;
  const link = { resource, id: id(doc._id) };
  const me = id(actor?._id);
  const push = (n) => out.push({ ...n, link, userIds: (n.userIds || []).filter((u) => u && u !== me) });

  const assignee = id(doc.assignee);
  if (assignee && (event === 'create' || id(before?.assignee) !== assignee)) {
    push({ userIds: [assignee], title: `${label} ditugaskan kepada Anda`, body: `${ref} · ${doc.title || doc.name}` });
  }
  if (event === 'transition') {
    const watchers = [id(doc.requester), id(doc.createdBy)].filter(Boolean);
    push({ userIds: [...new Set(watchers)], title: `${ref}: status menjadi ${STATUS_TEXT[to] || to}`, body: doc.title || doc.name });
    const policy = APPROVALS[resource];
    if (policy && to === policy.status) {
      const first = approvalProgress(policy, doc).current;
      const aud = first && stepAudience(policy, doc, first.name);
      if (aud) push({ ...aud, title: `${policy.label}: ${ref} menunggu persetujuan Anda`, body: `${first.name} · ${doc.title || doc.name || ''}`, kind: 'approval' });
    }
    if (resource === 'knowledge' && to === 'review') {
      push({ roles: ['knowledge_manager'], title: `Artikel menunggu review: ${ref}`, body: doc.title, kind: 'approval' });
    }
  }
  if (event === 'approval_step') {
    const policy = APPROVALS[resource];
    const aud = policy && next && stepAudience(policy, doc, next.name);
    if (aud) push({ ...aud, title: `${policy.label}: ${ref} menunggu persetujuan Anda`, body: `${next.name} · ${doc.title || doc.name || ''}`, kind: 'approval' });
  }
  if (event === 'create' && resource === 'incidents' && (doc.majorIncident || doc.priority === 1)) {
    push({ roles: ['incident_manager'], title: `Incident P1 / major baru: ${ref}`, body: doc.title });
  }
  if (event === 'create' && resource === 'incidents' && doc.securityIncident) {
    push({ roles: ['security_officer'], title: `Insiden keamanan baru: ${ref}`, body: doc.title });
  }
  return out.filter((n) => n.userIds.length || n.roles?.length);
}
