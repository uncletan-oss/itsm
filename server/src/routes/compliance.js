const express = require('express');
const { Control } = require('../models/governance');
const { authorize, pageGuard } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { audit } = require('../services/audit');
const { syncControls } = require('../services/provision');
const { frameworks, industries } = require('../../../shared/frameworks.mjs');

const router = express.Router();

router.get('/catalog', (req, res) =>
  res.json({ industries, frameworks: frameworks.map(({ controls, ...f }) => ({ ...f, controlCount: controls.length })) })
);

router.post(
  '/sync',
  authorize('risk_officer', 'security_officer'),
  asyncHandler(async (req, res) => {
    const created = await syncControls(req.tenant._id, req.tenant.enabledFrameworks);
    await audit(req, 'sync_controls', 'controls', null, { frameworks: req.tenant.enabledFrameworks, created });
    res.json({ created, frameworks: req.tenant.enabledFrameworks });
  })
);

/** Ringkasan kepatuhan per framework (persentase implementasi) untuk tenant aktif. */
router.get(
  '/summary',
  pageGuard('compliance'),
  asyncHandler(async (req, res) => {
    const enabled = req.tenant.enabledFrameworks;
    const rows = await Control.aggregate([
      { $match: { tenant: req.tenant._id, frameworkId: { $in: enabled } } },
      { $group: { _id: { fw: '$frameworkId', status: '$status' }, n: { $sum: 1 } } },
    ]);
    const byFw = {};
    for (const r of rows) {
      byFw[r._id.fw] = byFw[r._id.fw] || { total: 0 };
      byFw[r._id.fw][r._id.status] = r.n;
      byFw[r._id.fw].total += r.n;
    }
    const summary = enabled.map((id) => {
      const fw = frameworks.find((f) => f.id === id);
      const c = byFw[id] || { total: 0 };
      const applicable = c.total - (c.not_applicable || 0);
      const score = applicable ? Math.round((((c.implemented || 0) + (c.partial || 0) * 0.5) / applicable) * 100) : 0;
      return { id, name: fw?.name, type: fw?.type, issuer: fw?.issuer, note: fw?.note, counts: c, score };
    });
    res.json({ industry: req.tenant.industry, summary });
  })
);

module.exports = router;
