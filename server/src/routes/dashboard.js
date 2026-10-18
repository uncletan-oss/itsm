const express = require('express');
const { asyncHandler } = require('../middleware/error');
const { Incident, ServiceRequest, Problem, Change } = require('../models/itsm');
const { Asset, Vendor } = require('../models/assets');
const { Risk, ContinuityPlan } = require('../models/governance');
const { Project } = require('../models/projects');
const { hasRole } = require('../middleware/auth');

const router = express.Router();
const OPEN_INC = ['new', 'assigned', 'in_progress', 'pending'];
const OPEN_REQ = ['submitted', 'pending_approval', 'approved', 'fulfilling'];

const countBy = async (Model, field, match = {}) =>
  Object.fromEntries((await Model.aggregate([{ $match: match }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }])).map((r) => [r._id ?? 'none', r.n]));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 864e5);
    const since30 = new Date(now.getTime() - 30 * 864e5);
    const isStaff = req.user.roles.some((r) => r !== 'requester');
    if (!isStaff) {
      const mine = { $or: [{ requester: req.user._id }, { createdBy: req.user._id }] };
      const [inc, reqs] = await Promise.all([countBy(Incident, 'status', mine), countBy(ServiceRequest, 'status', mine)]);
      return res.json({ role: 'requester', incidents: { byStatus: inc }, requests: { byStatus: reqs } });
    }

    const resolved30 = { 'sla.resolvedAt': { $gte: since30 } };
    const [
      incByStatus, incByPriority, incOpenBreached, incResolved30, incMet30, majorOpen, regReportable,
      reqByStatus, prbByStatus, chgByStatus, chgUpcoming,
      riskByLevel, assetByStatus, licensesExpiring, warrantyExpiring,
      vendorsContractEnding, vendorsCritical, drOverdue, projByHealth,
    ] = await Promise.all([
      countBy(Incident, 'status'),
      countBy(Incident, 'priority', { status: { $in: OPEN_INC } }),
      Incident.countDocuments({ status: { $in: OPEN_INC }, 'sla.resolutionDue': { $lt: now }, 'sla.pausedAt': null }),
      Incident.countDocuments(resolved30),
      Incident.countDocuments({ ...resolved30, 'sla.resolutionBreached': false }),
      Incident.countDocuments({ majorIncident: true, status: { $in: OPEN_INC } }),
      Incident.countDocuments({ regulatoryReportable: true, regulatorReportedAt: null, status: { $ne: 'cancelled' } }),
      countBy(ServiceRequest, 'status'),
      countBy(Problem, 'status'),
      countBy(Change, 'status'),
      Change.find({ status: { $in: ['approved', 'scheduled'] }, plannedStart: { $gte: now } })
        .sort('plannedStart').limit(5).select('number title type risk plannedStart status'),
      countBy(Risk, 'inherentLevel', { status: { $ne: 'closed' } }),
      countBy(Asset, 'status'),
      Asset.countDocuments({ licenseExpiry: { $gte: now, $lte: in30 } }),
      Asset.countDocuments({ warrantyEnd: { $gte: now, $lte: in30 } }),
      Vendor.countDocuments({ status: 'active', contractEnd: { $gte: now, $lte: new Date(now.getTime() + 90 * 864e5) } }),
      Vendor.countDocuments({ criticality: 'critical', status: 'active' }),
      ContinuityPlan.countDocuments({ status: { $ne: 'retired' }, $or: [{ nextTestDate: { $lt: now } }, { lastTestDate: null }] }),
      countBy(Project, 'health', { status: { $nin: ['closed', 'cancelled'] } }),
    ]);

    const recentIncidents = await Incident.find({ status: { $in: OPEN_INC } })
      .sort('priority -createdAt').limit(8).select('number title priority status sla createdAt').populate('assignee', 'name');

    res.json({
      role: 'staff',
      incidents: {
        byStatus: incByStatus,
        openByPriority: incByPriority,
        openBreached: incOpenBreached,
        majorOpen,
        regulatoryPending: regReportable,
        slaCompliance30d: incResolved30 ? Math.round((incMet30 / incResolved30) * 100) : null,
        resolved30d: incResolved30,
        recent: recentIncidents,
      },
      requests: { byStatus: reqByStatus },
      problems: { byStatus: prbByStatus },
      changes: { byStatus: chgByStatus, upcoming: chgUpcoming },
      risks: { openByLevel: riskByLevel },
      assets: { byStatus: assetByStatus, licensesExpiring30d: licensesExpiring, warrantyExpiring30d: warrantyExpiring },
      vendors: { contractsEnding90d: vendorsContractEnding, critical: vendorsCritical },
      continuity: { testOverdue: drOverdue },
      projects: { byHealth: projByHealth },
      canSeeAudit: hasRole(req.user, ['auditor', 'risk_officer', 'security_officer']),
    });
  })
);

module.exports = router;
