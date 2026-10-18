// Dashboard, laporan, Pekerjaan Saya & pencarian global — semuanya dibatasi tenant & hak akses peran
const express = require('express');
const { asyncHandler } = require('../middleware/error');
const { hasRole, pageGuard } = require('../middleware/auth');
const User = require('../models/User');
const { computeDashboard, computeReports, computeMyWork } = require('../../../shared/insights.mjs');
const { computeKpi } = require('../../../shared/kpi.mjs');

const { APPROVALS } = require('../../../shared/approvals.mjs');

const APPROVAL_RESOURCES = Object.keys(APPROVALS);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isRequesterOnly = (u) => !u.roles.some((r) => r !== 'requester');

module.exports = function buildInsightsRouter(registry) {
  const router = express.Router();
  const canRead = (req, res) => req.perms[res]?.enabled && hasRole(req.user, req.perms[res].read);
  const loadAll = async (req, names, filterFor = () => ({}), select) => {
    const out = {};
    await Promise.all(
      names.filter((n) => canRead(req, n)).map(async (n) => {
        out[n] = await registry[n].model.find({ tenant: req.tenant._id, ...filterFor(n) }).select(select || '-activities').lean();
      })
    );
    return out;
  };

  router.get(
    '/dashboard',
    asyncHandler(async (req, res) => {
      if (isRequesterOnly(req.user)) {
        const mine = { $or: [{ requester: req.user._id }, { createdBy: req.user._id }] };
        const data = await loadAll(req, ['incidents', 'requests'], () => mine, 'status');
        const count = (xs = []) => xs.reduce((a, d) => ({ ...a, [d.status]: (a[d.status] || 0) + 1 }), {});
        return res.json({ role: 'requester', incidents: { byStatus: count(data.incidents) }, requests: { byStatus: count(data.requests) } });
      }
      const data = await loadAll(req, ['incidents', 'requests', 'problems', 'changes', 'risks', 'assets', 'vendors', 'continuity', 'projects']);
      const users = await User.find({ tenant: req.tenant._id }).select('name').lean();
      const names = Object.fromEntries(users.map((u) => [String(u._id), u.name]));
      res.json({ ...computeDashboard(data, { userName: (id) => names[String(id)] }), visible: Object.keys(data) });
    })
  );

  router.get(
    '/reports',
    pageGuard('reports'),
    asyncHandler(async (req, res) => {
      const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 365);
      const since = new Date(Date.now() - days * 864e5);
      const recentOrOpen = () => ({ $or: [{ createdAt: { $gte: since } }, { updatedAt: { $gte: since } }, { status: { $nin: ['closed', 'cancelled'] } }] });
      const data = await loadAll(req, ['incidents', 'requests', 'changes', 'problems'], recentOrOpen);
      const services = canRead(req, 'services') ? await registry.services.model.find({ tenant: req.tenant._id }).select('name').lean() : [];
      const svcName = Object.fromEntries(services.map((s) => [String(s._id), s.name]));
      res.json(computeReports(data, { days, serviceName: (id) => svcName[String(id)] }));
    })
  );

  // Dashboard KPI lintas domain: tren 6 bulan, keuangan, GRC, DCIM, BCM — hanya untuk data yang boleh dibaca user
  router.get(
    '/kpi',
    pageGuard('kpi'),
    asyncHandler(async (req, res) => {
      const period = Math.min(Math.max(Number(req.query.months) || 6, 3), 12);
      const since = new Date(Date.now() - (period + 1) * 31 * 864e5);
      const recentOrOpen = () => ({ $or: [{ createdAt: { $gte: since } }, { updatedAt: { $gte: since } }, { status: { $nin: ['closed', 'cancelled'] } }] });
      const data = await loadAll(req, ['incidents', 'changes', 'requests', 'problems'], recentOrOpen);
      Object.assign(data, await loadAll(req, ['budgets', 'invoices', 'payments', 'risks', 'controls', 'findings', 'risk-actions', 'control-tests', 'datacenters', 'racks', 'dc-access', 'continuity', 'bia', 'dr-tests', 'services', 'assets', 'vendors', 'contracts']));
      res.json(computeKpi(data, { period }));
    })
  );

  router.get(
    '/my-work',
    asyncHandler(async (req, res) => {
      const data = await loadAll(req, ['incidents', 'requests', 'problems', 'changes', 'backlog', 'risks', 'knowledge', ...APPROVAL_RESOURCES, 'risk-actions', 'findings'], (n) => ({
        status: { $nin: ['closed', 'cancelled', 'done', 'published', 'retired', 'rejected', 'paid', 'reconciled', 'verified', 'disposed', 'terminated', 'expired', 'posted', 'reversed'] },
        ...(registry[n].scope ? registry[n].scope(req.user) : {}),
      }));
      res.json(computeMyWork(data, req.user, { hasRole, canRead: (n) => !!data[n] }));
    })
  );

  router.get(
    '/search',
    asyncHandler(async (req, res) => {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (q.length < 2) return res.json([]);
      const rx = new RegExp(escapeRegex(q), 'i');
      const groups = [];
      for (const [name, def] of Object.entries(registry)) {
        if (!canRead(req, name) || !def.search?.length) continue;
        const items = await def.model
          .find({ tenant: req.tenant._id, ...(def.scope ? def.scope(req.user) : {}), $or: def.search.map((f) => ({ [f]: rx })) })
          .select('number title name status code')
          .sort('-updatedAt')
          .limit(5)
          .lean();
        if (items.length) groups.push({ resource: name, label: def.label, items });
      }
      res.json(groups);
    })
  );

  return router;
};
