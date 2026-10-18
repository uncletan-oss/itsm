const express = require('express');
const Setting = require('../models/Setting');
const { authorize } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/error');
const { audit, diff } = require('../services/audit');
const { frameworks, industries } = require('../data/frameworks');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => res.json(await Setting.get())));

router.put(
  '/',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const s = await Setting.get();
    const before = s.toObject();
    const keys = ['organizationName', 'industry', 'enabledFrameworks', 'timezone', 'dataResidency', 'businessHours', 'regulatorContact'];
    for (const k of keys) if (req.body[k] !== undefined) s[k] = req.body[k];
    if (!industries.some((i) => i.id === s.industry)) throw new HttpError(400, 'Industri tidak dikenal');
    const known = new Set(frameworks.map((f) => f.id));
    s.enabledFrameworks = s.enabledFrameworks.filter((f) => known.has(f));
    // Ganti industri tanpa memilih framework → aktifkan paket default industri tersebut
    if (req.body.industry && req.body.industry !== before.industry && req.body.enabledFrameworks === undefined) {
      s.enabledFrameworks = industries.find((i) => i.id === s.industry).frameworks;
    }
    await s.save();
    await audit(req, 'update', 'settings', { _id: undefined, number: 'org' }, diff(before, s.toObject(), keys));
    res.json(s);
  })
);

module.exports = router;
