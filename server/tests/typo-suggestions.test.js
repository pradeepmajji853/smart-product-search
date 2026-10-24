import { describe, expect, it } from 'vitest';
import { setupTestApp, ids } from './helpers.js';

const { search, api, pool } = setupTestApp();
const sorted = (list) => [...list].sort((a, b) => a - b);
const suggest = (q) => api.get(`/api/suggestions?${new URLSearchParams(q === undefined ? {} : { q })}`);

describe('typo-tolerant search', () => {
  it('corrects a misspelt word and returns results for the corrected query', async () => {
    const res = await search({ q: 'sonny' });
    expect(res.status).toBe(200);
    expect(res.body.correctedQuery).toBe('sony');
    expect(sorted(ids(res))).toEqual([1, 2]);
  });

  it('corrects only the words that match nothing', async () => {
    const res = await search({ q: 'sonny earbuds' });
    expect(res.body.correctedQuery).toBe('sony earbuds');
    expect(ids(res)).toEqual([2]);

    const twoTypos = await search({ q: 'bosee hedphones' });
    expect(twoTypos.body.correctedQuery).toBe('bose headphones');
    expect(ids(twoTypos)).toEqual([3]);
  });

  it('does not correct queries that already have results', async () => {
    const res = await search({ q: 'sony' });
    expect(res.body.correctedQuery).toBeNull();
    expect(sorted(ids(res))).toEqual([1, 2]);
  });

  it('does not "correct" valid words that are excluded only by filters', async () => {
    const res = await search({ q: 'sony', brand: 'Apple' });
    expect(res.body.pagination.total).toBe(0);
    expect(res.body.correctedQuery).toBeNull();
  });

  it('returns no results and no correction for unrecognisable input', async () => {
    for (const q of ['zzqxv', 'xq', 'sonny zzqxv']) {
      const res = await search({ q });
      expect(res.body.pagination.total, q).toBe(0);
      expect(res.body.correctedQuery, q).toBeNull();
    }
  });

  it('applies filters, sorting and pagination to the corrected query', async () => {
    const filtered = await search({ q: 'hedphones', brand: 'Bose' });
    expect(filtered.body.correctedQuery).toBe('headphones');
    expect(ids(filtered)).toEqual([3]);

    // 20 "Tie Widget" products; "widgit" -> "widget".
    const paged = await search({ q: 'widgit', sort: 'price_asc', limit: 7, page: 3 });
    expect(paged.body.correctedQuery).toBe('widget');
    expect(paged.body.pagination).toEqual({ page: 3, limit: 7, total: 20, totalPages: 3, hasNextPage: false, hasPreviousPage: true });
    expect(ids(paged)).toEqual([31, 32, 33, 34, 35, 36]);
  });

  it('can be disabled with exact=true', async () => {
    const res = await search({ q: 'sonny', exact: 'true' });
    expect(res.body.pagination.total).toBe(0);
    expect(res.body.correctedQuery).toBeNull();
    expect((await search({ q: 'sonny', exact: 'maybe' })).status).toBe(400);
  });

  it('treats injection attempts in misspelt queries as data', async () => {
    const res = await search({ q: "sonny' OR '1'='1" });
    expect(res.status).toBe(200);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM products');
    expect(rows[0].n).toBe(36);
  });
});

describe('GET /api/suggestions (autocomplete)', () => {
  it('suggests brands, then products whose names match', async () => {
    const res = await suggest('son');
    expect(res.status).toBe(200);
    expect(res.body.suggestions[0]).toEqual({ type: 'brand', value: 'Sony', count: 2 });
    const products = res.body.suggestions.filter((s) => s.type === 'product');
    expect(products.map((p) => p.id)).toEqual([1, 2]); // ordered by rating (4.8, 4.6)
    expect(products[0]).toEqual({ type: 'product', id: 1, value: 'Sony WH-1000XM5 Wireless Headphones', brand: 'Sony', category: 'Audio' });
  });

  it('suggests categories', async () => {
    const res = await suggest('aud');
    expect(res.body.suggestions.filter((s) => s.type === 'category')).toEqual([{ type: 'category', value: 'Audio', count: 4 }]);
  });

  it('requires every word to appear in a suggested product name', async () => {
    const res = await suggest('sony ear');
    expect(res.body.suggestions).toEqual([
      { type: 'product', id: 2, value: 'Sony WF-1000XM4 Earbuds', brand: 'Sony', category: 'Audio' },
    ]);
  });

  it('ranks names that start with the query first and caps each group', async () => {
    const res = await suggest('tie');
    const products = res.body.suggestions.filter((s) => s.type === 'product');
    expect(products).toHaveLength(5);
    expect(products.every((p) => p.value === 'Tie Widget')).toBe(true);
    // Equal rating, so the id tie-breaker decides: the first five Tie Widgets.
    expect(products.map((p) => p.id)).toEqual([17, 18, 19, 20, 21]);
    expect(res.body.suggestions.filter((s) => s.type === 'brand').length).toBeLessThanOrEqual(3);
  });

  it('offers a "did you mean" correction when nothing matches', async () => {
    expect((await suggest('sonny')).body.suggestions).toEqual([{ type: 'correction', value: 'sony' }]);
    expect((await suggest('zzqxv')).body.suggestions).toEqual([]);
  });

  it('matches %, _ and quotes literally', async () => {
    expect((await suggest('00%')).body.suggestions).toEqual([
      { type: 'product', id: 13, value: '100% Cotton T-Shirt', brand: 'Wildcard Co', category: 'Apparel' },
    ]);
    expect((await suggest('r_s')).body.suggestions.map((s) => s.id)).toEqual([14]);
    const res = await suggest("' OR '1'='1");
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([]);
  });

  it('returns an empty list for empty or too-short input', async () => {
    expect((await suggest(undefined)).body).toEqual({ suggestions: [] });
    expect((await suggest('   ')).body).toEqual({ suggestions: [] });
    // Fewer than 3 characters in every word: no suggestions (no index-assisted lookup possible).
    expect((await suggest('so')).body).toEqual({ suggestions: [] });
    expect((await suggest('so ne')).body).toEqual({ suggestions: [] });
    expect((await suggest('so ear')).body.suggestions.map((s) => s.id)).toEqual([2]);
  });

  it('validates the query', async () => {
    const long = await suggest('a'.repeat(101));
    expect(long.status).toBe(400);
    expect(long.body.error.details[0]).toEqual({ field: 'q', message: 'q must be at most 100 characters' });
    expect((await suggest(Array.from({ length: 11 }, (_, i) => `w${i}`).join(' '))).status).toBe(400);
    expect((await api.get('/api/suggestions?q=a&q=b')).status).toBe(400);
  });
});
