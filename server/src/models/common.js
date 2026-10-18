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
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  });
  schema.index({ tenant: 1, number: 1 }, { unique: true, partialFilterExpression: { number: { $type: 'string' } } });
  if (schema.path('status')) schema.index({ tenant: 1, status: 1 });
  schema.set('timestamps', true);
  schema.set('toJSON', { virtuals: true });
}

const ref = (model) => ({ type: Schema.Types.ObjectId, ref: model });

module.exports = { activitySchema, basePlugin, tenantPlugin, ref };
