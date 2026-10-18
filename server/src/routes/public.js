// Endpoint publik (tanpa login) untuk situs publik: status layanan, knowledge base publik, katalog
const express = require('express');
const mongoose = require('mongoose');
const Setting = require('../models/Setting');
const { Incident, Change } = require('../models/itsm');
const { Service } = require('../models/assets');
const { KnowledgeArticle } = require('../models/governance');
const { asyncHandler, HttpError } = require('../middleware/error');
const { serviceStatuses, publicMaintenance, publicArticle, publicService } = require('../../../shared/public.mjs');

const router = express.Router();
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PUBLIC_KB = { status: 'published', audience: 'public' };

router.get(
  '/info',
  asyncHandler(async (req, res) => {
    const s = await Setting.get();
    res.json({ organizationName: s.organizationName, industry: s.industry, enabledFrameworks: s.enabledFrameworks });
  })
);

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const services = await Service.find({ status: 'live', type: { $ne: 'supporting' } }).sort('name').lean();
    const [incidents, changes] = await Promise.all([
      Incident.find({ status: { $in: ['new', 'assigned', 'in_progress', 'pending'] } }).select('service priority majorIncident status createdAt').lean(),
      Change.find({ status: { $in: ['approved', 'scheduled', 'implementing'] } }).select('service status type plannedStart plannedEnd actualStart').lean(),
    ]);
    res.json({ services: serviceStatuses(services, incidents, changes), maintenance: publicMaintenance(changes, services), updatedAt: new Date() });
  })
);

router.get(
  '/knowledge',
  asyncHandler(async (req, res) => {
    const filter = { ...PUBLIC_KB };
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const rx = new RegExp(escapeRegex(req.query.q.trim()), 'i');
      filter.$or = [{ title: rx }, { content: rx }, { category: rx }, { tags: rx }];
    }
    const items = await KnowledgeArticle.find(filter).sort('-publishedAt').limit(50).lean();
    res.json({ items: items.map((a) => publicArticle(a)) });
  })
);

router.get(
  '/knowledge/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'ID tidak valid');
    const a = await KnowledgeArticle.findOneAndUpdate({ _id: req.params.id, ...PUBLIC_KB }, { $inc: { views: 1 } }, { new: true }).lean();
    if (!a) throw new HttpError(404, 'Artikel tidak ditemukan');
    res.json(publicArticle(a, true));
  })
);

router.get(
  '/catalog',
  asyncHandler(async (req, res) => {
    const items = await Service.find({ status: 'live', requestable: true }).sort('requestCategory name').lean();
    res.json({ items: items.map(publicService) });
  })
);

module.exports = router;
