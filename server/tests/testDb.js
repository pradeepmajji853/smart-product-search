import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });

// The test suite truncates its database, so refuse anything that looks like a real one.
export function getTestDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set. See .env.example and docs/TESTING.md.');
  }
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to run tests against "${dbName}": the test database name must contain "test".`);
  }
  if (process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).pathname === new URL(url).pathname &&
      new URL(process.env.DATABASE_URL).host === new URL(url).host) {
    throw new Error('TEST_DATABASE_URL must point to a different database than DATABASE_URL.');
  }
  return url;
}
