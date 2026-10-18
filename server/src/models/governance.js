// Tata kelola, risiko & kepatuhan (GRC): NIST CSF 2.0, ISO 27001, OJK, TOGAF, Knowledge Mgmt, BCM
const mongoose = require('mongoose');
const { Schema } = mongoose;
const { basePlugin, ref } = require('./common');

const NIST_FUNCTIONS = ['', 'GV', 'ID', 'PR', 'DE', 'RS', 'RC'];

const riskSchema = new Schema({
  title: { type: String, required: [true, 'Judul risiko wajib diisi'], trim: true },
  description: String,
  category: {
    type: String,
    enum: ['strategic', 'operational', 'cyber_security', 'compliance', 'third_party', 'data_privacy', 'project', 'availability', 'financial'],
    default: 'operational',
  },
  nistFunction: { type: String, enum: NIST_FUNCTIONS, default: '' },
  status: { type: String, enum: ['identified', 'assessed', 'treating', 'monitoring', 'closed'], default: 'identified' },
  owner: ref('User'),
  likelihood: { type: Number, min: 1, max: 5, default: 3 },
  impact: { type: Number, min: 1, max: 5, default: 3 },
  inherentScore: Number,
  inherentLevel: String,
  existingControls: String,
  treatment: { type: String, enum: ['', 'mitigate', 'transfer', 'avoid', 'accept'] },
  treatmentPlan: String,
  residualLikelihood: { type: Number, min: 1, max: 5 },
  residualImpact: { type: Number, min: 1, max: 5 },
  residualScore: Number,
  residualLevel: String,
  dueDate: Date,
  reviewDate: Date,
  relatedAssets: [ref('ConfigurationItem')],
  relatedVendor: ref('Vendor'),
  relatedControls: [ref('Control')],
});
riskSchema.plugin(basePlugin);

const controlSchema = new Schema({
  frameworkId: { type: String, required: true },
  frameworkName: String,
  code: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  domain: String,
  nistFunction: { type: String, enum: NIST_FUNCTIONS, default: '' },
  guidance: String,
  status: {
    type: String,
    enum: ['not_assessed', 'not_implemented', 'partial', 'implemented', 'not_applicable'],
    default: 'not_assessed',
  },
  owner: ref('User'),
  evidence: String,
  evidenceUrl: String,
  lastAssessed: Date,
  nextReview: Date,
  gapNotes: String,
  remediationPlan: String,
});
controlSchema.plugin(basePlugin);
controlSchema.index({ tenant: 1, frameworkId: 1, code: 1 }, { unique: true });

// Business Continuity / Disaster Recovery (DRP wajib diuji berkala — POJK 11/2022, ISO 22301)
const continuitySchema = new Schema({
  name: { type: String, required: [true, 'Nama rencana wajib diisi'], trim: true },
  planType: { type: String, enum: ['bcp', 'drp', 'crisis', 'incident_response'], default: 'drp' },
  status: { type: String, enum: ['draft', 'approved', 'tested', 'needs_update', 'retired'], default: 'draft' },
  owner: ref('User'),
  services: [ref('Service')],
  rtoHours: Number,
  rpoHours: Number,
  drSite: String,
  lastTestDate: Date,
  lastTestResult: { type: String, enum: ['', 'success', 'partial', 'failed'] },
  testFindings: String,
  nextTestDate: Date,
  approvedBy: String,
  approvedDate: Date,
  description: String,
});
continuitySchema.plugin(basePlugin);

// TOGAF — Architecture Repository (building blocks lintas domain BDAT)
const architectureSchema = new Schema({
  name: { type: String, required: [true, 'Nama komponen wajib diisi'], trim: true },
  domain: { type: String, enum: ['business', 'data', 'application', 'technology'], default: 'application' },
  buildingBlockType: { type: String, enum: ['abb', 'sbb'], default: 'sbb' },
  admPhase: {
    type: String,
    enum: ['preliminary', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'requirements'],
    default: 'preliminary',
  },
  state: { type: String, enum: ['baseline', 'transition', 'target'], default: 'baseline' },
  lifecycle: { type: String, enum: ['plan', 'invest', 'tolerate', 'migrate', 'eliminate'], default: 'tolerate' }, // TIME model
  status: { type: String, enum: ['draft', 'review', 'approved', 'deprecated'], default: 'draft' },
  owner: ref('User'),
  description: String,
  principles: String,
  standards: String,
  relatedServices: [ref('Service')],
  relatedCIs: [ref('ConfigurationItem')],
  dependsOn: [ref('ArchitectureComponent')],
});
architectureSchema.plugin(basePlugin);

const knowledgeSchema = new Schema({
  title: { type: String, required: [true, 'Judul wajib diisi'], trim: true },
  category: String,
  articleType: { type: String, enum: ['how_to', 'known_error', 'faq', 'policy', 'sop', 'troubleshooting'], default: 'how_to' },
  status: { type: String, enum: ['draft', 'review', 'published', 'retired'], default: 'draft' },
  audience: { type: String, enum: ['public', 'internal', 'it_only'], default: 'internal' },
  content: String,
  author: ref('User'),
  reviewer: ref('User'),
  relatedProblem: ref('Problem'),
  service: ref('Service'),
  tags: [String],
  views: { type: Number, default: 0 },
  helpful: { type: Number, default: 0 },
  publishedAt: Date,
  reviewDue: Date,
});
knowledgeSchema.plugin(basePlugin);

module.exports = {
  Risk: mongoose.model('Risk', riskSchema),
  Control: mongoose.model('Control', controlSchema),
  ContinuityPlan: mongoose.model('ContinuityPlan', continuitySchema),
  ArchitectureComponent: mongoose.model('ArchitectureComponent', architectureSchema),
  KnowledgeArticle: mongoose.model('KnowledgeArticle', knowledgeSchema),
};
