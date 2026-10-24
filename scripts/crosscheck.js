// Black-box cross-check of GET /api/products against an independent JS implementation.
//
// Loads every product straight from PostgreSQL, then for N pseudo-random combinations of
// keyword, category, brands, price range, rating, stock and sort it walks *all* pages of
// the API and compares the ids (and order) with the result of filtering and sorting the
// rows in JavaScript, using the literal "any of the five fields" definition of search.
//
// Usage (API must be running): node scripts/crosscheck.js [--api http://localhost:4000] [--runs 300]
import pg from 'pg';
import { loadEnv, resolveDatabaseUrl } from '../database/env.js';

loadEnv();
const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const API = opt('--api', `http://localhost:${process.env.PORT || 4000}`);
const RUNS = Number(opt('--runs', 300));

const client = new pg.Client({ connectionString: resolveDatabaseUrl(args) });
await client.connect();
const { rows } = await client.query(
  'SELECT id, sku, name, description, brand, category, price::float8 AS price, rating::float8 AS rating, in_stock, created_at FROM products',
);
await client.end();

let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (list) => list[Math.floor(rnd() * list.length)];
const categories = [...new Set(rows.map((r) => r.category))];
const brands = [...new Set(rows.map((r) => r.brand))];
const words = ['pro', 'wireless', 'SONY', 'aud-', 'phn-app', 'laptop', 'X1', 'e', 'cotton', 'smart tv', '4k', 'boat', "levi's", 'nike shoes', 'kitchen', '00042', '%', '_'];
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sorts = {
  price_asc: (a, b) => a.price - b.price || a.id - b.id,
  price_desc: (a, b) => b.price - a.price || b.id - a.id,
  rating_desc: (a, b) => b.rating - a.rating || b.id - a.id,
  newest: (a, b) => b.created_at - a.created_at || b.id - a.id,
  name_asc: (a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase()) || a.id - b.id,
};

function expected(q) {
  const terms = (q.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  return rows
    .filter(
      (r) =>
        terms.every((t) => [r.name, r.description, r.brand, r.category, r.sku].some((f) => f.toLowerCase().includes(t))) &&
        (!q.category || q.category.includes(r.category)) &&
        (!q.brand || q.brand.includes(r.brand)) &&
        (q.minPrice === undefined || r.price >= Number(q.minPrice)) &&
        (q.maxPrice === undefined || r.price <= Number(q.maxPrice)) &&
        (q.minRating === undefined || r.rating >= Number(q.minRating)) &&
        (q.inStock === undefined || r.in_stock === (q.inStock === 'true')),
    )
    .sort(sorts[q.sort])
    .map((r) => r.id);
}

async function actual(q, limit) {
  const ids = [];
  let total;
  for (let page = 1; ; page += 1) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(q)) for (const v of [].concat(value)) params.append(key, v);
    params.set('limit', limit);
    params.set('page', page);
    const res = await fetch(`${API}/api/products?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${params}`);
    const body = await res.json();
    total = body.pagination.total;
    ids.push(...body.data.map((d) => d.id));
    if (!body.pagination.hasNextPage) return { ids, total };
  }
}

let mismatches = 0;
let compared = 0;
for (let i = 0; i < RUNS; i += 1) {
  const q = {};
  if (rnd() < 0.6) q.q = pick(words);
  if (rnd() < 0.4) q.category = [pick(categories)];
  if (rnd() < 0.4) q.brand = [pick(brands), pick(brands)];
  if (rnd() < 0.4) q.minPrice = String(Math.floor(rnd() * 20000));
  if (rnd() < 0.4) q.maxPrice = String(Number(q.minPrice || 0) + Math.floor(rnd() * 80000));
  if (rnd() < 0.3) q.minRating = pick(['3', '3.5', '4', '4.5']);
  if (rnd() < 0.3) q.inStock = pick(['true', 'false']);
  q.sort = pick(Object.keys(sorts));
  const limit = pick([7, 20, 50]);

  const want = expected(q);
  const got = await actual(q, limit);
  compared += want.length;
  if (JSON.stringify(got.ids) !== JSON.stringify(want) || got.total !== want.length) {
    mismatches += 1;
    console.log('MISMATCH', JSON.stringify({ ...q, limit }), `api=${got.ids.length}/${got.total} expected=${want.length}`);
  }
}
console.log(`products: ${rows.length}, combinations: ${RUNS}, rows compared: ${compared}, mismatches: ${mismatches}`);
process.exit(mismatches === 0 ? 0 : 1);
