import { describe, expect, it } from 'vitest';
import { setupTestApp, ids } from './helpers.js';
import { FIXTURE_PRODUCTS, expectedIds } from './fixtures.js';

const { search } = setupTestApp();
const TOTAL = FIXTURE_PRODUCTS.length;

// Fetch every matching row in one page, ordered by id, for set comparisons.
async function matchIds(query) {
  const res = await search({ limit: 100, ...query });
  expect(res.status).toBe(200);
  return ids(res).sort((a, b) => a - b);
}

describe('keyword search', () => {
  it('finds a product by its full name', async () => {
    expect(await matchIds({ q: 'Sony WH-1000XM5 Wireless Headphones' })).toEqual([1]);
  });

  it('finds products by a partial word', async () => {
    expect(await matchIds({ q: 'headph' })).toEqual([1, 3]);
    expect(await matchIds({ q: 'xm' })).toEqual([1, 2]);
  });

  it('is case-insensitive', async () => {
    const lower = await matchIds({ q: 'headphones' });
    expect(await matchIds({ q: 'HEADPHONES' })).toEqual(lower);
    expect(await matchIds({ q: 'HeAdPhOnEs' })).toEqual(lower);
    expect(await matchIds({ q: 'phn-3002' })).toEqual([9]);
  });

  it('searches the brand column', async () => {
    expect(await matchIds({ q: 'lenovo' })).toEqual([7]);
    expect(await matchIds({ q: 'TieCo' })).toHaveLength(20);
  });

  it('searches the category column', async () => {
    expect(await matchIds({ q: 'kitchen' })).toEqual([11, 12]);
    expect(await matchIds({ q: 'smartphones' })).toEqual([8, 9, 10]);
  });

  it('searches the description column', async () => {
    expect(await matchIds({ q: 'crispy' })).toEqual([11]);
    expect(await matchIds({ q: 'android' })).toEqual([9, 10]);
  });

  it('searches the SKU column with full and partial SKUs', async () => {
    expect(await matchIds({ q: 'PHN-3002' })).toEqual([9]);
    expect(await matchIds({ q: 'LAP-200' })).toEqual([5, 6, 7]);
  });

  it('requires every word to match, each in any column', async () => {
    // "apple" matches the brand, "laptop" matches the name/description/category.
    expect(await matchIds({ q: 'apple laptop' })).toEqual([5]);
    expect(await matchIds({ q: 'sony earbuds' })).toEqual([2]);
    expect(await matchIds({ q: 'sony laptop' })).toEqual([]);
  });

  it('never matches text spanning two columns', async () => {
    // "Audio" (category) and "AUD-1001" (sku) are adjacent in the combined search text.
    // exact=true: without it, typo correction would (rightly) rescue "audioaud" as "audio".
    expect(await matchIds({ q: 'audioaud', exact: 'true' })).toEqual([]);
    expect(await matchIds({ q: 'sonyaudio', exact: 'true' })).toEqual([]);
  });

  it('ignores surrounding and repeated whitespace', async () => {
    expect(await matchIds({ q: '   bose    headphones  ' })).toEqual([3]);
  });

  it('matches the reference implementation for a range of queries', async () => {
    for (const q of ['a', 'ph', 'pro', 'tee', 'wireless', 'galaxy ai', '13', '4']) {
      expect(await matchIds({ q }), `q=${q}`).toEqual(expectedIds({ q }).sort((a, b) => a - b));
    }
  });
});

