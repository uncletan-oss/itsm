const express = require('express');
const User = require('../models/User');
const { ROLES, ROLE_KEYS } = require('../constants');
const { authorize } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../middleware/error');
const { audit, diff } = require('../services/audit');
const { PLANS } = require('../../../shared/plans.mjs');
const { userLimit } = require('../../../shared/permissions.mjs');

const router = express.Router();
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mongoose = require('mongoose');
const { normalizeRoles } = require('../../../shared/roles.mjs');

const validRoles = normalizeRoles;
// Akun penyedia (portal vendor) tidak memakai kuota pengguna paket
const INTERNAL = { roles: { $ne: 'supplier' } };

/** Akun penyedia wajib ditautkan ke vendor milik tenant yang sama. */
async function vendorFor(req, roles, vendor) {
  if (!roles?.includes('supplier')) return null;
  if (!vendor || !mongoose.isValidObjectId(vendor)) throw new HttpError(400, 'Akun penyedia wajib ditautkan ke vendor');
  const v = await mongoose.model('Vendor').findOne({ _id: vendor, tenant: req.tenant._id }).select('_id');
  if (!v) throw new HttpError(400, 'Vendor tidak ditemukan');
  return v._id;
}

router.get('/roles', (req, res) => res.json(ROLES));

// Daftar user ringkas di tenant (untuk dropdown assignee, dsb.)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = { tenant: req.tenant._id };
    if (typeof req.query.q === 'string' && req.query.q) {
      const rx = new RegExp(escapeRegex(req.query.q), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }
    if (typeof req.query.role === 'string' && req.query.role) filter.roles = req.query.role;
    else if (req.query.kind !== 'all') Object.assign(filter, INTERNAL); // dropdown internal tidak menampilkan akun penyedia
    if (req.query.active !== 'all') filter.active = true;
    const items = await User.find(filter).sort('name').limit(500);
    const limit = userLimit(req.tenant);
    res.json({ items, total: items.length, limit, used: await User.countDocuments({ tenant: req.tenant._id, active: true, ...INTERNAL }) });
  })
);

router.post(
  '/',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const max = userLimit(req.tenant);
    const roles = validRoles(req.body.roles) || ['requester'];
    if (max && !roles.includes('supplier') && (await User.countDocuments({ tenant: req.tenant._id, active: true, ...INTERNAL })) >= max) {
      throw new HttpError(402, `Batas ${max} pengguna aktif untuk workspace ini (paket ${PLANS[req.tenant.plan].name}) tercapai. Hubungi operator platform untuk menambah kuota.`);
    }
    const { name, email, password, department, title, phone } = req.body;
    const user = new User({ tenant: req.tenant._id, name, email, roles, department, title, phone, vendor: await vendorFor(req, roles, req.body.vendor) });
    await user.setPassword(password);
    await user.save();
    await audit(req, 'create', 'users', user, { email, roles: user.roles });
    res.status(201).json(user);
  })
);

router.put(
  '/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, tenant: req.tenant._id });
    if (!user) throw new HttpError(404, 'User tidak ditemukan');
    const before = user.toObject();
    const allowed = ['name', 'email', 'department', 'title', 'phone', 'active'];
    for (const k of allowed) if (req.body[k] !== undefined) user[k] = req.body[k];
    if (req.body.roles !== undefined) user.roles = validRoles(req.body.roles);
    if (req.body.roles !== undefined || req.body.vendor !== undefined) user.vendor = await vendorFor(req, user.roles, req.body.vendor ?? user.vendor);
    if (String(user._id) === String(req.user._id) && (!user.active || !user.roles.includes('admin'))) {
      throw new HttpError(422, 'Tidak dapat menonaktifkan / mencabut peran admin dari akun sendiri');
    }
    if (req.body.password) await user.setPassword(req.body.password);
    await user.save();
    await audit(req, 'update', 'users', user, diff(before, user.toObject(), [...allowed, 'roles', 'vendor']));
    res.json(user);
  })
);

module.exports = router;
