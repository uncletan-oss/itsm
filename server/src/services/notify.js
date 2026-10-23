const User = require('../models/User');
const Notification = require('../models/Notification');
const { notificationsFor } = require('../../../shared/notify.mjs');

/** Buat notifikasi in-app sesuai aturan di shared/notify.mjs (target user langsung atau berdasarkan peran). */
async function notify(req, event) {
  try {
    const rules = notificationsFor({ ...event, actor: req.user });
    if (!rules.length) return;
    const docs = [];
    for (const n of rules) {
      let ids = n.userIds || [];
      if (n.vendors?.length) {
        const users = await User.find({ tenant: req.tenant._id, active: true, roles: 'supplier', vendor: { $in: n.vendors } }).select('_id');
        ids = [...ids, ...users.map((u) => String(u._id))];
      }
      if (n.roles?.length) {
        const users = await User.find({ tenant: req.tenant._id, active: true, roles: { $in: n.roles } }).select('_id');
        ids = [...ids, ...users.map((u) => String(u._id)).filter((u) => u !== String(req.user._id))];
      }
      for (const user of new Set(ids)) docs.push({ tenant: req.tenant._id, user, title: n.title, body: n.body, kind: n.kind || 'info', link: n.link });
    }
    if (docs.length) await Notification.insertMany(docs);
  } catch (err) {
    console.error('Gagal membuat notifikasi', err);
  }
}

/** Notifikasi langsung (dipakai portal penyedia): target { userIds, roles, vendors }. */
async function notifyTargets(req, target, n) {
  try {
    let ids = (target.userIds || []).map(String);
    if (target.roles?.length) ids = [...ids, ...(await User.find({ tenant: req.tenant._id, active: true, roles: { $in: target.roles } }).select('_id')).map((u) => String(u._id))];
    if (target.vendors?.length) ids = [...ids, ...(await User.find({ tenant: req.tenant._id, active: true, roles: 'supplier', vendor: { $in: target.vendors } }).select('_id')).map((u) => String(u._id))];
    const docs = [...new Set(ids)].filter((u) => u !== String(req.user._id)).map((user) => ({ tenant: req.tenant._id, user, title: n.title, body: n.body, kind: n.kind || 'info', link: n.link }));
    if (docs.length) await Notification.insertMany(docs);
  } catch (err) {
    console.error('Gagal membuat notifikasi', err);
  }
}

module.exports = { notify, notifyTargets };
