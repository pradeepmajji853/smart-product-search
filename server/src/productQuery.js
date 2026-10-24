// Builds the parameterized SQL for GET /api/products.
//
// Rules:
//  * User input only ever travels as bind parameters ($1, $2, ...). The only SQL text
//    that varies is chosen from the whitelists below, never copied from the request.
//  * Each search term must match at least one of the searched columns (name,
//    description, brand, category, sku); terms and filters are combined with AND.
//    "Matches at least one column" is evaluated against the generated column
//    search_text (the five columns joined by spaces): because a term never contains
//    whitespace, it can only match inside a single column, so this is equivalent to
//    OR-ing five ILIKEs, but is served by a single trigram index.
//  * Every ORDER BY ends with the unique primary key so pagination is deterministic
//    even when many rows share the same sort value.

import { escapeLike } from './like.js';
import { correctTerms } from './typoCorrection.js';

// Columns are table-qualified on purpose: the SELECT list aliases computed values back to
// column names (price::float8 AS price), and an unqualified ORDER BY name resolves to that
// output alias first - which would sort by the expression and bypass the (price, id) and
// (rating, id) indexes.
export const SORT_SQL = {
  price_asc: 'products.price ASC, products.id ASC',
  price_desc: 'products.price DESC, products.id DESC',
  rating_desc: 'products.rating DESC, products.id DESC',
  newest: 'products.created_at DESC, products.id DESC',
  name_asc: 'lower(products.name) COLLATE "C" ASC, products.id ASC',
};

const PRODUCT_COLUMNS = `
  id, sku, name, description, brand, category,
  price::float8 AS price, rating::float8 AS rating,
  in_stock AS "inStock", created_at AS "createdAt", image_url AS "imageUrl"`;

export function buildWhere(filters) {
  const values = [];
  const clauses = [];
  const param = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  for (const term of filters.terms) {
    const p = param(`%${escapeLike(term)}%`);
    clauses.push(`search_text ILIKE ${p} ESCAPE '\\'`);
  }
  if (filters.category.length > 0) clauses.push(`category = ANY(${param(filters.category)}::text[])`);
  if (filters.brand.length > 0) clauses.push(`brand = ANY(${param(filters.brand)}::text[])`);
  if (filters.minPrice !== undefined) clauses.push(`price >= ${param(filters.minPrice)}`);
  if (filters.maxPrice !== undefined) clauses.push(`price <= ${param(filters.maxPrice)}`);
  if (filters.minRating !== undefined) clauses.push(`rating >= ${param(filters.minRating)}`);
  if (filters.inStock !== undefined) clauses.push(`in_stock = ${param(filters.inStock)}`);

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join('\n  AND ')}` : '',
    values,
  };
}

export function buildProductQueries(filters) {
  const orderBy = SORT_SQL[filters.sort];
  if (!orderBy) throw new Error(`Unsupported sort: ${filters.sort}`);

  const where = buildWhere(filters);
  const offset = (filters.page - 1) * filters.limit;
  const n = where.values.length;

  return {
    count: {
      text: `SELECT count(*)::int AS total FROM products ${where.sql}`,
      values: where.values,
    },
    page: {
      text: `SELECT ${PRODUCT_COLUMNS}
FROM products
${where.sql}
ORDER BY ${orderBy}
LIMIT $${n + 1} OFFSET $${n + 2}`,
      values: [...where.values, filters.limit, offset],
    },
  };
}

async function runSearch(db, filters) {
  const queries = buildProductQueries(filters);
  const [countResult, pageResult] = await Promise.all([db.query(queries.count), db.query(queries.page)]);
  const total = countResult.rows[0].total;
  const totalPages = Math.ceil(total / filters.limit);

  return {
    data: pageResult.rows,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages,
      hasNextPage: filters.page < totalPages,
      hasPreviousPage: filters.page > 1,
    },
  };
}

// Runs the search; if a keyword search finds nothing (and exact=true was not requested),
// retries once with typo-corrected terms. correctedQuery tells the client which query
// the results are for, or is null when the results are for the query as typed.
export async function searchProducts(db, filters) {
  const result = await runSearch(db, filters);
  if (result.pagination.total > 0 || filters.terms.length === 0 || filters.exact) {
    return { ...result, correctedQuery: null };
  }
  const correctedTerms = await correctTerms(db, filters.terms);
  if (!correctedTerms) return { ...result, correctedQuery: null };

  const corrected = await runSearch(db, { ...filters, terms: correctedTerms });
  if (corrected.pagination.total === 0) return { ...result, correctedQuery: null };
  return { ...corrected, correctedQuery: correctedTerms.join(' ') };
}
