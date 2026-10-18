const express = require('express');
const User = require('../models/User');
const { ROLES, ROLE_KEYS } = require('../constants');
const { authorize } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../middleware/error');
const { audit, diff } = require('../services/audit');
const { PLANS } = require('../../../shared/plans.mjs');

const router = express.Router();
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validRoles = (roles) => (Array.isArray(roles) ? roles.filter((r) => ROLE_KEYS.includes(r)) : undefined);

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
    if (req.query.active !== 'all') filter.active = true;
    const items = await User.find(filter).sort('name').limit(500);
    const limit = PLANS[req.tenant.plan]?.maxUsers ?? null;
    res.json({ items, total: items.length, limit, used: await User.countDocuments({ tenant: req.tenant._id, active: true }) });
  })
);

router.post(
  '/',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const max = PLANS[req.tenant.plan]?.maxUsers;
    if (max && (await User.countDocuments({ tenant: req.tenant._id, active: true })) >= max) {
      throw new HttpError(402, `Batas ${max} pengguna aktif untuk paket ${PLANS[req.tenant.plan].name} tercapai. Upgrade paket untuk menambah pengguna.`);
    }
    const { name, email, password, department, title, phone } = req.body;
    const user = new User({ tenant: req.tenant._id, name, email, roles: validRoles(req.body.roles) || ['requester'], department, title, phone });
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
    if (String(user._id) === String(req.user._id) && (!user.active || !user.roles.includes('admin'))) {
      throw new HttpError(422, 'Tidak dapat menonaktifkan / mencabut peran admin dari akun sendiri');
    }
    if (req.body.password) await user.setPassword(req.body.password);
    await user.save();
    await audit(req, 'update', 'users', user, diff(before, user.toObject(), [...allowed, 'roles']));
    res.json(user);
  })
);

module.exports = router;
