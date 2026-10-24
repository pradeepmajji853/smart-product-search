// Prints EXPLAIN (ANALYZE, BUFFERS) output for representative product searches, using
// exactly the SQL the API generates.
// Usage: node database/explain.js [--database-url <url>]
import pg from 'pg';
import { loadEnv, resolveDatabaseUrl } from './env.js';
import { productQuerySchema } from '../server/src/validation.js';
import { buildProductQueries } from '../server/src/productQuery.js';

const SCENARIOS = [
  ['Default listing (newest, page 1)', {}],
  ['Keyword search', { q: 'wireless' }],
  ['Two-word keyword search', { q: 'sony headphones' }],
  ['SKU prefix search', { q: 'AUD-SON' }],
  ['Category + price range, sorted by price', { category: 'Laptops', minPrice: '50000', maxPrice: '100000', sort: 'price_asc' }],
  ['Keyword + brand + stock + rating, sorted by rating', { q: 'pro', brand: 'Apple', inStock: 'true', minRating: '4', sort: 'rating_desc' }],
  ['Deep page (page 40, name A-Z)', { sort: 'name_asc', page: '40' }],
];

loadEnv();
const client = new pg.Client({ connectionString: resolveDatabaseUrl(process.argv.slice(2)) });
await client.connect();
try {
  const { rows } = await client.query('SELECT count(*)::int AS n FROM products');
  console.log(`products: ${rows[0].n}\n`);
  for (const [title, query] of SCENARIOS) {
    const { page, count } = buildProductQueries(productQuerySchema.parse(query));
    for (const [label, q] of [['page query', page], ['count query', count]]) {
      const plan = await client.query(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ${q.text}`, q.values);
      console.log(`=== ${title} - ${label} ===`);
      console.log(plan.rows.map((r) => r['QUERY PLAN']).join('\n'), '\n');
    }
  }
} finally {
  await client.end();
}
