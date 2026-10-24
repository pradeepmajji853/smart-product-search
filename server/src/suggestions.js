// Autocomplete suggestions for the search box: matching brands, categories and
// product names, plus a "did you mean" correction when nothing matches.
import { escapeLike } from './like.js';
import { correctTerms } from './typoCorrection.js';

const MAX_BRANDS = 3;
const MAX_CATEGORIES = 2;
const MAX_PRODUCTS = 5;
// Trigram indexes need 3+ characters. Shorter input would force full-table scans on
// every keystroke (measured: ~120 ms at 100k products vs 1-6 ms), so it gets no suggestions.
export const MIN_SUGGEST_TERM_LENGTH = 3;

export async function getSuggestions(db, { q, terms }) {
  if (!terms.some((t) => t.length >= MIN_SUGGEST_TERM_LENGTH)) return [];

  const contains = `%${escapeLike(q)}%`;
  const prefix = `${escapeLike(q)}%`;
  // search_text ILIKE is redundant with the column conditions but lets PostgreSQL
  // narrow candidates with the trigram index before checking brand/category/name.
  const termParams = terms.map((t) => `%${escapeLike(t)}%`);
  const termClauses = termParams.map((_, i) => `search_text ILIKE $${i + 2} ESCAPE '\\' AND name ILIKE $${i + 2} ESCAPE '\\'`);

  const [brands, categories, products] = await Promise.all([
    db.query(
      `SELECT brand AS value, count(*)::int AS count FROM products
       WHERE search_text ILIKE $1 ESCAPE '\\' AND brand ILIKE $2 ESCAPE '\\'
       GROUP BY brand ORDER BY count(*) DESC, brand LIMIT ${MAX_BRANDS}`,
      [contains, prefix],
    ),
    db.query(
      `SELECT category AS value, count(*)::int AS count FROM products
       WHERE search_text ILIKE $1 ESCAPE '\\' AND category ILIKE $1 ESCAPE '\\'
       GROUP BY category ORDER BY count(*) DESC, category LIMIT ${MAX_CATEGORIES}`,
      [contains],
    ),
    db.query(
      `SELECT id, name AS value, brand, category FROM products
       WHERE ${termClauses.join(' AND ')}
       ORDER BY (name ILIKE $1 ESCAPE '\\') DESC, rating DESC, id ASC
       LIMIT ${MAX_PRODUCTS}`,
      [prefix, ...termParams],
    ),
  ]);

  const suggestions = [
    ...brands.rows.map((r) => ({ type: 'brand', ...r })),
    ...categories.rows.map((r) => ({ type: 'category', ...r })),
    ...products.rows.map((r) => ({ type: 'product', ...r })),
  ];
  if (suggestions.length > 0) return suggestions;

  const corrected = await correctTerms(db, terms);
  return corrected ? [{ type: 'correction', value: corrected.join(' ') }] : [];
}
