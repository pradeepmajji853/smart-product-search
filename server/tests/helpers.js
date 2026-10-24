import { afterAll } from 'vitest';
import request from 'supertest';
import { createPool } from '../src/db.js';
import { createApp } from '../src/app.js';
import { getTestDatabaseUrl } from './testDb.js';

process.env.NODE_ENV = 'test';

export function setupTestApp() {
  const pool = createPool(getTestDatabaseUrl());
  const app = createApp({ db: pool });
  afterAll(() => pool.end());
  const api = request(app);
  return {
    app,
    pool,
    api,
    // GET /api/products with the given query object; returns the supertest response.
    search: (query = {}) => api.get(`/api/products${toQueryString(query)}`),
  };
}

export const ids = (res) => res.body.data.map((p) => p.id);

// Arrays become repeated keys (?brand=A&brand=B), matching how the client sends them.
export function toQueryString(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}
