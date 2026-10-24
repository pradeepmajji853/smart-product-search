# Implementation Notes

This document covers how search is built, why the database is indexed the way it is (with real measured query plans), how injection and race conditions are prevented, how the system would scale, and its known limitations.

## Request flow

```
Browser URL (?q=...&brand=...&page=2)
  -> useUrlState (parse URL into state; pushState on change; popstate on back/forward)
  -> useProducts (fetch /api/products?..., AbortController + request-id guard)
  -> Express route GET /api/products
       -> Zod schema (validate + normalise; 400 on failure)
       -> buildProductQueries (parameterized SQL: WHERE / ORDER BY whitelist / LIMIT OFFSET)
       -> two queries in parallel: page rows + count(*)
  -> { data, pagination }
```

The frontend serializes state with the **same parameter names** the API accepts, so the page URL and the API query string are identical. That keeps the behaviour easy to reason about and to debug: copy the page's query string onto `/api/products?` and you get the exact response the UI rendered.

## Schema

`database/schema.sql` defines one `products` table:

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `INTEGER GENERATED ALWAYS AS IDENTITY` | primary key |
| `sku` | `VARCHAR(32)` | `NOT NULL`, `UNIQUE`, `CHECK (sku ~ '^[A-Z0-9][A-Z0-9-]*$')` |
| `name`, `brand`, `category` | `VARCHAR` | `NOT NULL`, `CHECK (btrim(x) <> '')` |
| `description` | `TEXT` | `NOT NULL` |
| `price` | `NUMERIC(12,2)` | `NOT NULL`, `CHECK (price >= 0)` (exact decimal, no float rounding) |
| `rating` | `NUMERIC(2,1)` | `NOT NULL`, `CHECK (rating BETWEEN 0 AND 5)` |
| `in_stock` | `BOOLEAN` | `NOT NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `image_url` | `TEXT` | `NOT NULL`, not blank |
| `search_text` | `TEXT GENERATED ALWAYS AS (name ‖ ' ' ‖ description ‖ ' ' ‖ brand ‖ ' ' ‖ category ‖ ' ' ‖ sku) STORED` | maintained by PostgreSQL |

Category and brand are plain columns rather than lookup tables, which keeps the assessment focused on search. With a real catalogue they would become `categories`/`brands` tables referenced by foreign keys (see "Scaling").

## How a search query is built

`server/src/productQuery.js` turns the validated filters into two parameterized statements. For `?q=sony headphones&brand=Sony&brand=Bose&minPrice=1000&inStock=true&sort=price_asc&page=2`:

```sql
SELECT id, sku, name, ... FROM products
WHERE search_text ILIKE $1 ESCAPE '\'          -- $1 = '%sony%'
  AND search_text ILIKE $2 ESCAPE '\'          -- $2 = '%headphones%'
  AND brand = ANY($3::text[])                  -- $3 = {Sony,Bose}
  AND price >= $4                              -- $4 = 1000
  AND in_stock = $5                            -- $5 = true
ORDER BY products.price ASC, products.id ASC
LIMIT $6 OFFSET $7                             -- 20, 20

