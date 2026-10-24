// Applies database/schema.sql and database/indexes.sql.
// Usage: node database/setup.js [--drop] [--database-url <url>]
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadEnv, resolveDatabaseUrl } from './env.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function applySchema(client, { drop = false } = {}) {
  if (drop) await client.query('DROP TABLE IF EXISTS products CASCADE');
  await client.query(await readFile(path.join(here, 'schema.sql'), 'utf8'));
  await client.query(await readFile(path.join(here, 'indexes.sql'), 'utf8'));
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const client = new pg.Client({ connectionString: resolveDatabaseUrl(args) });
  await client.connect();
  try {
    await applySchema(client, { drop: args.includes('--drop') });
    console.log('Schema and indexes applied.');
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`Database setup failed: ${err.message}`);
    process.exit(1);
  });
}
