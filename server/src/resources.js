/**
 * Registry resource: model, penomoran, RBAC, workflow, dan hook bisnis.
 * Router generik (routes/resource.js) membangun endpoint CRUD + transition + comment dari sini.
 */
const { ROLE_KEYS } = require('./constants');
const { hasRole } = require('./middleware/auth');
const { workflows } = require('./services/workflows');
const { calculatePriority, riskScore } = require('./services/priority');
const { computeDueDates } = require('./services/sla');
const SlaPolicy = require('./models/SlaPolicy');
const { Incident, ServiceRequest, Problem, Change } = require('./models/itsm');
const { Service, ConfigurationItem, Asset, Vendor } = require('./models/assets');
const { Risk, Control, ContinuityPlan, ArchitectureComponent, KnowledgeArticle } = require('./models/governance');
const { Project, Sprint, BacklogItem } = require('./models/projects');

const ALL = ['*'];
const STAFF = ROLE_KEYS.filter((r) => r !== 'requester');
const isRequesterOnly = (u) => !u.roles.some((r) => r !== 'requester');
const same = (a, b) => a && b && String(a._id || a) === String(b._id || b);

const ownTickets = (u) => (isRequesterOnly(u) ? { $or: [{ requester: u._id }, { createdBy: u._id }] } : {});

function setPriority(doc) {
  if (doc.impact && doc.urgency) doc.priority = calculatePriority(doc.impact, doc.urgency);
}

async function applySla(doc, appliesTo) {
  if (!doc.priority) return;
  const open = !['resolved', 'fulfilled', 'closed', 'cancelled'].includes(doc.status);
  const priorityChanged = doc.isNew || doc.isModified('priority');
  if (!open || !priorityChanged) return;
  const policy = await SlaPolicy.findOne({ appliesTo, priority: doc.priority, active: true });
  if (!policy) return;
  const due = computeDueDates(doc.createdAt || new Date(), policy);
  const pausedMs = (doc.sla?.pausedMinutes || 0) * 60000;
  doc.sla = {
    ...(doc.sla?.toObject ? doc.sla.toObject() : doc.sla),
    ...due,
    resolutionDue: new Date(due.resolutionDue.getTime() + pausedMs),
  };
}

// Pemohon boleh membatalkan, mengonfirmasi penutupan, atau membuka kembali tiketnya sendiri
const ownerTransitions = (allowed) => (user, doc, to) =>
  (same(doc.requester, user) || same(doc.createdBy, user)) && allowed.includes(to);

const ticketPopulate = ['requester', 'assignee', 'service', 'configurationItem'];

