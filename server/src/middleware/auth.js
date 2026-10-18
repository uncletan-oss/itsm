const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const { HttpError } = require('./error');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Autentikasi diperlukan');
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user || !user.active) throw new HttpError(401, 'Akun tidak aktif atau tidak ditemukan');
    req.user = user;
    next();
  } catch (err) {
    next(err instanceof HttpError ? err : new HttpError(401, 'Token tidak valid'));
  }
}

function hasRole(user, roles) {
  if (!roles || roles.includes('*')) return true;
  return user.roles.includes('admin') || user.roles.some((r) => roles.includes(r));
}

function authorize(...roles) {
  return (req, res, next) =>
    hasRole(req.user, roles.flat()) ? next() : next(new HttpError(403, 'Akses ditolak untuk peran Anda'));
}

module.exports = { authenticate, authorize, hasRole };
