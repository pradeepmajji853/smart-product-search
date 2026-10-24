import { z } from 'zod';

export const SORT_OPTIONS = ['price_asc', 'price_desc', 'rating_desc', 'newest', 'name_asc'];
export const DEFAULT_SORT = 'newest';
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const MAX_PAGE = 10000;
export const MAX_QUERY_LENGTH = 100;
export const MAX_SEARCH_TERMS = 10;
export const MAX_PRICE = 9999999999.99; // NUMERIC(12,2) upper bound
const MAX_FILTER_VALUES = 25;

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;
const INTEGER_RE = /^-?\d+$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/g;

const splitTerms = (q) => (q ? q.split(/\s+/).filter(Boolean) : []);
const isBlank = (v) => v === undefined || (typeof v === 'string' && v.trim() === '');

// A query parameter that must appear at most once ("?minPrice=1&minPrice=2" is rejected).
const single = (schema) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .refine((v) => !Array.isArray(v), { message: 'must be provided only once' })
    .transform((v) => (isBlank(v) ? undefined : v.trim()))
    .pipe(schema);

const decimal = (field, min, max) =>
  single(
    z
      .string()
      .regex(DECIMAL_RE, `${field} must be a number`)
      .transform(Number)
      .pipe(
        z
          .number()
          .min(min, min === 0 ? `${field} must not be negative` : `${field} must be at least ${min}`)
          .max(max, `${field} must be at most ${max}`),
      )
      .optional(),
  );

const integer = (field, min, max, fallback) =>
  single(
    z
      .string()
      .regex(INTEGER_RE, `${field} must be a whole number`)
      .transform(Number)
      .pipe(
        z
          .number()
          .int()
          .min(min, `${field} must be at least ${min}`)
          .max(max, `${field} must be at most ${max}`),
      )
      .optional()
      .default(fallback),
  );

// Accepts ?brand=A or ?brand=A&brand=B. Values are matched exactly.
const valueList = (field) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
    .transform((list) => [...new Set(list.map((s) => s.trim()).filter(Boolean))])
    .pipe(
      z
        .array(z.string().max(100, `each ${field} must be at most 100 characters`))
        .max(MAX_FILTER_VALUES, `at most ${MAX_FILTER_VALUES} ${field} values are allowed`),
    );

const keyword = single(
  z
    .string()
    .max(MAX_QUERY_LENGTH, `q must be at most ${MAX_QUERY_LENGTH} characters`)
    .transform((q) => q.replace(CONTROL_CHARS_RE, ' ').trim())
    .optional(),
).transform((q) => q ?? '');

const booleanParam = single(
  z
    .enum(['true', 'false', '1', '0'], { message: 'inStock must be true or false' })
    .transform((v) => v === 'true' || v === '1')
    .optional(),
);

export const productQuerySchema = z
  .object({
    q: keyword,
    category: valueList('category'),
    brand: valueList('brand'),
    minPrice: decimal('minPrice', 0, MAX_PRICE),
    maxPrice: decimal('maxPrice', 0, MAX_PRICE),
    minRating: decimal('minRating', 0, 5),
    inStock: booleanParam,
    sort: single(
      z
        .enum(SORT_OPTIONS, { message: `sort must be one of: ${SORT_OPTIONS.join(', ')}` })
        .optional()
        .default(DEFAULT_SORT),
    ),
    page: integer('page', 1, MAX_PAGE, 1),
    limit: integer('limit', 1, MAX_LIMIT, DEFAULT_LIMIT),
  })
  .superRefine((value, ctx) => {
    if (value.minPrice !== undefined && value.maxPrice !== undefined && value.minPrice > value.maxPrice) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxPrice'],
        message: 'maxPrice must be greater than or equal to minPrice',
      });
    }
    if (splitTerms(value.q).length > MAX_SEARCH_TERMS) {
      ctx.addIssue({
        code: 'custom',
        path: ['q'],
        message: `q may contain at most ${MAX_SEARCH_TERMS} words`,
      });
    }
  })
  // Whitespace-separated terms; every term must match (see productQuery.js).
  .transform((value) => ({ ...value, terms: splitTerms(value.q) }));

export const filterOptionsQuerySchema = z.object({ category: valueList('category') });

export function formatZodError(error) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || null,
    message: issue.message,
  }));
}
