import { describe, expect, it } from 'vitest';
import { setupTestApp, ids } from './helpers.js';
import { FIXTURE_PRODUCTS } from './fixtures.js';

const { search, api, pool } = setupTestApp();
const TOTAL = FIXTURE_PRODUCTS.length;

async function tableIsIntact() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM products');
  expect(rows[0].n).toBe(TOTAL);
}

describe('SQL injection resistance', () => {
  it.each([
    "' OR '1'='1",
    "' OR 1=1 --",
    "'; DROP TABLE products; --",
    "x' UNION SELECT * FROM products --",
    '"; SELECT pg_sleep(5); --',
    "\\'; DELETE FROM products; --",
  ])('treats keyword %j as literal text', async (q) => {
    const res = await search({ q });
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(0);
    await tableIsIntact();
  });

  it('treats SQL keywords in the search box as searchable text', async () => {
    // The O'Reilly book's description literally contains "DROP TABLE".
    expect(ids(await search({ q: 'DROP TABLE' }))).toEqual([16]);
    await tableIsIntact();
  });

  it('treats injection attempts in category and brand as literal values', async () => {
    for (const value of ["Audio' OR '1'='1", "Sony'); DROP TABLE products; --", "' OR brand IS NOT NULL --"]) {
      const res = await search({ category: value, brand: value });
      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(0);
    }
    await tableIsIntact();
  });

  it('rejects injection attempts in numeric, boolean and sort parameters', async () => {
    const attempts = [
      { minPrice: '0 OR 1=1' },
      { maxPrice: '1; DROP TABLE products' },
      { minRating: "4' --" },
      { inStock: 'true OR 1=1' },
      { page: '1; DELETE FROM products' },
      { limit: '10 UNION SELECT 1' },
      { sort: 'price DESC; DROP TABLE products' },
      { sort: '(SELECT 1)' },
    ];
    for (const query of attempts) {
      expect((await search(query)).status, JSON.stringify(query)).toBe(400);
    }
    await tableIsIntact();
  });

  it('rejects nested/object query parameters', async () => {
    const res = await api.get('/api/products?minPrice[$gt]=0');
    // The "simple" query parser keeps the bracketed key as an unknown parameter.
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(TOTAL);
  });
});

describe('LIKE wildcard escaping', () => {
  it('matches a literal percent sign instead of everything', async () => {
    expect(ids(await search({ q: '%' })).sort((a, b) => a - b)).toEqual([11, 13]);
    expect(ids(await search({ q: '100%' }))).toEqual([13]);
  });

  it('matches a literal underscore instead of any single character', async () => {
    expect(ids(await search({ q: '_' }))).toEqual([14]);
    expect(ids(await search({ q: 'under_score' }))).toEqual([14]);
    // Unescaped, "o_t" would match "Cotton"; escaped, it matches no row.
    expect(ids(await search({ q: 'o_t' }))).toEqual([]);
  });

  it('does not let % act as a multi-character wildcard', async () => {
    // Unescaped, "s%y" would match "Sony" (and much more).
    expect(ids(await search({ q: 's%y' }))).toEqual([]);
  });

  it('matches a literal backslash', async () => {
    expect(ids(await search({ q: '\\' }))).toEqual([15]);
    expect(ids(await search({ q: 'back\\slash' }))).toEqual([15]);
  });

  it('matches apostrophes literally', async () => {
    expect(ids(await search({ q: "o'reilly" }))).toEqual([16]);
  });

  it('strips control characters such as NUL instead of failing', async () => {
    const res = await search({ q: 'sony\u0000' });
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
  });
});
