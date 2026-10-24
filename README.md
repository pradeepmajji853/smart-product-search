# Smart Product Search & Catalogue System

A product catalogue with keyword search, combinable filters, sorting and server-side pagination.

- **Frontend:** React 18 + Vite + Tailwind CSS (`client/`)
- **Backend:** Node.js + Express REST API, Zod validation (`server/`)
- **Database:** PostgreSQL 16 with `pg_trgm` (`database/`)
- **Tests:** Vitest + Supertest against a real PostgreSQL test database; Vitest + React Testing Library on the client

![Combined filters](docs/screenshots/03-combined-filters.png)

| Document | Contents |
| --- | --- |
| [docs/API.md](docs/API.md) | Endpoints, parameters, example requests/responses, validation errors |
| [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) | How search is built, indexing decisions with measured query plans, injection prevention, stable pagination, race-condition handling, scaling to 100k+ products |
| [docs/TESTING.md](docs/TESTING.md) | How to run the tests, what each suite covers, what was verified manually |
| [docs/screenshots/](docs/screenshots/) | Screenshots of the running application |

## Features

- **Keyword search** across product name, description, brand, category and SKU. Matching is case-insensitive and partial (`headph` finds "Headphones", `aud-son` finds SKU `AUD-SON-00783`). With several words, every word must match, each in any field (`sony headphones`).
- **Filters:** category, one or more brands, min/max price (inclusive), minimum rating and in-stock only. All of them combine with the keyword search.
- **Sorting:** price low→high, price high→low, highest rating, newest first, name A–Z. Every sort has a unique tie-breaker, so pagination stays stable when many products share a value.
- **Server-side pagination:** 20 per page by default, accurate totals, and an empty page with the correct total when the page number is out of range.
- **URL state:** search, filters, sort and page live in the query string, so you can bookmark or share a view and use the browser's back/forward buttons.
- **UX:** 300 ms debounced search; protection against outdated responses (AbortController plus a request-id guard); loading skeleton and "updating" indicator; error message with retry; empty state; clear-all and per-filter chips; client-side price validation; highlighting of matched terms; responsive layout with a collapsible filter panel on mobile.
- **API hardening:** Zod validation with clear 400 errors, parameterized SQL only, escaped LIKE wildcards, whitelisted ORDER BY, central error handler that never leaks SQL or credentials, 503 when the database is down, and a 5 s statement timeout.

## Screenshots

These were captured from the running application, with Chrome driven by Playwright against the production build and the seeded database.

| | |
| --- | --- |
| [Catalogue](docs/screenshots/01-catalogue.png) | Default listing of 1,000 products |
| [Keyword search](docs/screenshots/02-keyword-search.png) | `wireless`, with matched terms highlighted |
| [Combined filters](docs/screenshots/03-combined-filters.png) | Keyword + category + 2 brands + price range + in stock + price sort |
| [Pagination](docs/screenshots/04-pagination.png) | Page 2 of a filtered, sorted search |
| [Empty state](docs/screenshots/05-empty-state.png) | No matches, with Clear all filters |
| [Price validation](docs/screenshots/06-price-validation.png) | Client-side min > max error |
| [Mobile](docs/screenshots/07-mobile.png) / [mobile filters](docs/screenshots/08-mobile-filters.png) | 390 px wide layout |
| [Error state](docs/screenshots/09-error-state.png) | Database stopped: 503 shown with retry |

## Prerequisites

- Node.js **20+** (developed and verified on Node 22.16, npm 10.9)
- PostgreSQL **12+** with the `pg_trgm` extension, which ships with standard PostgreSQL packages (verified on PostgreSQL 16.14). The database user needs permission to `CREATE EXTENSION pg_trgm` once, or a superuser can create it in advance.

If you don't have PostgreSQL installed, you can run it in Docker. This command was **not** run during development because Docker was unavailable on the development machine:

```bash
docker run --name catalog-pg -e POSTGRES_USER=catalog -e POSTGRES_PASSWORD=change-me \
  -p 5432:5432 -d postgres:16-alpine
```

## Setup

```bash
# 1. Install dependencies (npm workspaces: installs server and client)
npm install

# 2. Configure environment
cp .env.example .env
#    then edit DATABASE_URL and TEST_DATABASE_URL in .env

# 3. Create the app and test databases (skip if you created them yourself)
npm run db:create

# 4. Create the table, constraints and indexes
npm run db:setup

# 5. Generate and load 1,000 deterministic sample products
npm run db:seed
```

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string for the application, e.g. `postgres://user:password@localhost:5432/product_catalog` |
| `TEST_DATABASE_URL` | for tests | **Separate** database used by the server tests. Its contents are dropped and recreated on every run. The suite refuses to run unless the name contains `test` and it differs from `DATABASE_URL`. |
| `PORT` | no | API port (default `4000`). The Vite dev server proxies `/api` to it. |
| `SEED_COUNT` | no | Number of products `db:seed` generates (default `1000`, minimum `500`) |

