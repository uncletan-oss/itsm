const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../middleware/error');
const { audit } = require('../services/audit');

const router = express.Router();
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email }).select('+passwordHash +failedLogins +lockedUntil');
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpError(423, `Akun terkunci sementara. Coba lagi setelah ${LOCK_MINUTES} menit.`);
    }
    if (!user || !user.active || !(await user.checkPassword(password))) {
      if (user) {
        user.failedLogins = (user.failedLogins || 0) + 1;
        if (user.failedLogins >= MAX_FAILED) {
          user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
          user.failedLogins = 0;
        }
        await user.save();
      }
      await audit({ ip: req.ip, user: user || undefined }, 'login_failed', 'auth', null, { email });
      throw new HttpError(401, 'Email atau password salah');
    }
    user.failedLogins = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save();
    req.user = user;
    await audit(req, 'login', 'auth', user);
    const token = jwt.sign({ sub: String(user._id), roles: user.roles }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    res.json({ token, user });
  })
);

router.get('/me', authenticate, (req, res) => res.json(req.user));

router.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!(await user.checkPassword(String(req.body.currentPassword || '')))) throw new HttpError(400, 'Password lama salah');
    await user.setPassword(String(req.body.newPassword || ''));
    await user.save();
    await audit(req, 'change_password', 'auth', user);
    res.json({ ok: true });
  })
);

module.exports = router;
