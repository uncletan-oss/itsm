const mongoose = require('mongoose');
const { tenantPlugin } = require('./common');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    body: String,
    kind: { type: String, default: 'info' },
    link: { resource: String, supplier: String, id: String },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);
notificationSchema.plugin(tenantPlugin);
notificationSchema.index({ tenant: 1, user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
