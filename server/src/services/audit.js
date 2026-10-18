const AuditLog = require('../models/AuditLog');

const IGNORED = new Set(['updatedAt', 'createdAt', 'activities', '__v', 'updatedBy']);

function diff(before, after, keys) {
  const changes = {};
  for (const k of keys) {
    if (IGNORED.has(k)) continue;
    const a = JSON.stringify(before?.[k] ?? null);
    const b = JSON.stringify(after?.[k] ?? null);
    if (a !== b) changes[k] = { from: before?.[k] ?? null, to: after?.[k] ?? null };
  }
  return changes;
}

async function audit(req, action, resource, record, changes) {
  try {
    await AuditLog.create({
      actor: req.user?._id,
      actorName: req.user?.name,
      action,
      resource,
      recordId: record?._id,
      recordNumber: record?.number || record?.name || record?.title,
      changes,
      ip: req.ip,
    });
  } catch (err) {
    console.error('Gagal menulis audit log', err);
  }
}

module.exports = { audit, diff };
