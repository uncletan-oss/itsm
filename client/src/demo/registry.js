// Registry resource untuk backend demo — cermin dari server/src/resources.js
// Hak akses berasal dari shared/permissions.mjs (+ override per tenant), sama seperti server.
import { hasRole } from '../../../shared/roles.mjs';
import { workflows, fromSpec } from '../../../shared/workflows.mjs';
import { MODULE_DEFS } from '../../../shared/modules.mjs';
import { APPROVALS } from '../../../shared/approvals.mjs';
import { calculatePriority, riskScore } from '../../../shared/priority.mjs';

export const isRequesterOnly = (u) => !u.roles.some((r) => r !== 'requester');
export const same = (a, b) => a && b && String(a._id || a) === String(b._id || b);
const ownTickets = (u) => (isRequesterOnly(u) ? (d) => same(d.requester, u) || same(d.createdBy, u) : null);
const ownerTransitions = (allowed) => (user, doc, to) => (same(doc.requester, user) || same(doc.createdBy, user)) && allowed.includes(to);
const setPriority = (doc) => {
  if (doc.impact && doc.urgency) doc.priority = calculatePriority(doc.impact, doc.urgency);
};

const TICKET_REFS = { requester: 'users', assignee: 'users', service: 'services', configurationItem: 'configuration-items' };

export const RESOURCES = {
  incidents: {
    prefix: 'INC', label: 'Incident',
    workflow: workflows.incident, sla: 'incident', initial: 'new',
    search: ['number', 'title', 'description'],
    refs: { ...TICKET_REFS, relatedProblem: 'problems' },
    defaults: { impact: 3, urgency: 3, channel: 'portal', majorIncident: false, securityIncident: false, regulatoryReportable: false, personalDataBreach: false },
    scope: ownTickets,
    canTransition: ownerTransitions(['cancelled', 'closed', 'in_progress']),
    beforeCreate: (doc, user) => {
      if (isRequesterOnly(user)) doc.requester = user._id;
      doc.requester = doc.requester || user._id;
    },
    beforeSave: (doc, user, isNew) => {
      setPriority(doc);
      if (isNew && doc.securityIncident && doc.priority <= 2) doc.regulatoryReportable = true;
    },
  },
  requests: {
    prefix: 'REQ', label: 'Service Request',
    workflow: workflows.request, sla: 'request', initial: 'submitted',
    search: ['number', 'title', 'description'],
    refs: { ...TICKET_REFS, approver: 'users' },
    defaults: { impact: 3, urgency: 3, channel: 'portal', quantity: 1, requiresApproval: false },
    scope: ownTickets,
    canTransition: ownerTransitions(['cancelled', 'closed']),
    beforeCreate: (doc, user, db) => {
      if (isRequesterOnly(user)) doc.requester = user._id;
      doc.requester = doc.requester || user._id;
      const svc = doc.service && db.services.find((s) => s._id === doc.service && s.tenant === doc.tenant);
      if (svc?.requiresApproval) doc.requiresApproval = true;
    },
    beforeSave: setPriority,
  },
  problems: {
    prefix: 'PRB', label: 'Problem',
    workflow: workflows.problem, initial: 'new', search: ['number', 'title', 'description', 'rootCause'],
    refs: { assignee: 'users', service: 'services', configurationItem: 'configuration-items', relatedChange: 'changes' },
    defaults: { impact: 2, urgency: 2, knownError: false },
    beforeSave: setPriority,
  },
  changes: {
    prefix: 'CHG', label: 'Change',
    workflow: workflows.change, initial: 'draft', search: ['number', 'title', 'description'],
    refs: { requester: 'users', assignee: 'users', service: 'services', configurationItems: 'configuration-items', relatedProblem: 'problems', relatedProject: 'projects' },
    defaults: { type: 'normal', risk: 'medium', impact: 2, approvals: [], requiredApprovals: 1 },
    protected: ['approvals', 'requiredApprovals'],
    beforeCreate: (doc, user) => { doc.requester = doc.requester || user._id; },
  },
  services: {
    prefix: 'SVC', label: 'Service',
    search: ['name', 'description', 'requestCategory'], refs: { owner: 'users', dependsOn: 'services' },
    defaults: { type: 'business', status: 'live', criticality: 'medium', requestable: false, requiresApproval: false },
  },
  'configuration-items': {
    prefix: 'CI', label: 'Configuration Item',
    search: ['number', 'name', 'hostname', 'ipAddress'],
    refs: { owner: 'users', services: 'services', dependsOn: 'configuration-items', asset: 'assets', vendor: 'vendors', rack: 'racks' },
    workflow: workflows.configurationItem, initial: 'planned',
    defaults: { ciType: 'server', environment: 'production', hostingCountry: 'Indonesia', dataClassification: 'internal', processesPersonalData: false },
  },
  assets: {
    prefix: 'AST', label: 'Asset',
    search: ['number', 'name', 'assetTag', 'serialNumber', 'model'], refs: { assignedTo: 'users', vendor: 'vendors' },
    workflow: workflows.asset, initial: 'requested',
    defaults: { category: 'hardware', currency: 'IDR' },
  },
  vendors: {
    prefix: 'VND', label: 'Vendor',
    search: ['number', 'name', 'contractNumber'], refs: {},
    workflow: workflows.vendor, initial: 'prospect',
    defaults: { category: 'other', criticality: 'medium', dataLocation: 'Indonesia', rightToAudit: false },
  },
  knowledge: {
    prefix: 'KB', label: 'Knowledge Article',
    workflow: workflows.knowledge, initial: 'draft', search: ['number', 'title', 'content', 'category'],
    refs: { author: 'users', reviewer: 'users', service: 'services', relatedProblem: 'problems' },
    defaults: { articleType: 'how_to', audience: 'internal', views: 0, helpful: 0 },
    scope: (u) => (isRequesterOnly(u) ? (d) => d.status === 'published' && d.audience !== 'it_only' : null),
    beforeCreate: (doc, user) => { doc.author = doc.author || user._id; },
  },
  risks: {
    prefix: 'RSK', label: 'Risk',
    workflow: workflows.risk, initial: 'identified', search: ['number', 'title', 'description'],
    refs: { owner: 'users', relatedVendor: 'vendors', relatedAssets: 'configuration-items', relatedControls: 'controls' },
    defaults: { category: 'operational', nistFunction: '', likelihood: 3, impact: 3 },
    beforeSave: (doc) => {
      const inh = riskScore(doc.likelihood, doc.impact);
      doc.inherentScore = inh.score;
      doc.inherentLevel = inh.level;
      const res = riskScore(doc.residualLikelihood, doc.residualImpact);
      doc.residualScore = res.score;
      doc.residualLevel = res.level;
    },
  },
  controls: {
    label: 'Control',
    search: ['code', 'title', 'domain', 'frameworkName'], refs: { owner: 'users' }, defaultSort: 'frameworkId code',
    defaults: { status: 'not_assessed', nistFunction: '' },
  },
  continuity: {
    prefix: 'BCP', label: 'Continuity Plan',
    search: ['number', 'name', 'drSite'], refs: { owner: 'users', services: 'services' }, defaults: { planType: 'drp' },
    workflow: workflows.continuity, initial: 'draft',
  },
  architecture: {
    prefix: 'ARC', label: 'Architecture Component',
    search: ['number', 'name', 'description'],
    refs: { owner: 'users', relatedServices: 'services', relatedCIs: 'configuration-items', dependsOn: 'architecture' },
    workflow: workflows.architecture, initial: 'draft',
    defaults: { domain: 'application', buildingBlockType: 'sbb', admPhase: 'preliminary', state: 'baseline', lifecycle: 'tolerate' },
  },
  projects: {
    prefix: 'PRJ', label: 'Project', workflow: workflows.project, initial: 'initiating',
    search: ['number', 'name', 'code', 'description'], refs: { manager: 'users', relatedServices: 'services' },
    defaults: { approach: 'hybrid', health: 'green', percentComplete: 0 },
  },
  sprints: {
    prefix: 'SPR', label: 'Sprint', workflow: workflows.sprint, initial: 'planned',
    search: ['number', 'name', 'goal'], refs: { project: 'projects' }, required: { project: 'Proyek wajib dipilih' },
  },
  backlog: {
    prefix: 'PBI', label: 'Backlog Item',
    search: ['number', 'title', 'description'],
    refs: { project: 'projects', sprint: 'sprints', assignee: 'users', relatedChange: 'changes' },
    defaults: { itemType: 'story', status: 'backlog', priority: 'should' }, required: { project: 'Proyek wajib dipilih' },
  },
  'sla-policies': {
    label: 'SLA Policy', search: ['name'], refs: {},
    defaultSort: 'appliesTo priority', defaults: { active: true }, noActivity: true,
  },
};

