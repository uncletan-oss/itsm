// Portal penyedia (vendor self-service): seluruh logika & whitelist field ada di shared/supplier.mjs
const express = require('express');
const { asyncHandler, HttpError } = require('../middleware/error');
const { makeStore } = require('../services/records');
const { audit } = require('../services/audit');
const { supplierRoute } = require('../../../shared/supplier.mjs');

module.exports = function buildSupplierRouter(registry) {
  const router = express.Router();
  router.use((req, res, next) => (req.user.roles.includes('supplier') ? next() : next(new HttpError(403, 'Hanya untuk akun penyedia'))));
  router.all(
    '/*',
    asyncHandler(async (req, res) => {
      const segments = req.params[0].split('/').filter(Boolean);
      try {
        const out = await supplierRoute(makeStore(req, registry), req.user, req.method, segments, req.body || {}, req.query);
        if (req.method !== 'GET') await audit(req, 'supplier_portal', segments[0], out?._id ? out : null, { action: segments.slice(1).join('/') || req.method });
        const created = req.method === 'POST' && (segments.length === 1 || segments[2] === 'quotations');
        res.status(created ? 201 : 200).json(out);
      } catch (e) {
        if (e.status) throw new HttpError(e.status, e.message);
        throw e;
      }
    })
  );
  return router;
};
