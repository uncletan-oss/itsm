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

/** Field standar untuk semua record: nomor, status, jejak aktivitas, pembuat/pengubah. */
function basePlugin(schema) {
  schema.add({
    number: { type: String, index: true, unique: true, sparse: true },
    activities: [activitySchema],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  });
  schema.set('timestamps', true);
  schema.set('toJSON', { virtuals: true });
}

const ref = (model) => ({ type: Schema.Types.ObjectId, ref: model });

module.exports = { activitySchema, basePlugin, ref };
