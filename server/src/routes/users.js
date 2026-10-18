const express = require('express');
const User = require('../models/User');
const { ROLES } = require('../constants');
const { authorize } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../middleware/error');
const { audit, diff } = require('../services/audit');

const router = express.Router();
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/roles', (req, res) => res.json(ROLES));

// Daftar user ringkas (untuk dropdown assignee, dsb.) tersedia bagi semua user terautentikasi
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (typeof req.query.q === 'string' && req.query.q) {
      const rx = new RegExp(escapeRegex(req.query.q), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }
    if (typeof req.query.role === 'string' && req.query.role) filter.roles = req.query.role;
    if (req.query.active !== 'all') filter.active = true;
    const items = await User.find(filter).sort('name').limit(500);
    res.json({ items, total: items.length });
  })
);

router.post(
  '/',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const { name, email, password, roles, department, title, phone } = req.body;
    const user = new User({ name, email, roles, department, title, phone });
    await user.setPassword(password);
    await user.save();
    await audit(req, 'create', 'users', user, { email, roles });
    res.status(201).json(user);
  })
);

router.put(
  '/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new HttpError(404, 'User tidak ditemukan');
    const before = user.toObject();
    const allowed = ['name', 'email', 'roles', 'department', 'title', 'phone', 'active'];
    for (const k of allowed) if (req.body[k] !== undefined) user[k] = req.body[k];
    if (String(user._id) === String(req.user._id) && (!user.active || !user.roles.includes('admin'))) {
      throw new HttpError(422, 'Tidak dapat menonaktifkan / mencabut peran admin dari akun sendiri');
    }
    if (req.body.password) await user.setPassword(req.body.password);
    await user.save();
    await audit(req, 'update', 'users', user, diff(before, user.toObject(), allowed));
    res.json(user);
  })
);

module.exports = router;
