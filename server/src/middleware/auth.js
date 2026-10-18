const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const { HttpError } = require('./error');
const { hasRole } = require('../../../shared/roles.mjs');
const { effectivePermissions, canPage } = require('../../../shared/permissions.mjs');
const { PLATFORM_ROLE } = require('../constants');

/**
 * Verifikasi JWT dan tetapkan konteks tenant (req.tenant) + matriks hak akses efektif (req.perms).
 * Token memuat id tenant (tid) dan harus cocok dengan tenant milik user — mencegah akses lintas tenant.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Autentikasi diperlukan');
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user || !user.active) throw new HttpError(401, 'Akun tidak aktif atau tidak ditemukan');
    if (String(user.tenant || '') !== String(payload.tid || '')) throw new HttpError(401, 'Token tidak valid untuk workspace ini');
    req.user = user;
    req.tenant = null;
    if (user.tenant) {
      const tenant = await Tenant.findById(user.tenant);
      if (!tenant) throw new HttpError(401, 'Workspace tidak ditemukan');
      if (tenant.status === 'suspended') throw new HttpError(403, 'Workspace ditangguhkan. Hubungi administrator platform.');
      req.tenant = tenant;
      req.perms = effectivePermissions(tenant);
    }
    next();
  } catch (err) {
    next(err instanceof HttpError ? err : new HttpError(401, 'Token tidak valid'));
  }
}

/** Rute data tenant: tolak operator platform (tidak boleh melihat data pelanggan). */
function requireTenant(req, res, next) {
  return req.tenant ? next() : next(new HttpError(403, 'Rute ini hanya untuk pengguna workspace'));
}

function requirePlatform(req, res, next) {
  return !req.tenant && req.user?.roles.includes(PLATFORM_ROLE) ? next() : next(new HttpError(403, 'Hanya operator platform'));
}

function authorize(...roles) {
  return (req, res, next) =>
    hasRole(req.user, roles.flat()) ? next() : next(new HttpError(403, 'Akses ditolak untuk peran Anda'));
}

const pageGuard = (page) => (req, res, next) =>
  canPage(req.user, page) ? next() : next(new HttpError(403, 'Akses ditolak untuk peran Anda'));

module.exports = { authenticate, authorize, requireTenant, requirePlatform, pageGuard, hasRole };
