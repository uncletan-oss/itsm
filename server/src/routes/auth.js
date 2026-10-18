const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const { authenticate } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../middleware/error');
const { audit } = require('../services/audit');
const { PLANS } = require('../../../shared/plans.mjs');

const router = express.Router();
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const signToken = (user) => jwt.sign({ sub: String(user._id), tid: user.tenant ? String(user.tenant) : null }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

/** Profil sesi: user, tenant, dan matriks hak akses efektif (dipakai untuk membangun menu). */
function session(req) {
  const t = req.tenant;
  return {
    user: req.user,
    tenant: t && {
      _id: t._id, slug: t.slug, name: t.name, industry: t.industry, plan: t.plan, planName: PLANS[t.plan]?.name,
      status: t.status, trialEndsAt: t.trialEndsAt, branding: t.branding,
    },
    permissions: req.perms || null,
  };
}

// Login: workspace (slug tenant) + email + password. Workspace kosong = operator platform.
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const workspace = String(req.body.workspace || '').toLowerCase().trim();
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    const tenant = workspace ? await Tenant.findOne({ slug: workspace }) : null;
    if (workspace && !tenant) throw new HttpError(401, 'Workspace, email, atau password salah');
    const user = await User.findOne({ tenant: tenant ? tenant._id : null, email }).select('+passwordHash +failedLogins +lockedUntil');
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
      await audit({ ip: req.ip, user }, 'login_failed', 'auth', null, { workspace, email }, tenant?._id || null);
      throw new HttpError(401, 'Workspace, email, atau password salah');
    }
    if (tenant?.status === 'suspended') throw new HttpError(403, 'Workspace ditangguhkan. Hubungi administrator platform.');
    user.failedLogins = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save();
    req.user = user;
    req.tenant = tenant;
    await audit(req, 'login', 'auth', user);
    res.json({ token: signToken(user) });
  })
);

router.get('/me', authenticate, (req, res) => res.json(session(req)));

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
module.exports.signToken = signToken;
