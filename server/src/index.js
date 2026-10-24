import { config } from './config.js';
import { createPool } from './db.js';
import { createApp } from './app.js';

const pool = createPool(config.databaseUrl);
const app = createApp({ db: pool, clientDist: config.env === 'production' ? config.clientDist : undefined });

const server = app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port} (${config.env})`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
