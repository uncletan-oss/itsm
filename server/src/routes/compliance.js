const express = require('express');
const Setting = require('../models/Setting');
const { Control } = require('../models/governance');
const { authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { audit } = require('../services/audit');
const { frameworks, industries } = require('../data/frameworks');

const router = express.Router();

router.get('/catalog', (req, res) =>
  res.json({
    industries,
    frameworks: frameworks.map(({ controls, ...f }) => ({ ...f, controlCount: controls.length })),
  })
);

/** Membuat/memperbarui kontrol untuk framework yang aktif (idempoten; status asesmen tidak ditimpa). */
async function syncControls(frameworkIds) {
  let upserted = 0;
  for (const fw of frameworks.filter((f) => frameworkIds.includes(f.id))) {
    const ops = fw.controls.map((ctl) => ({
      updateOne: {
        filter: { frameworkId: fw.id, code: ctl.code },
        update: {
          $set: { frameworkName: fw.name, title: ctl.title, domain: ctl.domain, nistFunction: ctl.nistFunction, guidance: ctl.guidance },
          $setOnInsert: { status: 'not_assessed', activities: [] },
        },
        upsert: true,
      },
    }));
    const r = await Control.bulkWrite(ops);
    upserted += r.upsertedCount;
  }
  return upserted;
}

router.post(
  '/sync',
  authorize('risk_officer', 'security_officer'),
  asyncHandler(async (req, res) => {
    const s = await Setting.get();
    const created = await syncControls(s.enabledFrameworks);
    await audit(req, 'sync_controls', 'controls', null, { frameworks: s.enabledFrameworks, created });
    res.json({ created, frameworks: s.enabledFrameworks });
  })
);

/** Ringkasan kepatuhan per framework (persentase implementasi). */
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const s = await Setting.get();
    const rows = await Control.aggregate([
      { $match: { frameworkId: { $in: s.enabledFrameworks } } },
      { $group: { _id: { fw: '$frameworkId', status: '$status' }, n: { $sum: 1 } } },
    ]);
    const byFw = {};
    for (const r of rows) {
      byFw[r._id.fw] = byFw[r._id.fw] || { total: 0 };
      byFw[r._id.fw][r._id.status] = r.n;
      byFw[r._id.fw].total += r.n;
    }
    const summary = s.enabledFrameworks.map((id) => {
      const fw = frameworks.find((f) => f.id === id);
      const c = byFw[id] || { total: 0 };
      const applicable = c.total - (c.not_applicable || 0);
      const score = applicable ? Math.round((((c.implemented || 0) + (c.partial || 0) * 0.5) / applicable) * 100) : 0;
      return { id, name: fw?.name, type: fw?.type, issuer: fw?.issuer, note: fw?.note, counts: c, score };
    });
    res.json({ industry: s.industry, summary });
  })
);

module.exports = router;
module.exports.syncControls = syncControls;
