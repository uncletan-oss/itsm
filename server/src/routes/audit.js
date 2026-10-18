const express = require('express');
const AuditLog = require('../models/AuditLog');
const { authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');

const router = express.Router();

router.get(
  '/',
  authorize('auditor', 'risk_officer', 'security_officer'),
  asyncHandler(async (req, res) => {
    const filter = {};
    for (const k of ['resource', 'action', 'recordNumber']) if (typeof req.query[k] === 'string' && req.query[k]) filter[k] = req.query[k];
    if (typeof req.query.recordId === 'string' && /^[a-f\d]{24}$/i.test(req.query.recordId)) filter.recordId = req.query.recordId;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort('-at').skip((page - 1) * limit).limit(limit),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  })
);

module.exports = router;
