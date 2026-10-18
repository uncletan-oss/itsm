const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'org' },
    organizationName: { type: String, default: 'Organisasi Saya' },
    industry: { type: String, default: 'general' },
    enabledFrameworks: { type: [String], default: [] },
    timezone: { type: String, default: 'Asia/Jakarta' },
    dataResidency: { type: String, default: 'Indonesia' },
    businessHours: {
      start: { type: String, default: '08:00' },
      end: { type: String, default: '17:00' },
      workdays: { type: [Number], default: [1, 2, 3, 4, 5] },
    },
    regulatorContact: String,
  },
  { timestamps: true }
);

settingSchema.statics.get = async function get() {
  return (await this.findById('org')) || this.create({ _id: 'org' });
};

module.exports = mongoose.model('Setting', settingSchema);