module.exports = {
  incidents: {
    model: Incident,
    prefix: 'INC',
    label: 'Incident',
    read: ALL,
    create: ALL,
    write: ['service_desk', 'technician', 'incident_manager', 'security_officer'],
    workflow: workflows.incident,
    search: ['number', 'title', 'description'],
    populate: ticketPopulate,
    scope: ownTickets,
    canTransition: ownerTransitions(['cancelled', 'closed', 'in_progress']),
    beforeCreate: (doc, user) => {
      if (isRequesterOnly(user)) doc.requester = user._id;
      doc.requester = doc.requester || user._id;
    },
    beforeSave: async (doc) => {
      setPriority(doc);
      // Insiden keamanan prioritas tinggi ditandai untuk evaluasi pelaporan ke regulator
      if (doc.isNew && doc.securityIncident && doc.priority <= 2) doc.regulatoryReportable = true;
      await applySla(doc, 'incident');
    },
  },
  requests: {
    model: ServiceRequest,
    prefix: 'REQ',
    label: 'Service Request',
    read: ALL,
    create: ALL,
    write: ['service_desk', 'technician'],
    workflow: workflows.request,
    search: ['number', 'title', 'description'],
    populate: [...ticketPopulate, 'approver'],
    scope: ownTickets,
    canTransition: (user, doc, to) =>
      ownerTransitions(['cancelled', 'closed'])(user, doc, to) ||
      (['approved', 'rejected'].includes(to) && same(doc.approver, user)),
    beforeCreate: async (doc, user) => {
      if (isRequesterOnly(user)) doc.requester = user._id;
      doc.requester = doc.requester || user._id;
      if (doc.service) {
        const svc = await Service.findById(doc.service);
        if (svc?.requiresApproval) doc.requiresApproval = true;
      }
    },
    beforeSave: async (doc) => {
      setPriority(doc);
      await applySla(doc, 'request');
    },
  },
  problems: {
    model: Problem,
    prefix: 'PRB',
    label: 'Problem',
    read: STAFF,
    write: ['problem_manager', 'incident_manager', 'technician'],
    workflow: workflows.problem,
    search: ['number', 'title', 'description', 'rootCause'],
    populate: ['assignee', 'service', 'configurationItem', 'relatedChange'],
    beforeSave: (doc) => setPriority(doc),
  },
  changes: {
    model: Change,
    prefix: 'CHG',
    label: 'Change',
    read: STAFF,
    write: ['change_manager', 'technician', 'architect', 'project_manager', 'security_officer', 'asset_manager', 'cab_member'],
    workflow: workflows.change,
    search: ['number', 'title', 'description'],
    populate: ['requester', 'assignee', 'service', 'configurationItems', 'relatedProblem', 'relatedProject'],
    protected: ['approvals', 'requiredApprovals'],
    beforeCreate: (doc, user) => {
      doc.requester = doc.requester || user._id;
    },
  },
  services: {
    model: Service,
    prefix: 'SVC',
    label: 'Service',
    read: ALL,
    write: ['asset_manager', 'architect'],
    remove: ['admin'],
    search: ['name', 'description', 'requestCategory'],
    populate: ['owner', 'dependsOn'],
  },
  'configuration-items': {
    model: ConfigurationItem,
    prefix: 'CI',
    label: 'Configuration Item',
    read: STAFF,
    write: ['asset_manager', 'technician'],
    remove: ['asset_manager'],
    search: ['number', 'name', 'hostname', 'ipAddress'],
    populate: ['owner', 'services', 'dependsOn', 'asset', 'vendor'],
  },
  assets: {
    model: Asset,
    prefix: 'AST',
    label: 'Asset',
    read: STAFF,
    write: ['asset_manager'],
    search: ['number', 'name', 'assetTag', 'serialNumber', 'model'],
    populate: ['assignedTo', 'vendor'],
  },
  vendors: {
    model: Vendor,
    prefix: 'VND',
    label: 'Vendor',
    read: STAFF,
    write: ['vendor_manager', 'risk_officer'],
    search: ['number', 'name', 'contractNumber'],
  },
  knowledge: {
    model: KnowledgeArticle,
    prefix: 'KB',
    label: 'Knowledge Article',
    read: ALL,
    write: ['knowledge_manager', 'service_desk', 'technician', 'problem_manager'],
    workflow: workflows.knowledge,
    search: ['number', 'title', 'content', 'category'],
    populate: ['author', 'reviewer', 'service', 'relatedProblem'],
    scope: (u) => (isRequesterOnly(u) ? { status: 'published', audience: { $ne: 'it_only' } } : {}),
    beforeCreate: (doc, user) => {
      doc.author = doc.author || user._id;
    },
  },
  risks: {
    model: Risk,
    prefix: 'RSK',
    label: 'Risk',
    read: STAFF,
    write: ['risk_officer', 'security_officer'],
    workflow: workflows.risk,
    search: ['number', 'title', 'description'],
    populate: ['owner', 'relatedVendor', 'relatedAssets', 'relatedControls'],
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
    model: Control,
    label: 'Control',
    read: STAFF,
    write: ['risk_officer', 'security_officer'],
    search: ['code', 'title', 'domain', 'frameworkName'],
    populate: ['owner'],
    defaultSort: 'frameworkId code',
  },
  continuity: {
    model: ContinuityPlan,
    prefix: 'BCP',
    label: 'Continuity Plan',
    read: STAFF,
    write: ['risk_officer', 'asset_manager', 'security_officer'],
    search: ['number', 'name', 'drSite'],
    populate: ['owner', 'services'],
  },
  architecture: {
    model: ArchitectureComponent,
    prefix: 'ARC',
    label: 'Architecture Component',
    read: STAFF,
    write: ['architect'],
    search: ['number', 'name', 'description'],
    populate: ['owner', 'relatedServices', 'relatedCIs', 'dependsOn'],
  },
  projects: {
    model: Project,
    prefix: 'PRJ',
    label: 'Project',
    read: STAFF,
    write: ['project_manager'],
    workflow: workflows.project,
    search: ['number', 'name', 'code', 'description'],
    populate: ['manager', 'relatedServices'],
  },
  sprints: {
    model: Sprint,
    prefix: 'SPR',
    label: 'Sprint',
    read: STAFF,
    write: ['project_manager'],
    workflow: workflows.sprint,
    search: ['number', 'name', 'goal'],
    populate: ['project'],
  },
  backlog: {
    model: BacklogItem,
    prefix: 'PBI',
    label: 'Backlog Item',
    read: STAFF,
    write: ['project_manager', 'technician', 'architect'],
    search: ['number', 'title', 'description'],
    populate: ['project', 'sprint', 'assignee', 'relatedChange'],
  },
  'sla-policies': {
    model: SlaPolicy,
    label: 'SLA Policy',
    read: STAFF,
    write: ['incident_manager'],
    remove: ['admin'],
    search: ['name'],
    defaultSort: 'appliesTo priority',
  },
};