SELECT count(*)::int AS total FROM products WHERE <same conditions, same values>
```

Rules:

1. **Keyword → words.** `q` is trimmed, control characters are stripped, and it's split on whitespace. Each word becomes one `ILIKE '%word%'` condition. All words must match (AND), and each word may match in any of the five fields. A product called "Sony WH-1000XM5" with the description "...headphones" matches `sony headphones` even though neither field contains the whole phrase.
2. **Any of the five fields → `search_text`.** "The word occurs in name OR description OR brand OR category OR sku" is evaluated as "the word occurs in `search_text`", the generated column that joins those five fields with single spaces. The two are **equivalent**: a word never contains whitespace, so it cannot match across the space that separates two fields. The test `never matches text spanning two columns` checks this, as does the 300-combination cross-check described in TESTING.md, which compares against a JS implementation of the literal five-field OR. The benefit is one trigram index instead of five (see "Indexing decisions").
3. **Literal matching.** `%`, `_` and `\` in the user's input are escaped (`escapeLike`) and `ESCAPE '\'` is declared explicitly, so `100%` finds "100% Cotton" instead of everything that starts with "100", and `_` is not a single-character wildcard.
4. **Filters** are appended with AND. Multiple values of one filter use `= ANY($n::text[])`, which is an OR within that filter. Price and rating bounds are inclusive (`>=`, `<=`).
5. **Validation first.** Nothing reaches SQL until Zod has accepted every parameter (`server/src/validation.js`). Numbers must match `^\d+(\.\d+)?$`, so `1e3`, `0x10`, `Infinity` and `-1` are all rejected. `maxPrice >= minPrice`, ratings must be 0–5, `sort` must be from the enum, and `page`/`limit` must be bounded integers. Arrays have at most 25 values of at most 100 characters each, and `q` has at most 100 characters and 10 words. Every error is reported at once as `400 VALIDATION_ERROR`.

## SQL injection prevention

- **All user values are bind parameters** (`$1`, `$2`, …) passed separately to `pg`. The database never parses them as SQL.
- **The only variable SQL text comes from whitelists.** The WHERE clause skeleton depends only on *which* filters are present, and the ORDER BY is looked up in `SORT_SQL` by a key that Zod has already restricted to five literal values. Request strings are never concatenated into SQL.
- The Express query parser is set to `simple`, so `?minPrice[$gt]=0`-style nested objects can't be constructed. Repeated single-value parameters are rejected.
- `database/create.js` is the one place that interpolates an identifier (`CREATE DATABASE`, which cannot take a bind parameter). The name comes from the operator's own `.env`, not from a request, and is validated against `^[A-Za-z_][A-Za-z0-9_]*$` first.
- Tests send classic payloads (`' OR '1'='1`, `'; DROP TABLE products; --`, `UNION SELECT`, `pg_sleep`) through every parameter and assert that the table is intact afterwards (`server/tests/security.test.js`).

## Stable pagination

OFFSET pagination is only correct if the ordering is **total**: no two rows can compare equal, or else PostgreSQL may return tied rows in a different order on each query, and rows would repeat or vanish between pages. Every sort therefore ends with the unique `id`:

| sort | ORDER BY | Supporting index |
| --- | --- | --- |
| `price_asc` | `products.price ASC, products.id ASC` | `(price, id)` |
| `price_desc` | `products.price DESC, products.id DESC` | `(price, id)` scanned backwards |
| `rating_desc` | `products.rating DESC, products.id DESC` | `(rating, id)` backwards |
| `newest` | `products.created_at DESC, products.id DESC` | `(created_at, id)` backwards |
| `name_asc` | `lower(products.name) COLLATE "C" ASC, products.id ASC` | `((lower(name) COLLATE "C"), id)` |

The tie-breaker direction matches the main key so that a single B-tree index scanned forwards or backwards serves the whole ORDER BY.

**Why the columns are table-qualified.** The SELECT list returns `price::float8 AS price` and `rating::float8 AS rating`, so the JSON contains numbers rather than strings. In PostgreSQL, a bare name in ORDER BY resolves to an *output column alias* before a table column. An unqualified `ORDER BY price` therefore sorted by the computed `float8` expression. The order was still correct, but the `(price, id)` and `(rating, id)` indexes could never be used. The pre-submission audit found this: at 100k rows an unfiltered price sort did a sequential scan and sort (≈14 ms) instead of an index scan (≈0.01 ms warm). Qualifying the columns (`products.price`) fixed it. The test `can serve sort=… in index order` checks the plan for every sort, and it fails on the old SQL. `name_asc` uses `lower(...) COLLATE "C"` so the A–Z order is case-insensitive and identical on every server, independent of the OS locale.

