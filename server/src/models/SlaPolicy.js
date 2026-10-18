const mongoose = require('mongoose');

const slaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    appliesTo: { type: String, enum: ['incident', 'request'], required: true },
    priority: { type: Number, min: 1, max: 4, required: true },
    responseMinutes: { type: Number, required: true, min: 1 },
    resolutionMinutes: { type: Number, required: true, min: 1 },
    active: { type: Boolean, default: true },
    description: String,
  },
  { timestamps: true }
);
slaSchema.index({ appliesTo: 1, priority: 1 });

module.exports = mongoose.model('SlaPolicy', slaSchema);
