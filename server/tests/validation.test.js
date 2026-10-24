import { describe, expect, it } from 'vitest';
import { setupTestApp } from './helpers.js';

const { search, api } = setupTestApp();

async function expectInvalid(query, field) {
  const res = await search(query);
  expect(res.status, JSON.stringify(query)).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
  expect(res.body.error.details.map((d) => d.field)).toContain(field);
  return res.body.error.details.find((d) => d.field === field).message;
}

describe('input validation', () => {
  it('rejects negative prices', async () => {
    expect(await expectInvalid({ minPrice: -1 }, 'minPrice')).toBe('minPrice must not be negative');
    expect(await expectInvalid({ maxPrice: -0.01 }, 'maxPrice')).toBe('maxPrice must not be negative');
  });

  it('rejects a minimum price greater than the maximum price', async () => {
    expect(await expectInvalid({ minPrice: 500, maxPrice: 100 }, 'maxPrice')).toBe(
      'maxPrice must be greater than or equal to minPrice',
    );
  });

  it('accepts equal minimum and maximum prices', async () => {
    expect((await search({ minPrice: 100, maxPrice: 100 })).status).toBe(200);
  });

  it('rejects non-numeric prices', async () => {
    for (const value of ['abc', '1e3', '12,5', '0x10', 'Infinity', 'NaN', '10 OR 1=1']) {
      expect(await expectInvalid({ minPrice: value }, 'minPrice')).toBe('minPrice must be a number');
    }
  });

  it('rejects ratings outside 0-5', async () => {
    await expectInvalid({ minRating: 5.1 }, 'minRating');
    await expectInvalid({ minRating: -1 }, 'minRating');
    await expectInvalid({ minRating: 'high' }, 'minRating');
  });

  it('rejects unknown sort values', async () => {
    const message = await expectInvalid({ sort: 'price' }, 'sort');
    expect(message).toMatch(/price_asc, price_desc, rating_desc, newest, name_asc/);
    await expectInvalid({ sort: 'id; DROP TABLE products' }, 'sort');
  });

  it('rejects invalid page numbers', async () => {
    for (const page of ['0', '-1', '1.5', 'abc', '10001']) await expectInvalid({ page }, 'page');
  });

  it('rejects invalid page sizes', async () => {
    for (const limit of ['0', '-5', '101', '2.5', 'all']) await expectInvalid({ limit }, 'limit');
  });

  it('rejects invalid booleans', async () => {
    for (const inStock of ['yes', 'maybe', '2', 'TRUE']) await expectInvalid({ inStock }, 'inStock');
  });

  it('rejects overly long or overly complex keyword searches', async () => {
    await expectInvalid({ q: 'a'.repeat(101) }, 'q');
    await expectInvalid({ q: Array.from({ length: 11 }, (_, i) => `w${i}`).join(' ') }, 'q');
    expect((await search({ q: 'a'.repeat(100) })).status).toBe(200);
  });

  it('rejects single-value parameters that are repeated', async () => {
    const res = await api.get('/api/products?minPrice=1&minPrice=2');
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toEqual({ field: 'minPrice', message: 'must be provided only once' });
  });

  it('reports every invalid parameter at once', async () => {
    const res = await search({ minPrice: -1, sort: 'x', page: 0, inStock: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(['inStock', 'minPrice', 'page', 'sort']);
  });

  it('ignores unknown query parameters', async () => {
    expect((await search({ foo: 'bar', _: '123' })).status).toBe(200);
  });

  it('accepts 1/0 as booleans', async () => {
    const a = await search({ inStock: '1' });
    const b = await search({ inStock: 'true' });
    expect(a.body.pagination.total).toBe(b.body.pagination.total);
  });
});
