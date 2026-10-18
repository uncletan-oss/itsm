const mongoose = require('mongoose');
const { PLAN_KEYS, SLUG_RX } = require('../../../shared/plans.mjs');

// Tenant = satu organisasi pelanggan SaaS dengan data, pengguna, dan konfigurasi sendiri
const tenantSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [SLUG_RX, 'Kode workspace tidak valid'] },
    name: { type: String, required: [true, 'Nama organisasi wajib diisi'], trim: true },
    industry: { type: String, default: 'general' },
    plan: { type: String, enum: PLAN_KEYS, default: 'professional' },
    status: { type: String, enum: ['trial', 'active', 'suspended'], default: 'trial' },
    trialEndsAt: Date,
    enabledFrameworks: { type: [String], default: [] },
    timezone: { type: String, default: 'Asia/Jakarta' },
    dataResidency: { type: String, default: 'Indonesia' },
    regulatorContact: String,
    branding: {
      tagline: String,
      accent: { type: String, match: [/^#[0-9a-fA-F]{6}$/, 'Warna harus format #RRGGBB'] },
    },
    // Diatur operator platform: modul yang di-grant (kosong = default paket) & batas pengguna (kosong = default paket)
    modules: { type: [String], default: undefined },
    maxUsers: { type: Number, default: null },
    // Override matriks hak akses per resource { incidents: { read: [...], write: [...] } }
    permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model('Tenant', tenantSchema);
