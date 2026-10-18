const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { authenticate } = require('./middleware/auth');
const { errorHandler, notFound } = require('./middleware/error');
const resources = require('./resources');
const buildResourceRouter = require('./routes/resource');

function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  if (config.env !== 'test') app.use(morgan('dev'));

  app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 50 }), require('./routes/auth'));
  app.use('/api/public', rateLimit({ windowMs: 60 * 1000, limit: 120 }), require('./routes/public'));
  app.use('/api', authenticate);
  app.use('/api/users', require('./routes/users'));
  app.use('/api/settings', require('./routes/settings'));
  app.use('/api/compliance', require('./routes/compliance'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/audit-logs', require('./routes/audit'));
  for (const [name, def] of Object.entries(resources)) {
    app.use(`/api/${name}`, buildResourceRouter(name, def));
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
