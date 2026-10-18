const mongoose = require('mongoose');

// Jejak audit append-only (akuntabilitas & non-repudiation — POJK/PADK, ISO 27001 A.8.15, NIST CSF DE.CM)
const auditSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorName: String,
  action: { type: String, required: true }, // create | update | delete | transition | login | login_failed | ...
  resource: { type: String, index: true },
  recordId: { type: mongoose.Schema.Types.ObjectId, index: true },
  recordNumber: String,
  changes: mongoose.Schema.Types.Mixed,
  ip: String,
});

const immutable = function immutable(next) {
  next(new Error('Audit log bersifat immutable'));
};
['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
  auditSchema.pre(op, immutable)
);

module.exports = mongoose.model('AuditLog', auditSchema);
