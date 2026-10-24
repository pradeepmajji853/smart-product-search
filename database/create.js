// Creates the databases named in DATABASE_URL and TEST_DATABASE_URL if they do not exist.
// Connects to the server's "postgres" maintenance database with the same credentials.
// Usage: node database/create.js
import pg from 'pg';
import { loadEnv } from './env.js';

loadEnv();
const urls = [process.env.DATABASE_URL, process.env.TEST_DATABASE_URL].filter(Boolean);
if (urls.length === 0) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and configure it.');
  process.exit(1);
}

for (const url of urls) {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    console.error(`Unsupported database name "${name}" (letters, digits and underscores only).`);
    process.exit(1);
  }
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  try {
    await client.connect();
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rowCount > 0) {
      console.log(`Database "${name}" already exists.`);
    } else {
      // Identifiers cannot be bound as parameters; the name is validated above.
      await client.query(`CREATE DATABASE "${name}"`);
      console.log(`Created database "${name}".`);
    }
  } catch (err) {
    console.error(`Could not create "${name}": ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
