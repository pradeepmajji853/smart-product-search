-- Indexes for GET /api/products. Safe to re-run.
-- See docs/IMPLEMENTATION.md ("Indexing decisions") for the reasoning and trade-offs.
-- The UNIQUE constraint on sku already creates the unique B-tree index products_sku_key.

-- 1. Keyword search: one trigram GIN index on the generated search_text column.
--    Lets PostgreSQL answer  search_text ILIKE '%term%'  (terms of 3+ characters) with a
--    bitmap index scan instead of a full table scan once the table is large.
--    (Measured alternative: five per-column trigram indexes combined with BitmapOr were
--    ~2x slower, 1.7x larger, and the planner often ignored them - see docs/IMPLEMENTATION.md.)
CREATE INDEX IF NOT EXISTS products_search_text_trgm_idx ON products USING gin (search_text gin_trgm_ops);

-- 2. Equality filters (category = ANY(...), brand = ANY(...)).
--    Composite with price so "category + price range" and "category sorted by price"
--    can be served from one index.
CREATE INDEX IF NOT EXISTS products_category_price_idx ON products (category, price, id);
CREATE INDEX IF NOT EXISTS products_brand_price_idx    ON products (brand, price, id);

-- 3. Sorting. Every sort ends with id as a unique tie-breaker, so each index
--    includes id to allow ORDER BY ... LIMIT to be satisfied by an index scan.
--    (Descending sorts use the same indexes scanned backwards.)
CREATE INDEX IF NOT EXISTS products_price_id_idx      ON products (price, id);
CREATE INDEX IF NOT EXISTS products_rating_id_idx     ON products (rating, id);
CREATE INDEX IF NOT EXISTS products_created_at_id_idx ON products (created_at, id);
CREATE INDEX IF NOT EXISTS products_name_sort_idx     ON products ((lower(name) COLLATE "C"), id);

-- 4. "In stock only" is the most common boolean filter; a partial index on the
--    in-stock rows ordered by newest keeps the default listing cheap.
CREATE INDEX IF NOT EXISTS products_in_stock_newest_idx
  ON products (created_at DESC, id DESC) WHERE in_stock;

ANALYZE products;
