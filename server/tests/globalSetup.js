import pg from 'pg';
import { applySchema } from '../../database/setup.js';
import { insertProducts } from '../../database/seed.js';
import { FIXTURE_PRODUCTS } from './fixtures.js';
import { getTestDatabaseUrl } from './testDb.js';

// Rebuilds the isolated test database from scratch before the suite runs.
export default async function setup() {
  process.env.NODE_ENV = 'test';
  const client = new pg.Client({ connectionString: getTestDatabaseUrl() });
  await client.connect();
  try {
    await applySchema(client, { drop: true });
    await client.query('BEGIN');
    await insertProducts(client, FIXTURE_PRODUCTS);
    await client.query('COMMIT');
    await client.query('ANALYZE products');
  } finally {
    await client.end();
  }
}