describe('filters', () => {
  it('filters by category', async () => {
    expect(await matchIds({ category: 'Laptops' })).toEqual([5, 6, 7]);
  });

  it('filters by brand, including several brands at once', async () => {
    expect(await matchIds({ brand: 'Apple' })).toEqual([5, 8]);
    expect(await matchIds({ brand: ['Sony', 'Bose'] })).toEqual([1, 2, 3]);
  });

  it('matches brand values containing quotes literally', async () => {
    expect(await matchIds({ brand: "O'Reilly" })).toEqual([16]);
  });

  it('treats price bounds as inclusive', async () => {
    const res = await matchIds({ minPrice: 129.99, maxPrice: 349.99 });
    expect(res).toContain(4); // exactly 129.99
    expect(res).toContain(1); // exactly 349.99
    expect(res).toEqual(expectedIds({ minPrice: 129.99, maxPrice: 349.99 }).sort((a, b) => a - b));
    expect(await matchIds({ minPrice: 799, maxPrice: 799 })).toEqual([8, 9]);
  });

  it('supports only a minimum or only a maximum price', async () => {
    expect(await matchIds({ minPrice: 1000 })).toEqual([6, 7]);
    expect(await matchIds({ maxPrice: 10 })).toEqual(expectedIds({ maxPrice: 10 }).sort((a, b) => a - b));
    expect(await matchIds({ maxPrice: 9.99 })).toEqual([15]);
  });

  it('filters by minimum rating inclusively', async () => {
    expect(await matchIds({ minRating: 4.7 })).toEqual([1, 3, 5, 8]);
    expect(await matchIds({ minRating: 5 })).toEqual([]);
    expect(await matchIds({ minRating: 0 })).toHaveLength(TOTAL);
  });

  it('filters by stock availability', async () => {
    expect(await matchIds({ inStock: 'false' })).toEqual([2, 6, 10, 14]);
    const inStock = await matchIds({ inStock: 'true' });
    expect(inStock).toHaveLength(TOTAL - 4);
    expect(inStock).not.toContain(2);
  });

  it('combines keyword search with brand, price range and stock filters', async () => {
    const query = { q: 'headphones', brand: 'Sony', minPrice: 300, maxPrice: 400, inStock: 'true' };
    expect(await matchIds(query)).toEqual([1]);
    // Changing any single criterion changes the result.
    expect(await matchIds({ ...query, brand: 'Bose' })).toEqual([3]);
    expect(await matchIds({ ...query, maxPrice: 340 })).toEqual([]);
  });

  it('combines category, brand, rating and stock filters', async () => {
    expect(await matchIds({ category: 'Smartphones', brand: ['Apple', 'Google'], minRating: 4, inStock: 'true' })).toEqual([8]);
  });

  it('matches the reference implementation for many filter combinations', async () => {
    const combos = [];
    for (const q of [undefined, 'a', 'sony']) {
      for (const category of [undefined, 'Audio', ['Laptops', 'Smartphones']]) {
        for (const range of [{}, { minPrice: 100 }, { minPrice: 100, maxPrice: 800 }]) {
          for (const inStock of [undefined, 'true', 'false']) {
            combos.push({ q, category, ...range, inStock, minRating: q ? undefined : 4.5 });
          }
        }
      }
    }
    for (const combo of combos) {
      const query = Object.fromEntries(Object.entries(combo).filter(([, v]) => v !== undefined));
      expect(await matchIds(query), JSON.stringify(query)).toEqual(expectedIds(query).sort((a, b) => a - b));
    }
  });
});

describe('empty results and clearing filters', () => {
  it('returns an empty page with zero totals when nothing matches', async () => {
    const res = await search({ q: 'zzzz-no-such-product' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      correctedQuery: null,
    });
  });

  it('returns the full catalogue again once filters are cleared', async () => {
    const filtered = await search({ q: 'sony', brand: 'Sony', inStock: 'true' });
    expect(filtered.body.pagination.total).toBe(1);
    const cleared = await search({});
    expect(cleared.body.pagination.total).toBe(TOTAL);
  });

  it('treats empty parameter values as "no filter"', async () => {
    const res = await search({ q: '', category: '', brand: '', minPrice: '', maxPrice: '', minRating: '', inStock: '' });
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(TOTAL);
  });
});

describe('response shape', () => {
  it('returns typed product fields', async () => {
    const res = await search({ q: 'AUD-1001' });
    expect(res.body.data[0]).toEqual({
      id: 1,
      sku: 'AUD-1001',
      name: 'Sony WH-1000XM5 Wireless Headphones',
      description: 'Industry-leading noise-cancelling over-ear headphones.',
      brand: 'Sony',
      category: 'Audio',
      price: 349.99,
      rating: 4.8,
      inStock: true,
      createdAt: '2025-01-10T10:00:00.000Z',
      imageUrl: '/api/images/test/AUD-1001.svg',
    });
  });
});