The seed and the test fixture both contain many duplicate prices, ratings and timestamps. The fixture includes 20 products that are identical in **every** sortable column. Tests page through them 7 at a time for every sort order and assert no duplicates, no gaps, and the exact order. When the `id` tie-breaker was removed from `price_asc` as an experiment, those tests failed (see TESTING.md).

`total` comes from a separate `count(*)` with the same WHERE, run in parallel with the page query. A window `count(*) OVER ()` was rejected because it returns no row at all for an out-of-range page, which would lose the total.

## Indexing decisions

`database/indexes.sql`:

| Index | Serves |
| --- | --- |
| `products_sku_key` (unique, from the constraint) | SKU uniqueness |
| `products_search_text_trgm_idx` — GIN `(search_text gin_trgm_ops)` | `ILIKE '%term%'` keyword search (terms of ≥ 3 characters) |
| `products_category_price_idx` — `(category, price, id)` | category filter, category + price range, category sorted by price |
| `products_brand_price_idx` — `(brand, price, id)` | brand filter, brand + price range |
| `products_price_id_idx` — `(price, id)` | price sorts, price-range-only filters |
| `products_rating_id_idx` — `(rating, id)` | rating sort, `minRating` |
| `products_created_at_id_idx` — `(created_at, id)` | "newest" sort (the default listing) |
| `products_name_sort_idx` — `((lower(name) COLLATE "C"), id)` | name A–Z sort |
| `products_in_stock_newest_idx` — `(created_at DESC, id DESC) WHERE in_stock` | default listing with "in stock only" |

Trade-offs:

- **Write cost and size.** Ten indexes on one table slow inserts and updates. For a catalogue that is read far more than it's written, that's acceptable. GIN trigram indexes are the most expensive part (measured below). For bulk loads it's cheaper to build the GIN index after loading or to `REINDEX` it: built incrementally during the 100k seed it was 37 MB, and 27 MB after `REINDEX`.
- **B-tree on low-cardinality columns.** `category` has only 12 values, so an index on it alone would rarely be chosen. Making it the leading column of `(category, price, id)` lets the planner use one index for the common "category + price range/sort" case.
- **`in_stock`.** A plain boolean index is nearly useless (about 82% of rows are `true`). The partial index only helps the "in stock, newest first" listing.
- **Trigrams need 3+ characters.** One- and two-character terms can't use the GIN index and fall back to a sequential scan.

### Why one combined trigram index instead of five per-column indexes

The first implementation used five `ILIKE` conditions joined with OR and a trigram index on each column. `EXPLAIN ANALYZE` on 100,000 rows showed that this was a poor fit. For the count query for `wireless`, three runs each:

