// ITIL 4 — Service Management practices
const mongoose = require('mongoose');
const { Schema } = mongoose;
const { basePlugin, ref } = require('./common');

const slaSchema = new Schema(
  {
    policy: ref('SlaPolicy'),
    responseDue: Date,
    resolutionDue: Date,
    targetMinutes: Number,
    respondedAt: Date,
    resolvedAt: Date,
    pausedAt: Date,
    pausedMinutes: { type: Number, default: 0 },
    responseBreached: { type: Boolean, default: false },
    resolutionBreached: { type: Boolean, default: false },
  },
  { _id: false }
);

const ticketFields = {
  title: { type: String, required: [true, 'Judul wajib diisi'], trim: true, maxlength: 200 },
  description: String,
  requester: ref('User'),
  assignee: ref('User'),
  assignmentGroup: String,
  service: ref('Service'),
  configurationItem: ref('ConfigurationItem'),
  category: String,
  subcategory: String,
  channel: { type: String, enum: ['portal', 'email', 'phone', 'chat', 'walk_in', 'monitoring'], default: 'portal' },
  impact: { type: Number, enum: [1, 2, 3], default: 3 },
  urgency: { type: Number, enum: [1, 2, 3], default: 3 },
  priority: { type: Number, min: 1, max: 4 },
  tags: [String],
};

// Incident Management
const incidentSchema = new Schema({
  ...ticketFields,
  status: {
    type: String,
    enum: ['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed', 'cancelled'],
    default: 'new',
  },
  pendingReason: String,
  majorIncident: { type: Boolean, default: false },
  securityIncident: { type: Boolean, default: false },
  // Pelaporan insiden ke regulator (mis. OJK untuk bank, BSSN untuk SPBE, pelaporan kegagalan PDP)
  regulatoryReportable: { type: Boolean, default: false },
  regulatorReportedAt: Date,
  personalDataBreach: { type: Boolean, default: false },
  relatedProblem: ref('Problem'),
  resolutionCode: {
    type: String,
    enum: ['', 'solved_workaround', 'solved_permanent', 'not_reproducible', 'duplicate', 'user_error', 'cancelled'],
  },
  resolutionNotes: String,
  resolvedAt: Date,
  closedAt: Date,
  sla: { type: slaSchema, default: () => ({}) },
});
incidentSchema.plugin(basePlugin);

// Service Request Management
const requestSchema = new Schema({
  ...ticketFields,
  status: {
    type: String,
    enum: ['submitted', 'pending_approval', 'approved', 'rejected', 'fulfilling', 'fulfilled', 'closed', 'cancelled'],
    default: 'submitted',
  },
  requiresApproval: { type: Boolean, default: false },
  approver: ref('User'),
  approvedAt: Date,
  fulfillmentNotes: String,
  quantity: { type: Number, default: 1 },
  neededBy: Date,
  resolvedAt: Date,
  closedAt: Date,
  sla: { type: slaSchema, default: () => ({}) },
});
requestSchema.plugin(basePlugin);

// Problem Management
const problemSchema = new Schema({
  title: { type: String, required: [true, 'Judul wajib diisi'], trim: true },
  description: String,
  status: {
    type: String,
    enum: ['new', 'investigating', 'known_error', 'resolved', 'closed'],
    default: 'new',
  },
  assignee: ref('User'),
  service: ref('Service'),
  configurationItem: ref('ConfigurationItem'),
  impact: { type: Number, enum: [1, 2, 3], default: 2 },
  urgency: { type: Number, enum: [1, 2, 3], default: 2 },
  priority: { type: Number, min: 1, max: 4 },
  rcaMethod: { type: String, enum: ['', '5_whys', 'fishbone', 'kepner_tregoe', 'fault_tree', 'other'] },
  rootCause: String,
  workaround: String,
  permanentFix: String,
  knownError: { type: Boolean, default: false },
  relatedChange: ref('Change'),
  resolvedAt: Date,
  closedAt: Date,
});
problemSchema.plugin(basePlugin);

// Change Enablement (RFC + CAB)
const approvalSchema = new Schema({
  approver: ref('User'),
  approverName: String,
  decision: { type: String, enum: ['approved', 'rejected'] },
  comment: String,
  at: { type: Date, default: Date.now },
});

const changeSchema = new Schema({
  title: { type: String, required: [true, 'Judul wajib diisi'], trim: true },
  description: String,
  justification: String,
  type: { type: String, enum: ['standard', 'normal', 'emergency'], default: 'normal' },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'assessment', 'cab_review', 'approved', 'rejected', 'scheduled', 'implementing', 'review', 'closed', 'cancelled'],
    default: 'draft',
  },
  requester: ref('User'),
  assignee: ref('User'),
  service: ref('Service'),
  configurationItems: [ref('ConfigurationItem')],
  risk: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  impact: { type: Number, enum: [1, 2, 3], default: 2 },
  plannedStart: Date,
  plannedEnd: Date,
  actualStart: Date,
  actualEnd: Date,
  implementationPlan: String,
  backoutPlan: String,
  testPlan: String,
  securityImpactAssessment: String,
  approvals: [approvalSchema],
  requiredApprovals: { type: Number, default: 1 },
  outcome: { type: String, enum: ['', 'successful', 'successful_with_issues', 'failed', 'backed_out'] },
  pirNotes: String, // Post Implementation Review
  relatedProblem: ref('Problem'),
  relatedProject: ref('Project'),
  closedAt: Date,
});
changeSchema.plugin(basePlugin);

module.exports = {
  Incident: mongoose.model('Incident', incidentSchema),
  ServiceRequest: mongoose.model('ServiceRequest', requestSchema),
  Problem: mongoose.model('Problem', problemSchema),
  Change: mongoose.model('Change', changeSchema),
};
