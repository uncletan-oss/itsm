const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { authenticate, requireTenant, requirePlatform } = require('./middleware/auth');
const { errorHandler, notFound, HttpError } = require('./middleware/error');
const resources = require('./resources');
const buildResourceRouter = require('./routes/resource');
const buildInsightsRouter = require('./routes/insights');

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  if (config.env !== 'test') app.use(morgan('dev'));

  app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

  app.use('/api/public', rateLimit({ windowMs: 60 * 1000, limit: 120 }), require('./routes/public'));
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 50 }), require('./routes/auth'));
  app.use('/api', authenticate);
  app.use('/api/platform', requirePlatform, require('./routes/platform'));
  app.use('/api', requireTenant);
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/supplier', require('./routes/supplier')(resources));
  // Akun penyedia (pihak eksternal) hanya boleh memakai portal penyedia & notifikasinya
  app.use('/api', (req, res, next) => (req.user.roles.includes('supplier') ? next(new HttpError(403, 'Akun penyedia hanya dapat mengakses portal penyedia')) : next()));
  app.use('/api/tenant', require('./routes/tenant'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/compliance', require('./routes/compliance'));
  app.use('/api/audit-logs', require('./routes/audit'));
  app.use('/api', buildInsightsRouter(resources));
  for (const [name, def] of Object.entries(resources)) {
    app.use(`/api/${name}`, buildResourceRouter(name, def, resources));
  }
  app.use('/api', notFound);

  // Production: sajikan build React — situs publik di / dan portal di /portal/
  const dist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(['/portal', '/portal/*'], (req, res) => res.sendFile(path.join(dist, 'portal', 'index.html')));
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
