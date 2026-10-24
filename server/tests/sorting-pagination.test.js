import { describe, expect, it } from 'vitest';
import { setupTestApp, ids } from './helpers.js';
import { FIXTURE_PRODUCTS, expectedIds } from './fixtures.js';

const { search } = setupTestApp();
const SORTS = ['price_asc', 'price_desc', 'rating_desc', 'newest', 'name_asc'];
const TOTAL = FIXTURE_PRODUCTS.length;

async function collectAllPages(query, limit) {
  const all = [];
  let page = 1;
  for (;;) {
    const res = await search({ ...query, limit, page });
    expect(res.status).toBe(200);
    all.push(...ids(res));
    if (!res.body.pagination.hasNextPage) return { all, pages: page, last: res.body.pagination };
    page += 1;
  }
}

describe('sorting', () => {
  it.each(SORTS)('orders the whole catalogue correctly for sort=%s', async (sort) => {
    const res = await search({ sort, limit: 100 });
    expect(ids(res)).toEqual(expectedIds({ sort }));
  });

  it('sorts by price low to high and high to low', async () => {
    const asc = (await search({ sort: 'price_asc', limit: 100 })).body.data.map((p) => p.price);
    const desc = (await search({ sort: 'price_desc', limit: 100 })).body.data.map((p) => p.price);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    expect(desc).toEqual([...asc].reverse());
    expect(asc[0]).toBe(9.99);
    expect(desc[0]).toBe(1499);
  });

  it('sorts by highest rating first', async () => {
    const res = await search({ sort: 'rating_desc', limit: 3 });
    expect(res.body.data.map((p) => p.rating)).toEqual([4.9, 4.8, 4.7]);
  });

  it('sorts newest first', async () => {
    const res = await search({ sort: 'newest', limit: 100 });
    const dates = res.body.data.map((p) => p.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('sorts by name A-Z case-insensitively', async () => {
    const names = (await search({ sort: 'name_asc', limit: 100 })).body.data.map((p) => p.name.toLowerCase());
    expect(names).toEqual([...names].sort());
  });

  it('uses newest as the default sort', async () => {
    expect(ids(await search({ limit: 100 }))).toEqual(expectedIds({ sort: 'newest' }));
  });

  it('applies sorting to filtered results', async () => {
    const query = { category: 'Smartphones', sort: 'price_asc' };
    expect(ids(await search(query))).toEqual(expectedIds(query));
    // iPhone 15 and Galaxy S24 share price 799.00: the lower id comes first.
    expect(ids(await search(query))).toEqual([10, 8, 9]);
  });
});

describe('pagination', () => {
  it('defaults to 20 items per page with accurate metadata', async () => {
    const res = await search({});
    expect(res.body.data).toHaveLength(20);
    expect(res.body.pagination).toEqual({
      page: 1, limit: 20, total: TOTAL, totalPages: 2, hasNextPage: true, hasPreviousPage: false,
    });
    const last = await search({ page: 2 });
    expect(last.body.data).toHaveLength(TOTAL - 20);
    expect(last.body.pagination).toMatchObject({ page: 2, hasNextPage: false, hasPreviousPage: true });
  });

  it('keeps search, filters and sort applied across pages', async () => {
    const query = { q: 'e', inStock: 'true', minPrice: 10, sort: 'price_desc' };
    const expected = expectedIds(query);
    expect(expected.length).toBeGreaterThan(10);
    const { all, last } = await collectAllPages(query, 4);
    expect(all).toEqual(expected);
    expect(last.total).toBe(expected.length);
    expect(last.totalPages).toBe(Math.ceil(expected.length / 4));
  });

  it.each(SORTS)('pages through equal sort values without duplicates or gaps (sort=%s)', async (sort) => {
    // All 20 "Tie Widget" rows have identical price, rating, created_at and name.
    const { all, pages } = await collectAllPages({ category: 'Testing', sort }, 7);
    expect(pages).toBe(3);
    expect(all).toHaveLength(20);
    expect(new Set(all).size).toBe(20);
    expect(all).toEqual(expectedIds({ category: 'Testing', sort }));
  });

  it('returns the same page contents on repeated requests', async () => {
    const first = ids(await search({ category: 'Testing', sort: 'price_asc', limit: 5, page: 2 }));
    for (let i = 0; i < 3; i += 1) {
      expect(ids(await search({ category: 'Testing', sort: 'price_asc', limit: 5, page: 2 }))).toEqual(first);
    }
  });

  it('returns an empty page but the correct total for an out-of-range page', async () => {
    const res = await search({ category: 'Testing', page: 99, limit: 7 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [],
      pagination: { page: 99, limit: 7, total: 20, totalPages: 3, hasNextPage: false, hasPreviousPage: true },
    });
  });

  it('accepts the maximum page size of 100', async () => {
    const res = await search({ limit: 100 });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(TOTAL);
    expect(res.body.pagination.totalPages).toBe(1);
  });
});
