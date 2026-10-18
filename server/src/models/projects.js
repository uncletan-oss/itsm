// Portofolio proyek: PMBOK (7th ed. performance domains) + Agile/Scrum
const mongoose = require('mongoose');
const { Schema } = mongoose;
const { basePlugin, ref } = require('./common');

const projectSchema = new Schema({
  name: { type: String, required: [true, 'Nama proyek wajib diisi'], trim: true },
  code: String,
  description: String,
  objectives: String,
  approach: { type: String, enum: ['predictive', 'agile', 'hybrid'], default: 'hybrid' },
  status: {
    type: String,
    enum: ['initiating', 'planning', 'executing', 'monitoring', 'closing', 'closed', 'on_hold', 'cancelled'],
    default: 'initiating',
  },
  health: { type: String, enum: ['green', 'amber', 'red'], default: 'green' },
  sponsor: String,
  manager: ref('User'),
  startDate: Date,
  endDate: Date,
  budget: Number,
  actualCost: Number,
  percentComplete: { type: Number, min: 0, max: 100, default: 0 },
  stakeholders: String,
  scope: String,
  deliverables: String,
  assumptions: String,
  constraints: String,
  lessonsLearned: String,
  relatedServices: [ref('Service')],
  regulatoryDriver: String, // mis. kewajiban rencana pengembangan TI (RPTI) bank
});
projectSchema.plugin(basePlugin);

const sprintSchema = new Schema({
  name: { type: String, required: [true, 'Nama sprint wajib diisi'], trim: true },
  project: { ...ref('Project'), required: [true, 'Proyek wajib dipilih'] },
  goal: String,
  status: { type: String, enum: ['planned', 'active', 'completed'], default: 'planned' },
  startDate: Date,
  endDate: Date,
  capacityPoints: Number,
  reviewNotes: String,
  retrospectiveNotes: String,
});
sprintSchema.plugin(basePlugin);

const backlogSchema = new Schema({
  title: { type: String, required: [true, 'Judul wajib diisi'], trim: true },
  itemType: { type: String, enum: ['epic', 'story', 'task', 'bug', 'spike'], default: 'story' },
  project: { ...ref('Project'), required: [true, 'Proyek wajib dipilih'] },
  sprint: ref('Sprint'),
  status: { type: String, enum: ['backlog', 'todo', 'in_progress', 'review', 'done'], default: 'backlog' },
  priority: { type: String, enum: ['must', 'should', 'could', 'wont'], default: 'should' }, // MoSCoW
  storyPoints: Number,
  assignee: ref('User'),
  description: String,
  acceptanceCriteria: String,
  relatedChange: ref('Change'),
});
backlogSchema.plugin(basePlugin);

module.exports = {
  Project: mongoose.model('Project', projectSchema),
  Sprint: mongoose.model('Sprint', sprintSchema),
  BacklogItem: mongoose.model('BacklogItem', backlogSchema),
};
