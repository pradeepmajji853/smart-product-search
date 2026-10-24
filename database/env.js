import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv() {
  dotenv.config({ path: path.join(root, '.env'), quiet: true });
}

// --database-url <url> overrides DATABASE_URL (handy for seeding a second database).
export function resolveDatabaseUrl(args = []) {
  const flag = args.indexOf('--database-url');
  const url = flag !== -1 ? args[flag + 1] : process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and configure it.');
  }
  return url;
}
