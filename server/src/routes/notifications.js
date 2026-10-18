const express = require('express');
const Notification = require('../models/Notification');
const { asyncHandler } = require('../middleware/error');

const router = express.Router();
const mine = (req) => ({ tenant: req.tenant._id, user: req.user._id });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [items, unread] = await Promise.all([
      Notification.find(mine(req)).sort('-createdAt').limit(30),
      Notification.countDocuments({ ...mine(req), read: false }),
    ]);
    res.json({ items, unread });
  })
);

router.post('/read-all', asyncHandler(async (req, res) => {
  await Notification.updateMany({ ...mine(req), read: false }, { read: true });
  res.json({ ok: true });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  await Notification.updateOne({ ...mine(req), _id: req.params.id }, { read: true });
  res.json({ ok: true });
}));

module.exports = router;
