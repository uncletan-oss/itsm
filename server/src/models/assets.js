// Service Catalog, CMDB (Service Configuration Mgmt), ITAM (ISO/IEC 19770), Supplier Mgmt
const mongoose = require('mongoose');
const { Schema } = mongoose;
const { basePlugin, ref } = require('./common');

const serviceSchema = new Schema({
  name: { type: String, required: [true, 'Nama layanan wajib diisi'], trim: true },
  description: String,
  type: { type: String, enum: ['business', 'technical', 'supporting'], default: 'business' },
  status: { type: String, enum: ['pipeline', 'live', 'retired'], default: 'live' },
  owner: ref('User'),
  criticality: { type: String, enum: ['critical', 'high', 'medium', 'low'], default: 'medium' },
  requestable: { type: Boolean, default: false },
  requestCategory: String,
  requiresApproval: { type: Boolean, default: false },
  availabilityTarget: Number, // persen, mis. 99.5
  rtoHours: Number,
  rpoHours: Number,
  supportHours: String,
  dependsOn: [ref('Service')],
});
serviceSchema.plugin(basePlugin);

const ciSchema = new Schema({
  name: { type: String, required: [true, 'Nama CI wajib diisi'], trim: true },
  ciType: {
    type: String,
    enum: ['server', 'virtual_machine', 'database', 'application', 'network_device', 'storage', 'cloud_service', 'container', 'endpoint', 'other'],
    default: 'server',
  },
  status: { type: String, enum: ['planned', 'active', 'maintenance', 'retired'], default: 'active' },
  environment: { type: String, enum: ['production', 'dr', 'staging', 'development', 'test'], default: 'production' },
  owner: ref('User'),
  supportGroup: String,
  ipAddress: String,
  hostname: String,
  version: String,
  location: String,
  dataCenter: { type: String, enum: ['', 'primary_dc', 'drc', 'cloud', 'colocation', 'branch'] },
  // Lokasi penempatan sistem elektronik (PADK 1/2026, PP 71/2019)
  hostingCountry: { type: String, default: 'Indonesia' },
  dataClassification: { type: String, enum: ['public', 'internal', 'confidential', 'restricted'], default: 'internal' },
  processesPersonalData: { type: Boolean, default: false },
  services: [ref('Service')],
  dependsOn: [ref('ConfigurationItem')],
  asset: ref('Asset'),
  vendor: ref('Vendor'),
});
ciSchema.plugin(basePlugin);

const assetSchema = new Schema({
  name: { type: String, required: [true, 'Nama aset wajib diisi'], trim: true },
  assetTag: String,
  category: { type: String, enum: ['hardware', 'software', 'license', 'cloud', 'network', 'mobile', 'other'], default: 'hardware' },
  status: {
    type: String,
    enum: ['requested', 'ordered', 'in_stock', 'deployed', 'in_repair', 'retired', 'disposed'],
    default: 'in_stock',
  },
  manufacturer: String,
  model: String,
  serialNumber: String,
  assignedTo: ref('User'),
  location: String,
  vendor: ref('Vendor'),
  purchaseDate: Date,
  purchaseCost: Number,
  currency: { type: String, default: 'IDR' },
  depreciationYears: Number,
  warrantyEnd: Date,
  // Lisensi perangkat lunak (Software Asset Management)
  licenseType: { type: String, enum: ['', 'perpetual', 'subscription', 'oem', 'open_source', 'volume'] },
  licenseSeats: Number,
  licenseSeatsUsed: Number,
  licenseExpiry: Date,
  // Disposal yang aman (sanitasi media — NIST SP 800-88)
  disposalMethod: { type: String, enum: ['', 'wipe', 'degauss', 'physical_destruction', 'resale', 'donation'] },
  disposalDate: Date,
  disposalCertificate: String,
  notes: String,
});
assetSchema.plugin(basePlugin);

// Manajemen Penyedia Jasa TI (POJK 11/2022, PADK 1/2026, NIST CSF GV.SC)
const vendorSchema = new Schema({
  name: { type: String, required: [true, 'Nama vendor wajib diisi'], trim: true },
  category: { type: String, enum: ['cloud', 'data_center', 'software', 'hardware', 'network', 'managed_service', 'consulting', 'other'], default: 'other' },
  status: { type: String, enum: ['prospect', 'onboarding', 'active', 'under_review', 'terminated'], default: 'active' },
  criticality: { type: String, enum: ['critical', 'high', 'medium', 'low'], default: 'medium' },
  contactName: String,
  contactEmail: String,
  contractNumber: String,
  contractStart: Date,
  contractEnd: Date,
  contractValue: Number,
  slaSummary: String,
  // Due diligence & kepatuhan
  dueDiligenceDate: Date,
  dueDiligenceResult: { type: String, enum: ['', 'passed', 'passed_with_findings', 'failed'] },
  certifications: [String], // mis. ISO 27001, SOC 2, PCI DSS
  dataLocation: { type: String, default: 'Indonesia' },
  offshoreApproval: String, // referensi persetujuan regulator bila sistem ditempatkan di luar Indonesia
  rightToAudit: { type: Boolean, default: false },
  exitStrategy: String,
  subcontractors: String,
  lastAuditDate: Date,
  riskRating: { type: String, enum: ['', 'low', 'medium', 'high', 'critical'] },
  notes: String,
});
vendorSchema.plugin(basePlugin);

module.exports = {
  Service: mongoose.model('Service', serviceSchema),
  ConfigurationItem: mongoose.model('ConfigurationItem', ciSchema),
  Asset: mongoose.model('Asset', assetSchema),
  Vendor: mongoose.model('Vendor', vendorSchema),
};
