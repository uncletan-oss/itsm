// Pengaturan workspace (tenant) & matriks hak akses — khusus admin tenant
const express = require('express');
const { pageGuard } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { audit, diff } = require('../services/audit');
const { frameworks, industries } = require('../../../shared/frameworks.mjs');
const { DEFAULT_PERMISSIONS, PAGES, effectivePermissions, sanitizeOverrides } = require('../../../shared/permissions.mjs');
const { ROLES } = require('../constants');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => res.json(req.tenant)));

router.put(
  '/',
  pageGuard('settings'),
  asyncHandler(async (req, res) => {
    const t = req.tenant;
    const before = t.toObject();
    const keys = ['name', 'industry', 'enabledFrameworks', 'timezone', 'dataResidency', 'regulatorContact', 'branding'];
    for (const k of keys) if (req.body[k] !== undefined) t[k] = req.body[k];
    if (!industries.some((i) => i.id === t.industry)) throw new HttpError(400, 'Industri tidak dikenal');
    const known = new Set(frameworks.map((f) => f.id));
    t.enabledFrameworks = t.enabledFrameworks.filter((f) => known.has(f));
    // Ganti industri tanpa memilih framework → aktifkan paket default industri tersebut
    if (req.body.industry && req.body.industry !== before.industry && req.body.enabledFrameworks === undefined) {
      t.enabledFrameworks = industries.find((i) => i.id === t.industry).frameworks;
    }
    await t.save();
    await audit(req, 'update', 'tenant', t, diff(before, t.toObject(), keys));
    res.json(t);
  })
);

router.get(
  '/access',
  pageGuard('access'),
  (req, res) => res.json({ roles: ROLES, defaults: DEFAULT_PERMISSIONS, pages: PAGES, overrides: req.tenant.permissions || {}, effective: req.perms })
);

router.put(
  '/access',
  pageGuard('access'),
  asyncHandler(async (req, res) => {
    const before = req.tenant.permissions || {};
    req.tenant.permissions = sanitizeOverrides(req.body.overrides || {});
    req.tenant.markModified('permissions');
    await req.tenant.save();
    await audit(req, 'update_access', 'tenant', req.tenant, { permissions: { from: before, to: req.tenant.permissions } });
    res.json({ overrides: req.tenant.permissions, effective: effectivePermissions(req.tenant) });
  })
);

module.exports = router;
