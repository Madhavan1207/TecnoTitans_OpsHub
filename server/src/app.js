import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authOptional, HttpError, pgErrorToHttp } from './core.js';
import hub from './routes/hub.js';
import site from './routes/site.js';
import { driverName } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true, exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', authOptional);

  app.get('/api/health', (_req, res) => res.json({ ok: true, db: driverName(), time: new Date().toISOString() }));
  // Fixed hub routes first, then the per-site gateway /api/:siteId/:resource
  app.use('/api', hub);
  app.use('/api/:siteId', site);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

  // Serve the built React app (single-process deploy)
  const dist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const e = pgErrorToHttp(err);
    if (!e.status) {
      if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'Request body is not valid JSON.' });
      console.error('[error]', err);
      return res.status(500).json({ error: 'server_error', message: 'Something went wrong on our side.' });
    }
    res.status(e.status).json({ error: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) });
  });
  return app;
}
