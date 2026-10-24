-- Smart Product Search & Catalogue System - schema
-- Safe to re-run: every statement is idempotent.

-- pg_trgm provides trigram GIN indexes that accelerate ILIKE '%term%' searches.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku         VARCHAR(32)   NOT NULL,
  name        VARCHAR(200)  NOT NULL,
  description TEXT          NOT NULL,
  brand       VARCHAR(100)  NOT NULL,
  category    VARCHAR(100)  NOT NULL,
  price       NUMERIC(12,2) NOT NULL,
  rating      NUMERIC(2,1)  NOT NULL DEFAULT 0,
  in_stock    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  image_url   TEXT          NOT NULL,
  -- All searchable columns joined by single spaces. Search terms never contain
  -- whitespace, so "term matches search_text" is equivalent to "term matches at least
  -- one of the five columns", while needing one trigram index instead of five.
  search_text TEXT GENERATED ALWAYS AS (
    name || ' ' || description || ' ' || brand || ' ' || category || ' ' || sku
  ) STORED,

  CONSTRAINT products_sku_key          UNIQUE (sku),
  CONSTRAINT products_sku_format       CHECK (sku ~ '^[A-Z0-9][A-Z0-9-]*$'),
  CONSTRAINT products_name_not_blank   CHECK (btrim(name) <> ''),
  CONSTRAINT products_brand_not_blank  CHECK (btrim(brand) <> ''),
  CONSTRAINT products_category_not_blank CHECK (btrim(category) <> ''),
  CONSTRAINT products_price_non_negative CHECK (price >= 0),
  CONSTRAINT products_rating_range     CHECK (rating >= 0 AND rating <= 5),
  CONSTRAINT products_image_url_not_blank CHECK (btrim(image_url) <> '')
);

COMMENT ON TABLE products IS 'Product catalogue searched by GET /api/products';
COMMENT ON COLUMN products.rating IS 'Average customer rating, 0.0 - 5.0';

-- Vocabulary of catalogue words (3+ characters, not purely numeric) with their
-- frequency. Used for typo correction ("sonny" -> "sony") and "did you mean"
-- autocomplete hints. It is derived data: refresh it after the catalogue changes
-- (database/seed.js does this automatically):
--   REFRESH MATERIALIZED VIEW CONCURRENTLY search_vocabulary;
CREATE MATERIALIZED VIEW IF NOT EXISTS search_vocabulary AS
SELECT word, count(*)::int AS frequency
FROM (
  SELECT regexp_split_to_table(lower(name || ' ' || brand || ' ' || category || ' ' || description), '[^a-z0-9]+') AS word
  FROM products
) words
WHERE length(word) >= 3 AND word !~ '^[0-9]+$'
GROUP BY word;
