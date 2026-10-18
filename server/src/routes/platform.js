// Konsol operator platform SaaS: kelola tenant (tanpa akses ke data operasional tenant)
const express = require('express');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const { Incident } = require('../models/itsm');
const { asyncHandler, HttpError } = require('../middleware/error');
const { provisionTenant } = require('../services/provision');
const { audit } = require('../services/audit');
const { PLAN_KEYS, ALL_MODULES } = require('../../../shared/plans.mjs');
const { grantedModules, userLimit } = require('../../../shared/permissions.mjs');

const router = express.Router();

router.get(
  '/tenants',
  asyncHandler(async (req, res) => {
    const tenants = await Tenant.find().sort('-createdAt').lean();
    const [users, tickets] = await Promise.all([
      User.aggregate([{ $match: { tenant: { $ne: null }, active: true } }, { $group: { _id: '$tenant', n: { $sum: 1 } } }]),
      Incident.aggregate([{ $group: { _id: '$tenant', n: { $sum: 1 } } }]),
    ]);
    const u = Object.fromEntries(users.map((x) => [String(x._id), x.n]));
    const k = Object.fromEntries(tickets.map((x) => [String(x._id), x.n]));
    res.json({
      items: tenants.map(({ permissions, ...x }) => ({
        ...x, activeUsers: u[String(x._id)] || 0, incidents: k[String(x._id)] || 0,
        grantedModules: grantedModules(x), customModules: !!x.modules?.length, userLimit: userLimit(x),
      })),
    });
  })
);

router.post(
  '/tenants',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const { tenant } = await provisionTenant({
      slug: String(b.slug || '').toLowerCase().trim(), name: b.name, industry: b.industry, plan: b.plan, status: b.status || 'active',
      admin: { name: b.adminName, email: String(b.adminEmail || '').toLowerCase().trim(), password: b.adminPassword },
    });
    await audit(req, 'create', 'tenants', tenant, { plan: tenant.plan, industry: tenant.industry }, null);
    res.status(201).json(tenant);
  })
);

router.put(
  '/tenants/:id',
  asyncHandler(async (req, res) => {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) throw new HttpError(404, 'Tenant tidak ditemukan');
    const changes = {};
    if (req.body.plan !== undefined) {
      if (!PLAN_KEYS.includes(req.body.plan)) throw new HttpError(400, 'Paket tidak dikenal');
      changes.plan = { from: tenant.plan, to: req.body.plan };
      tenant.plan = req.body.plan;
    }
    if (req.body.status !== undefined) {
      if (!['trial', 'active', 'suspended'].includes(req.body.status)) throw new HttpError(400, 'Status tidak dikenal');
      changes.status = { from: tenant.status, to: req.body.status };
      tenant.status = req.body.status;
    }
    // Grant modul per tenant: array modul (override paket) atau null untuk kembali ke default paket
    if (req.body.modules !== undefined) {
      const mods = Array.isArray(req.body.modules) ? req.body.modules.filter((m) => ALL_MODULES.includes(m)) : null;
      changes.modules = { from: tenant.modules || null, to: mods };
      tenant.modules = mods?.length ? mods : undefined;
    }
    if (req.body.maxUsers !== undefined) {
      const n = req.body.maxUsers === null || req.body.maxUsers === '' ? null : Number(req.body.maxUsers);
      if (n !== null && (!Number.isInteger(n) || n < 1)) throw new HttpError(400, 'Batas pengguna harus bilangan bulat ≥ 1');
      changes.maxUsers = { from: tenant.maxUsers, to: n };
      tenant.maxUsers = n;
    }
    await tenant.save();
    await audit(req, 'update', 'tenants', tenant, changes, null);
    res.json(tenant);
  })
);

module.exports = router;
