const { Schema } = require('mongoose');

const activitySchema = new Schema(
  {
    type: { type: String, enum: ['comment', 'worknote', 'transition', 'system'], default: 'comment' },
    message: String,
    from: String,
    to: String,
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

// Jejak keputusan persetujuan multi-tahap (shared/approvals.mjs)
const approvalSchema = new Schema({
  step: String,
  decision: { type: String, enum: ['approved', 'rejected'] },
  comment: String,
  approver: { type: Schema.Types.ObjectId, ref: 'User' },
  approverName: String,
  round: { type: Number, default: 1 },
  at: { type: Date, default: Date.now },
});

/** Setiap dokumen milik satu tenant — dasar isolasi data multi-tenant. */
function tenantPlugin(schema) {
  schema.add({ tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true } });
}

/** Field standar: tenant, nomor (unik per tenant), jejak aktivitas, pembuat/pengubah. */
function basePlugin(schema) {
  tenantPlugin(schema);
  schema.add({
    number: { type: String },
    activities: [activitySchema],
    approvals: [approvalSchema],
    approvalRound: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  });
  schema.index({ tenant: 1, number: 1 }, { unique: true, partialFilterExpression: { number: { $type: 'string' } } });
  if (schema.path('status')) schema.index({ tenant: 1, status: 1 });
  schema.set('timestamps', true);
  schema.set('toJSON', { virtuals: true });
}

const ref = (model) => ({ type: Schema.Types.ObjectId, ref: model });

module.exports = { activitySchema, approvalSchema, basePlugin, tenantPlugin, ref };