| Approach | Plan chosen | Execution time |
| --- | --- | --- |
| 5 columns OR-ed, 5 trigram indexes, default planner settings | Parallel Seq Scan (planner misestimated the OR's selectivity) | 48.8 / 58.1 / 52.3 ms |
| same, `enable_seqscan = off` (forcing BitmapOr) | BitmapOr of 5 index scans | 6.7 / 5.7 / 5.8 ms |
| same, `random_page_cost = 1.1` (SSD tuning) | BitmapOr | 3.0 / 1.7 / 1.4 ms |
| **one generated `search_text` column, one trigram index (current)** | Bitmap Index Scan | **0.78 / 0.70 / 0.67 ms** |

Index size on the same 100k rows, both built on loaded data: **27 MB for the single index vs 45 MB for the five**. Match counts were identical for every term tested (`wireless`: 1,626, `aud-son`: 1,330, `sony`: 4,354, `e`: 100,000).

These experiments ran as ad-hoc scripts against the benchmark database. The current schema's plans can be reproduced with `npm run db:explain` (below).

### Measured query plans

Reproduce on any database:

```bash
npm run db:explain                                   # uses DATABASE_URL
node database/explain.js --database-url <url>        # any other database
```

The script runs `EXPLAIN (ANALYZE, BUFFERS)` on exactly the SQL the API generates. Here's how to build the 100k-product benchmark database used below:

```bash
createdb product_catalog_bench     # or any equivalent
node database/setup.js --drop --database-url postgres://.../product_catalog_bench
node database/seed.js --count 100000 --database-url postgres://.../product_catalog_bench
node database/explain.js --database-url postgres://.../product_catalog_bench
```

Results on the development machine: Apple M4, PostgreSQL 16.14 with the default configuration, local TCP, warm cache, single run each. These are **indicative numbers from one machine, not a benchmark**.

| Scenario | 1,000 rows: page / count | 100,000 rows: page / count | 100k plan (page query; count query) |
| --- | --- | --- | --- |
| Default listing (newest, page 1) | 0.023 / 0.049 ms | 0.027 / 6.5 ms | Index Scan Backward on `created_at_id_idx`; count = Seq Scan |
| Keyword `wireless` | 0.83 / 0.78 ms | 0.93 / 2.3 ms | Index Scan Backward on `created_at_id_idx` + filter (stops after 20 hits); count = Bitmap Index Scan on trigram index |
| Two words `sony headphones` | 0.85 / 0.88 ms | 1.2 / 1.0 ms | Bitmap Index Scan on trigram index + top-N heapsort |
| Partial SKU `AUD-SON` | 0.87 / 0.89 ms | 1.0 / 2.3 ms | as for `wireless` |
| Category + price range, sort by price | 0.033 / 0.014 ms | 1.2 / 0.53 ms | Bitmap Index Scan on `category_price_idx` |
| Keyword + brand + stock + rating, sort by rating | 0.061 / 0.045 ms | 1.8 / 1.5 ms | BitmapAnd(`brand_price_idx`, trigram index) |
| Page 40, name A–Z | 0.64 / 0.053 ms | 0.44 / 7.0 ms | Index Scan on `name_sort_idx` (reads 800 rows, keeps 20) |
| Unfiltered `price_asc` / `price_desc` / `rating_desc`, page 1 (after the ORDER BY fix; measured in the audit, 3 runs, cold then warm) | — | 4.6 / 0.012 / 0.009 ms; 0.57 / 0.009 / 0.008 ms; 0.78 / 0.010 / 0.008 ms | Index Scan (Backward) on `price_id_idx` / `rating_id_idx`. Before the fix: Seq Scan + Sort, ≈14 ms |

At 1,000 rows the planner often prefers sequential scans because the whole table fits in a handful of pages. That's the correct choice, so the 1k plans are not a meaningful test of the indexes. The 100k column is the meaningful one. The remaining linear cost at 100k is the unfiltered `count(*)` (6–7 ms), discussed below.

## Typo tolerance

Typo correction runs **only when a keyword search finds nothing**, so it never changes results that already match (`server/src/typoCorrection.js`).

1. **Vocabulary.** `search_vocabulary` is a materialized view of every word (3+ characters, not purely numeric) in product names, brands, categories and descriptions, with its frequency: 1,155 words for the 1k seed, 2,683 for 100k. It has a unique index (which allows `REFRESH … CONCURRENTLY`) and a trigram GIN index. `db:seed` refreshes it.
2. **Per word.** A word that matches some product (`EXISTS … search_text ILIKE`) is kept. Otherwise it's replaced by the closest vocabulary word: `word % $1 AND similarity(word, $1) >= 0.3`, ordered by similarity, then frequency, then alphabetically. That order is deterministic, and frequency breaks ties toward common words. Words shorter than 3 characters are not corrected.
3. **Rerun.** If every word now matches and at least one changed, the corrected query runs as a normal exact search. Filters, sorting and pagination therefore behave the same as for any other query, and `correctedQuery` tells the client what was searched. If no correction is possible, or the corrected search is also empty, the original empty result is returned. `exact=true` disables correction.

**Why only on zero results, and why per word.** Correcting a query that already has results would hide exact matches. Checking each word separately means `sony laptop` is never rewritten just because no Sony laptop exists: both words are valid, and only the combination is empty. The same applies to valid words excluded by filters (`?q=sony&brand=Apple`).

**Threshold.** 0.3 (pg_trgm's default) was chosen by measuring real typos against the seeded vocabulary:

| Input | Best match (similarity) | Result |
| --- | --- | --- |
| `sonny`, `hedphones`, `headfones`, `wireles`, `laptp`, `samsng`, `camra`, `addidas`, `bluetoth`, `keybord` | sony 0.57, headphones 0.62 / 0.50, wireless 0.70, laptop 0.44, samsung 0.50, camera 0.44, adidas 0.67, bluetooth 0.73, keyboard 0.55 | corrected |
| `refrigerator`, `blender` | refresh 0.24, grinder 0.23 | correctly *not* corrected |
| `sny`, `phnoe`, `nkie` | sony 0.29, phone 0.20, neo 0.13 | missed: short words and transposed letters |

Transpositions in short words are trigram matching's known weak spot. Adding `fuzzystrmatch`'s `levenshtein()` to re-rank candidates would cover them, at the cost of a second extension.

**Cost.** It only runs on empty results: one indexed `EXISTS` per word plus one vocabulary lookup per unknown word, run in parallel. Measured end to end at 100k products: `sonny` 4.9 ms, `hedphones` 4.0 ms, `sonny hedphones` 3.3 ms, unrecognizable `zzqxv` 0.8 ms (medians of 5 runs).

## Autocomplete

`GET /api/suggestions?q=` (`server/src/suggestions.js`) returns, in order:

1. up to 3 brands starting with `q`;
2. up to 2 categories containing it;
3. up to 5 products whose names contain every word, names starting with `q` first, then by rating and id.

If nothing matches, it returns the typo correction as a "Did you mean…?" entry. Each query also filters on `search_text ILIKE`, so the trigram index narrows the candidates. That predicate is redundant for correctness but is what makes the queries fast.

Measured at 100k products: `son` 6.3 ms, `sony wire` 1.2 ms, `headphones` 3.4 ms, `sonny` 0.9 ms. With 2 characters (`so`) the index can't help and the three queries took **122 ms**. Autocomplete therefore requires at least one word of 3+ characters, enforced by the server and mirrored by the client.

**Frontend** (`SearchInput.jsx`, `useSuggestions.js`):
- Suggestions are fetched 150 ms after typing pauses, separately from the 300 ms search commit.
- They use the same abort + request-id protection as product results; a test makes an older response arrive late and asserts it's ignored.
- The input implements the ARIA combobox pattern: `aria-expanded`, `aria-controls`, `aria-activedescendant`, ↑/↓, Enter, and Escape. Options are picked on `mousedown`, so the input doesn't blur first.
- Picking a brand or category applies that filter and clears the text. Picking a product or a correction searches for it.
- A failed suggestions request just shows no dropdown. Search itself is unaffected.

## Frontend: debouncing, races and URL state

- **Debouncing.** `SearchInput` keeps the text the user is typing locally and commits it 300 ms after the last keystroke, or immediately on Enter. Committing the same trimmed value twice is a no-op. Price inputs debounce at 500 ms, validate locally (negative values or min > max show an inline error), and only commit a valid range.
- **Outdated responses.** `useProducts` has two independent layers:
  1. When the query changes, the effect cleanup **aborts** the previous `fetch` with its `AbortController`.
  2. Each request gets an **incrementing id**, and a response (or error) is applied only if its id is still the latest. This covers responses that resolve despite the abort, for example a body that was already being parsed.

  A test resolves the newer request first and then the outdated one, using a fetch mock that ignores the abort signal, and asserts that the outdated data never appears. Removing the id check makes that test fail.
- **URL state.** `useUrlState` parses `window.location.search` into state, writes changes with `history.pushState`, and re-reads the URL on `popstate`, so back/forward and bookmarks both work. Any criteria change resets `page` to 1, while a page change keeps every other parameter. Invalid hand-edited values such as `page=-2` or `sort=hack` fall back to defaults instead of producing errors. Text inputs are re-keyed when state changes externally (back/forward, clear all), so their local copies of the text re-initialize from the URL.
- **States.** The first load shows a skeleton grid. Later loads keep the current results dimmed and show "Updating results…" with a spinner, and `aria-busy` and `aria-live` announce changes. Errors show the API's message with a retry button. A 503 shows "The product database is temporarily unavailable", and validation errors list their messages. An empty result shows a "Clear all filters" action, and an out-of-range page offers "Go to last page".

## Scaling to 100,000+ products

The 100k measurements above show that the current design already holds at that size: every representative query ran in ≤ 7 ms on the development machine. The next steps, in the order I'd take them:

1. **Count cost.** Unfiltered or barely filtered `count(*)` is linear in table size (6–7 ms at 100k, so roughly 70 ms at 1M). Options: cache counts for common filter combinations for a short time; for the unfiltered catalogue use the planner's estimate (`pg_class.reltuples`); or cap counting (`SELECT count(*) FROM (SELECT 1 ... LIMIT 10001)`) and show "10,000+".
2. **Keyset (cursor) pagination for deep pages.** Replace `OFFSET n` with `WHERE (price, id) > ($last_price, $last_id)` using the same tie-breaker. The cost per page then stays constant and pages don't shift under concurrent inserts. Page-number navigation can stay for the first few pages.
3. **Relevance and language features.** Add a `tsvector` column with a GIN index and `websearch_to_tsquery` for stemming and ranking (`ts_rank`), keeping trigram `ILIKE` for SKU and partial-word matching. Typo tolerance is already trigram-based (see above). At larger scale, the vocabulary refresh would move from seed time to a scheduled `REFRESH MATERIALIZED VIEW CONCURRENTLY`, or to an incrementally maintained table.
4. **Normalise categories and brands** into lookup tables with integer foreign keys. Indexes get smaller, renames are safe, and `/api/filters` becomes a cheap lookup. Faceted counts for the current result set can be computed with `GROUP BY` on the filtered set, or precomputed.
5. **Operational.** Tune `random_page_cost` / `effective_cache_size` for SSDs, run `ANALYZE` after bulk loads, put PgBouncer in front of PostgreSQL, add a read replica for search traffic, and add HTTP caching (ETag / `Cache-Control: max-age=30`) on `/api/filters`.
6. **Beyond about 10M products, or for advanced relevance, synonyms, facets and analytics:** move search to OpenSearch, Elasticsearch, Meilisearch or Typesense, fed from PostgreSQL by change data capture, with PostgreSQL remaining the source of truth.

## Known limitations

- Substring matching only: no relevance ranking, stemming or synonyms (see Scaling point 3).
- Typo correction applies only to zero-result searches and misses transpositions in short words (`phnoe`). The vocabulary must be refreshed after catalogue changes.
- Autocomplete needs 3+ characters.
- One- and two-character terms can't use the trigram index.
- OFFSET pagination: deep pages get slower, and concurrent writes can shift rows between page requests. Page numbers are capped at 10,000.
- The count and page queries don't share a snapshot, so a concurrent write can make them momentarily disagree.
- Category and brand filters match exact, case-sensitive values (the UI only offers values from `/api/filters`).
- Brand options in the UI are narrowed by the selected category, but their counts don't reflect the other active filters.
- Product images are generated SVG placeholders.
- No authentication or rate limiting. The API is read-only, but a public deployment should add rate limiting.