// Modul deklaratif (shared/modules.mjs) — refs, default, workflow & hitungan dari satu definisi
const COLL = (f) => (f.type === 'user' || (f.type === 'readonly' && f.store === 'user') ? 'users' : f.resource);
for (const [key, def] of Object.entries(MODULE_DEFS)) {
  const titleKey = def.fields.find((f) => f.key === 'name') ? 'name' : 'title';
  RESOURCES[key] = {
    prefix: def.prefix, label: def.label, search: def.search, defaultSort: def.defaultSort,
    workflow: def.workflow ? fromSpec(def.workflow) : undefined,
    initial: def.initial,
    refs: Object.fromEntries(def.fields.filter((f) => ['ref', 'refs', 'user'].includes(f.type) || (f.type === 'readonly' && f.store === 'user')).map((f) => [f.key, COLL(f)])),
    defaults: Object.fromEntries(def.fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default])),
    required: Object.fromEntries(def.fields.filter((f) => f.required && f.key !== titleKey && f.type !== 'readonly').map((f) => [f.key, `${f.label} wajib diisi`])),
    titleKey: def.fields.find((f) => f.key === titleKey) ? titleKey : null,
    readonlyKeys: def.fields.filter((f) => f.type === 'readonly').map((f) => f.key),
    scope: def.ownScope ? (u) => (isRequesterOnly(u) ? (d) => same(d.createdBy, u) : null) : undefined,
    canTransition: def.workflow
      ? (user, doc, to) => (def.workflow.canOwner?.includes(to) && ['requester', 'createdBy', 'owner'].some((f) => same(doc[f], user))) || (!!def.workflow.roles?.[to] && hasRole(user, def.workflow.roles[to]))
      : undefined,
    transitionFieldsFor: (to) => def.transitionFields?.[to] || def.workflow?.required?.[to]?.map(([f]) => f) || [],
    beforeSave: def.compute ? (doc) => def.compute(doc) : undefined,
  };
}

// Kebijakan persetujuan dilekatkan ke workflow
for (const [key, policy] of Object.entries(APPROVALS)) {
  if (RESOURCES[key]?.workflow) RESOURCES[key] = { ...RESOURCES[key], approval: policy, workflow: { ...RESOURCES[key].workflow, approval: policy } };
}

export { hasRole };
