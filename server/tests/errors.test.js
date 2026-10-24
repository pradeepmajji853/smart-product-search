import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createPool } from '../src/db.js';
import { setupTestApp } from './helpers.js';

const { api } = setupTestApp();

describe('database error handling', () => {
  it('returns a generic 500 without leaking SQL or internals', async () => {
    const secretError = Object.assign(new Error('relation "products" does not exist at SELECT ... password=hunter2'), {
      code: '42P01',
    });
    const db = { query: vi.fn().mockRejectedValue(secretError) };
    const res = await request(createApp({ db })).get('/api/products?q=sony');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
    expect(JSON.stringify(res.body)).not.toMatch(/relation|SELECT|hunter2|42P01/);
  });

  describe('when the database is unreachable', () => {
    // Nothing listens on port 1, so connecting fails with ECONNREFUSED.
    const deadPool = createPool('postgres://nobody:secret@127.0.0.1:1/product_catalog_test', {
      connectionTimeoutMillis: 2000,
    });
    afterAll(() => deadPool.end());
    const deadApi = request(createApp({ db: deadPool }));

    it('returns 503 for searches', async () => {
      const res = await deadApi.get('/api/products');
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(JSON.stringify(res.body)).not.toMatch(/secret|nobody|127\.0\.0\.1/);
    });

    it('reports a degraded health check', async () => {
      const res = await deadApi.get('/api/health');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'degraded', database: 'down' });
    });
  });

  it('still validates input before touching the database', async () => {
    const db = { query: vi.fn() };
    const res = await request(createApp({ db })).get('/api/products?minPrice=-5');
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('other endpoints', () => {
  it('reports a healthy database', async () => {
    const res = await api.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('lists categories and brands with counts', async () => {
    const res = await api.get('/api/filters');
    expect(res.status).toBe(200);
    expect(res.body.categories.map((c) => c.value)).toEqual([
      'Apparel', 'Audio', 'Books', 'Kitchen', 'Laptops', 'Smartphones', 'Testing',
    ]);
    expect(res.body.categories.find((c) => c.value === 'Testing').count).toBe(20);
    expect(res.body.brands.find((b) => b.value === 'Sony').count).toBe(2);
    expect(res.body.price).toEqual({ min: 9.99, max: 1499 });
  });

  it('narrows brand options to the selected categories', async () => {
    const res = await api.get('/api/filters?category=Laptops&category=Kitchen');
    expect(res.status).toBe(200);
    expect(res.body.brands).toEqual([
      { value: 'Apple', count: 1 }, { value: 'Dell', count: 1 }, { value: 'Lenovo', count: 1 },
      { value: 'Philips', count: 1 }, { value: 'Prestige', count: 1 },
    ]);
    expect(res.body.categories).toHaveLength(7);
  });

  it('serves SVG placeholder images', async () => {
    const res = await api.get('/api/images/audio/AUD-1001.svg');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/svg\+xml/);
    expect(res.body.toString('utf8')).toContain('AUD-1001');
  });

  it('rejects malformed image paths', async () => {
    expect((await api.get('/api/images/audio/%3Cscript%3E.svg')).status).toBe(404);
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await api.get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'Route GET /api/does-not-exist not found' });
  });
});