`.env` is git-ignored. Only `.env.example`, which holds placeholders, is committed.

## Running

```bash
# Development: API on :4000 with auto-reload, Vite dev server on http://localhost:5173
npm run dev

# Production: build the client, then serve UI + API from one process on http://localhost:4000
npm run build
npm start
```

## Tests

```bash
npm test               # server + client
npm run test:server    # 91 PostgreSQL-backed integration tests (needs TEST_DATABASE_URL)
npm run test:client    # 18 React tests (no database needed)
```

See [docs/TESTING.md](docs/TESTING.md) for coverage details and the manual verification that was performed.

## Database scripts

| Command | What it does |
| --- | --- |
| `npm run db:create` | Creates the databases named in `DATABASE_URL` and `TEST_DATABASE_URL` if they don't already exist |
| `npm run db:setup` | Applies `database/schema.sql` and `database/indexes.sql` (idempotent) |
| `npm run db:seed` | Truncates `products` and inserts `SEED_COUNT` deterministic products. Options: `--count N`, `--database-url URL` |
| `npm run db:reset` | Drops and recreates the table, then seeds it |
| `npm run db:explain` | Prints `EXPLAIN (ANALYZE, BUFFERS)` for representative searches, using the exact SQL the API generates |

The seed is deterministic: a fixed PRNG seed and a fixed reference date mean every run produces identical rows, SKUs, ids and timestamps. It covers 12 categories, 54 brands, prices from ₹149.99 to ₹2,49,999.99, ratings from 0 to 5, about 18% out-of-stock products, about 2 years of creation dates, and many deliberately duplicated values for tie-breaking (with 1,000 products: 620 distinct prices, 27 distinct ratings, 955 distinct timestamps).

## Project structure

```
client/                 React + Vite + Tailwind frontend
  src/App.jsx           Page layout, result summary, chips, states
  src/components/       SearchInput, FilterPanel, PriceRange, ProductCard, Pagination, StatusViews, Highlight
  src/hooks/            useUrlState, useProducts (race-safe fetching), useDebouncedValue, useFilterOptions
  src/lib/              URL <-> state mapping, API client, formatting
  src/__tests__/        Frontend tests
server/
  src/app.js            Express app factory (testable with an injected db)
  src/routes.js         /api/products, /api/filters, /api/health, /api/images
  src/validation.js     Zod schema for query parameters
  src/productQuery.js   Parameterized SQL builder (search, filters, sort whitelist, pagination)
  src/errors.js         Central error handling
  tests/                Integration tests + fixtures
database/
  schema.sql            Table, constraints, generated search column
  indexes.sql           B-tree and trigram indexes
  seed.js               Deterministic data generator + loader
  setup.js, create.js, explain.js
docs/                   API, implementation and testing docs, screenshots
```

## Known limitations

- **Substring matching, not relevance ranking.** Results follow the selected sort order. There is no "best match" ordering, stemming ("phones" won't match "phone" unless it's a substring) or typo tolerance. See [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md#scaling-to-100000-products) for how to add these.
- **One- and two-character terms can't use the trigram index** and fall back to a sequential scan. That's fast at 1k rows (≈1 ms) but grows linearly with table size.
- **OFFSET pagination.** Deep pages cost more as the offset grows, and rows inserted between page requests can shift results by one. Page numbers are capped at 10,000. Keyset pagination is the documented upgrade path.
- **Separate count and page queries** run in parallel without a shared snapshot, so a concurrent write could make `total` momentarily disagree with the page contents.
- **Category and brand filters match exactly** (case-sensitive), using values from `/api/filters`.
- **Prices are a single currency (INR)** with no locale/currency switching.
- **Dev-tooling advisories:** `npm audit` reports advisories in Vitest 2 / Vite 5 / esbuild, which are used only for tests and the dev server. Production dependencies report **0 vulnerabilities** (`npm audit --omit=dev`). Upgrading to Vitest 4 / Vite 7 was attempted but npm 10.9.2 crashed while resolving the workspace's peer dependencies, so the verified versions were kept.
- Product images are generated SVG placeholders (served by `/api/images/...`), not real photos.
