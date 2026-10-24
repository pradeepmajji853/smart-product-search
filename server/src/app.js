import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { createApiRouter } from './routes.js';
import { errorHandler, notFoundHandler } from './errors.js';

export function createApp({ db, clientDist } = {}) {
  if (!db) throw new Error('createApp requires a db with a query() method');
  const app = express();

  // "simple" parser: repeated keys become arrays, but no nested objects (?a[b]=c).
  app.set('query parser', 'simple');
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  if (process.env.NODE_ENV !== 'test') {
    app.use((req, res, next) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
      });
      next();
    });
  }

  app.use('/api', createApiRouter(db));
  app.use('/api', notFoundHandler);

  // In production the built React app is served by the same process.
  if (clientDist && fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
