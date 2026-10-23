// Endpoint publik (tanpa login): pendaftaran SaaS & situs bantuan per tenant
const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const Tenant = require('../models/Tenant');
const { Incident, Change } = require('../models/itsm');
const { Service } = require('../models/assets');
const { KnowledgeArticle } = require('../models/governance');
const { asyncHandler, HttpError } = require('../middleware/error');
const { provisionTenant } = require('../services/provision');
const { signToken } = require('./auth');
const { audit } = require('../services/audit');
const User = require('../models/User');
const { Vendor } = require('../models/assets');
const { notify } = require('../services/notify');
const { grantedModules } = require('../../../shared/permissions.mjs');
const { validateSupplierRegistration, vendorFromRegistration } = require('../../../shared/supplier.mjs');
const { serviceStatuses, publicMaintenance, publicArticle, publicService } = require('../../../shared/public.mjs');

const router = express.Router();
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Pendaftaran workspace baru (trial 14 hari)
router.post(
  '/signup',
  rateLimit({ windowMs: 60 * 60 * 1000, limit: 10 }),
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const plan = ['starter', 'professional'].includes(b.plan) ? b.plan : 'professional';
    const { tenant, user } = await provisionTenant({
      slug: String(b.slug || '').toLowerCase().trim(),
      name: String(b.organizationName || '').trim(),
      industry: b.industry,
      plan,
      admin: { name: String(b.adminName || '').trim(), email: String(b.adminEmail || '').toLowerCase().trim(), password: String(b.password || '') },
    });
    await audit({ ip: req.ip, user }, 'signup', 'tenant', tenant, { plan, industry: tenant.industry }, tenant._id);
    res.status(201).json({ token: signToken(user), workspace: tenant.slug });
  })
);

// ---- Situs bantuan publik per tenant: /api/public/t/:slug/... ----
const t = express.Router({ mergeParams: true });
t.use(
  asyncHandler(async (req, res, next) => {
    const tenant = await Tenant.findOne({ slug: String(req.params.slug).toLowerCase() });
    if (!tenant || tenant.status === 'suspended') throw new HttpError(404, 'Workspace tidak ditemukan');
    req.tenant = tenant;
    next();
  })
);
const PUBLIC_KB = (req) => ({ tenant: req.tenant._id, status: 'published', audience: 'public' });

t.get('/info', (req, res) =>
  res.json({ slug: req.tenant.slug, name: req.tenant.name, industry: req.tenant.industry, enabledFrameworks: req.tenant.enabledFrameworks, branding: req.tenant.branding })
);

t.get(
  '/status',
  asyncHandler(async (req, res) => {
    const tenant = req.tenant._id;
    const services = await Service.find({ tenant, status: 'live', type: { $ne: 'supporting' } }).sort('name').lean();
    const [incidents, changes] = await Promise.all([
      Incident.find({ tenant, status: { $in: ['new', 'assigned', 'in_progress', 'pending'] } }).select('service priority majorIncident status createdAt').lean(),
      Change.find({ tenant, status: { $in: ['approved', 'scheduled', 'implementing'] } }).select('service status type plannedStart plannedEnd actualStart').lean(),
    ]);
    res.json({ services: serviceStatuses(services, incidents, changes), maintenance: publicMaintenance(changes, services), updatedAt: new Date() });
  })
);

t.get(
  '/knowledge',
  asyncHandler(async (req, res) => {
    const filter = PUBLIC_KB(req);
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const rx = new RegExp(escapeRegex(req.query.q.trim()), 'i');
      filter.$or = [{ title: rx }, { content: rx }, { category: rx }, { tags: rx }];
    }
    const items = await KnowledgeArticle.find(filter).sort('-publishedAt').limit(50).lean();
    res.json({ items: items.map((a) => publicArticle(a)) });
  })
);

t.get(
  '/knowledge/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'ID tidak valid');
    const a = await KnowledgeArticle.findOneAndUpdate({ _id: req.params.id, ...PUBLIC_KB(req) }, { $inc: { views: 1 } }, { new: true }).lean();
    if (!a) throw new HttpError(404, 'Artikel tidak ditemukan');
    res.json(publicArticle(a, true));
  })
);

t.get(
  '/catalog',
  asyncHandler(async (req, res) => {
    const items = await Service.find({ tenant: req.tenant._id, status: 'live', requestable: true }).sort('requestCategory name').lean();
    res.json({ items: items.map(publicService) });
  })
);

// Registrasi mandiri penyedia: vendor berstatus prospek (due diligence oleh procurement) + akun portal penyedia
t.post(
  '/supplier-register',
  rateLimit({ windowMs: 60 * 60 * 1000, limit: 10 }),
  asyncHandler(async (req, res) => {
    if (!grantedModules(req.tenant)?.includes('rfqs')) throw new HttpError(404, 'Portal penyedia tidak tersedia untuk workspace ini');
    const { data, error } = validateSupplierRegistration(req.body);
    if (error) throw new HttpError(400, error);
    if (await User.exists({ tenant: req.tenant._id, email: data.email })) throw new HttpError(409, 'Email sudah terdaftar di workspace ini');
    if (await Vendor.exists({ tenant: req.tenant._id, npwp: data.npwp })) throw new HttpError(409, 'NPWP sudah terdaftar — hubungi procurement untuk dibuatkan akun tambahan');
    const vendor = new Vendor({ ...vendorFromRegistration(data), tenant: req.tenant._id });
    vendor.number = await require('../models/Counter').nextNumber(req.tenant._id, 'VND');
    vendor.activities.push({ type: 'system', message: 'Registrasi mandiri melalui portal penyedia', byName: data.contactName });
    await vendor.save();
    const user = new User({ tenant: req.tenant._id, name: data.contactName, email: data.email, roles: ['supplier'], vendor: vendor._id, title: data.companyName });
    await user.setPassword(data.password);
    await user.save();
    const ctx = { ip: req.ip, user, tenant: req.tenant };
    await audit(ctx, 'supplier_register', 'vendors', vendor, { email: data.email, npwp: data.npwp }, req.tenant._id);
    await notify(ctx, { event: 'create', resource: 'vendors', label: 'Vendor', doc: vendor.toObject() });
    res.status(201).json({ token: signToken(user), workspace: req.tenant.slug, vendor: { number: vendor.number, name: vendor.name, status: vendor.status } });
  })
);

router.use('/t/:slug', t);

module.exports = router;
