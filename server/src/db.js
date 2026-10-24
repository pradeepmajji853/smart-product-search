import pg from 'pg';

export function createPool(connectionString, overrides = {}) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and configure it.');
  }
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    // Abort runaway queries instead of tying up a connection.
    statement_timeout: 5000,
    ...overrides,
  });
  // An idle client losing its connection must not crash the process.
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));
  return pool;
}
