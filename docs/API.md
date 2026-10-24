# API Reference

Base URL: `http://localhost:4000/api`. In development the Vite dev server on `:5173` proxies `/api` to this server.

All responses are JSON except `/api/images/...`. All endpoints are read-only `GET` requests.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/products` | Search, filter, sort and paginate products |
| `GET /api/filters` | Category and brand options (with counts) and the overall price range |
| `GET /api/health` | Liveness and database connectivity |
| `GET /api/images/:category/:sku.svg` | Generated SVG placeholder image for a product |

---

## GET /api/products

### Query parameters

| Parameter | Type | Default | Rules |
| --- | --- | --- | --- |
| `q` | string | — | Keyword search, max 100 characters and max 10 words. Case-insensitive partial match against **name, description, brand, category and SKU**. With several whitespace-separated words, **every word must match** (each one in any of those fields). `%`, `_` and `\` are matched literally. Control characters are stripped. |
| `category` | string, repeatable | — | Exact category name. Repeat it to match any of several: `?category=Audio&category=Cameras` |
| `brand` | string, repeatable | — | Exact brand name. Repeat it to match any of several: `?brand=Sony&brand=Bose` |
| `minPrice` | decimal ≥ 0 | — | Inclusive lower bound (`price >= minPrice`) |
| `maxPrice` | decimal ≥ 0 | — | Inclusive upper bound (`price <= maxPrice`). Must be ≥ `minPrice`. |
| `minRating` | decimal 0–5 | — | Inclusive (`rating >= minRating`) |
| `inStock` | `true` \| `false` \| `1` \| `0` | — | `true`: only in-stock products. `false`: only out-of-stock products. Omit it for both. |
| `sort` | enum | `newest` | `price_asc`, `price_desc`, `rating_desc`, `newest`, `name_asc` |
| `page` | integer 1–10000 | `1` | 1-based page number |
| `limit` | integer 1–100 | `20` | Page size |

How parameters combine:

- All supplied criteria are combined with **AND**. Multiple values of the same `category`/`brand` parameter combine with **OR**.
- An empty value (`?brand=&minPrice=`) means "not set". Unknown parameters are ignored.
- Single-value parameters (`q`, prices, `minRating`, `inStock`, `sort`, `page`, `limit`) may appear only once.

### Sort orders

Every sort ends with the product `id` as a unique tie-breaker, so the ordering is total and pages never overlap or skip rows.

| `sort` | SQL `ORDER BY` |
| --- | --- |
| `price_asc` | `price ASC, id ASC` |
| `price_desc` | `price DESC, id DESC` |
| `rating_desc` | `rating DESC, id DESC` |
| `newest` | `created_at DESC, id DESC` |
| `name_asc` | `lower(name) COLLATE "C" ASC, id ASC` |

### Response 200

```json
{
  "data": [ Product, ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 84,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

`Product`:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | integer | Primary key |
| `sku` | string | Unique |
| `name`, `description`, `brand`, `category` | string | |
| `price` | number | Two decimals (stored as `NUMERIC(12,2)`) |
| `rating` | number | 0.0–5.0, one decimal |
| `inStock` | boolean | |
| `createdAt` | string | ISO-8601 timestamp |
| `imageUrl` | string | Relative URL of the placeholder image |

`total` is the number of matching products across all pages. A `page` beyond the last page returns `data: []` with the correct `total` and `totalPages`.

### Examples

These are real responses from the seeded database (1,000 products).

**Keyword + stock + price + sort**

```bash
curl "http://localhost:4000/api/products?q=sony%20headphones&inStock=true&maxPrice=20000&sort=price_asc&limit=2"
```

```json
{
  "data": [
    {
      "id": 783,
      "sku": "AUD-SON-00783",
      "name": "Sony Sport Wireless Headphones X55",
      "description": "The Sony Sport Wireless Headphones X55 by Sony offers Bluetooth 5.3. A sport choice from our audio range.",
      "brand": "Sony",
      "category": "Audio",
      "price": 13499.99,
      "rating": 3.9,
      "inStock": true,
      "createdAt": "2024-12-07T12:05:55.361Z",
      "imageUrl": "/api/images/audio/AUD-SON-00783.svg"
    },
    {
      "id": 519,
      "sku": "AUD-SON-00519",
      "name": "Sony Over-Ear Wireless Headphones G88",
      "description": "The Sony Over-Ear Wireless Headphones G88 by Sony offers a sweat-resistant design and Bluetooth 5.3. An over-ear choice from our audio range.",
      "brand": "Sony",
      "category": "Audio",
      "price": 17499.99,
      "rating": 3.3,
      "inStock": true,
      "createdAt": "2025-10-03T12:00:00.000Z",
      "imageUrl": "/api/images/audio/AUD-SON-00519.svg"
    }
  ],
  "pagination": { "page": 1, "limit": 2, "total": 2, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false }
}
```

**Several brands, category, rating, page 2**

```bash
curl "http://localhost:4000/api/products?category=Audio&brand=Sony&brand=JBL&minRating=4&sort=rating_desc&page=2&limit=5"
```

**Partial SKU search (case-insensitive)**

```bash
curl "http://localhost:4000/api/products?q=aud-son"
```

**No matches**

```bash
curl "http://localhost:4000/api/products?q=zzzz"
```

```json
{"data":[],"pagination":{"page":1,"limit":20,"total":0,"totalPages":0,"hasNextPage":false,"hasPreviousPage":false}}
```

**Page out of range**

```bash
curl "http://localhost:4000/api/products?category=Audio&page=999"
```

```json
{"data":[],"pagination":{"page":999,"limit":20,"total":84,"totalPages":5,"hasNextPage":false,"hasPreviousPage":true}}
```

### Validation errors (400)

All invalid parameters are reported together:

```bash
curl "http://localhost:4000/api/products?minPrice=-5&maxPrice=abc&sort=cheapest&page=0&limit=500&inStock=yes"
```

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid query parameters",
    "details": [
      { "field": "minPrice", "message": "minPrice must not be negative" },
      { "field": "maxPrice", "message": "maxPrice must be a number" },
      { "field": "inStock", "message": "inStock must be true or false" },
      { "field": "sort", "message": "sort must be one of: price_asc, price_desc, rating_desc, newest, name_asc" },
      { "field": "page", "message": "page must be at least 1" },
      { "field": "limit", "message": "limit must be at most 100" }
    ]
  }
}
```

| Input | `field` | `message` |
| --- | --- | --- |
| `minPrice=-1` | `minPrice` | `minPrice must not be negative` |
| `minPrice=500&maxPrice=100` | `maxPrice` | `maxPrice must be greater than or equal to minPrice` |
| `minPrice=abc` (also `1e3`, `0x10`, `Infinity`) | `minPrice` | `minPrice must be a number` |
| `minRating=6` | `minRating` | `minRating must be at most 5` |
| `sort=price` | `sort` | `sort must be one of: ...` |
| `page=0`, `page=1.5`, `page=10001` | `page` | `page must be at least 1` / `page must be a whole number` / `page must be at most 10000` |
| `limit=101` | `limit` | `limit must be at most 100` |
| `inStock=yes` | `inStock` | `inStock must be true or false` |
| `q` longer than 100 characters | `q` | `q must be at most 100 characters` |
| `q` with more than 10 words | `q` | `q may contain at most 10 words` |
| `minPrice=1&minPrice=2` | `minPrice` | `must be provided only once` |

### Other errors

| Status | `error.code` | When |
| --- | --- | --- |
| 404 | `NOT_FOUND` | Unknown `/api/...` route |
| 503 | `SERVICE_UNAVAILABLE` | Database unreachable: connection refused or timed out, authentication failed, database missing, or server shutting down |
| 500 | `INTERNAL_ERROR` | Any other unexpected error. The body is always `{"error":{"code":"INTERNAL_ERROR","message":"An unexpected error occurred"}}`, and SQL, stack traces and connection details are only logged server-side. |

---

## GET /api/filters

Returns the options for the filter controls. Brand options can be narrowed to one or more categories.

| Parameter | Type | Rules |
| --- | --- | --- |
| `category` | string, repeatable | Optional. Limits `brands` to brands that have products in these categories. `categories` and `price` always describe the whole catalogue. |

```bash
curl "http://localhost:4000/api/filters?category=Audio"
```

```json
{
  "categories": [
    { "value": "Audio", "count": 84 },
    { "value": "Books", "count": 83 },
    "... 12 categories in total"
  ],
  "brands": [
    { "value": "boAt", "count": 13 },
    { "value": "Bose", "count": 14 },
    { "value": "JBL", "count": 18 },
    { "value": "Samsung", "count": 18 },
    { "value": "Sennheiser", "count": 11 },
    { "value": "Sony", "count": 10 }
  ],
  "price": { "min": 149.99, "max": 249999.99 }
}
```

## GET /api/health

```bash
curl http://localhost:4000/api/health
```

| Status | Body |
| --- | --- |
| 200 | `{"status":"ok","database":"up"}` |
| 503 | `{"status":"degraded","database":"down"}` |

## GET /api/images/:category/:sku.svg

Returns a deterministic SVG placeholder (gradient by category, with the SKU as a label), cached for 24 hours. Every product's `imageUrl` points here, so images load without any external image service. Malformed paths return 404.
