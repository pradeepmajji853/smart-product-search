# Testing

## How to run

```bash
# One-time: TEST_DATABASE_URL in .env must point to a separate, disposable database
npm run db:create          # creates it if it doesn't exist

npm test                   # server, then client
npm run test:server        # backend integration tests (PostgreSQL required)
npm run test:client        # frontend tests (no database or server required)

# Optional black-box check against the running API (needs a seeded DATABASE_URL)
npm run db:seed && npm start            # in one terminal
npm run verify:crosscheck               # in another
```

**Test database isolation.** Before the server suite runs, `server/tests/globalSetup.js` drops and recreates the `products` table in `TEST_DATABASE_URL` and loads a hand-written fixture of 36 products. The suite refuses to start unless that database's name contains `test` and it differs from `DATABASE_URL`, so it can't wipe the development data by accident. Test files run serially because they share that database.

## Results from the final run

The development machine was macOS on an Apple M4, with Node 22.16 and PostgreSQL 16.14.

```
server:  ✓ tests/search.test.js              (25 tests)
         ✓ tests/typo-suggestions.test.js    (16 tests)
         ✓ tests/sorting-pagination.test.js  (26 tests)
         ✓ tests/errors.test.js              (10 tests)
         ✓ tests/validation.test.js          (15 tests)
         ✓ tests/security.test.js            (16 tests)
         ✓ tests/seed.test.js                ( 5 tests)
         Tests  113 passed (113)

client:  ✓ src/__tests__/searchState.test.js  ( 5 tests)
         ✓ src/__tests__/useProducts.test.jsx  ( 4 tests)
         ✓ src/__tests__/App.test.jsx          (10 tests)
         ✓ src/__tests__/autocomplete.test.jsx ( 9 tests)
         Tests  28 passed (28)

verify:crosscheck  products: 1000, combinations: 300, rows compared: 24252, mismatches: 0
```

## Backend integration tests (`server/tests/`)

These are real HTTP requests made with Supertest to the Express app, which runs real SQL against PostgreSQL. Nothing in the data layer is mocked, except in the database-failure tests.

**The fixture** (`fixtures.js`) contains 16 named products with hand-picked values: Sony, Bose, Apple and others, plus edge cases like `100% Cotton T-Shirt`, `Under_score Edition Tee`, `Back\slash Poster` and `O'Reilly`. It also contains 20 `Tie Widget` products that are identical in price, rating, timestamp and name. Next to the fixture, `expectedIds()` is a plain JavaScript reference implementation of the search semantics. Many tests compare the API's result with it.

| Requirement | Where | What is asserted |
| --- | --- | --- |
| Full and partial name search | `search.test.js` | the full name `Sony WH-1000XM5 Wireless Headphones` returns exactly that product; `headph` and `xm` return the expected ids |
| Search by brand, category, description and SKU | `search.test.js` | `lenovo`, `kitchen`, `crispy`/`android` (description only), and `PHN-3002` / partial `LAP-200` |
| Case-insensitive search | `search.test.js` | `headphones`, `HEADPHONES` and `HeAdPhOnEs` give identical results; lower-case SKU |
| Multi-word search | `search.test.js` | `apple laptop` matches across brand and name; `sony laptop` returns nothing; extra whitespace is ignored; a match can never span two columns |
| Multiple filters together | `search.test.js` | keyword + brand + price range + stock returns `[1]`, and changing any one criterion changes the result; an 81-combination grid (3 keywords × 3 category choices × 3 price ranges × 3 stock states) compared with the reference implementation |
| Inclusive min/max price | `search.test.js` | products priced exactly at 129.99 and 349.99 are included; `min = max = 799` returns both 799 products |
| Rating and stock filters | `search.test.js` | `minRating=4.7` includes the 4.7 products; `inStock=true/false` |
| All sort options | `sorting-pagination.test.js` | each of the 5 sorts over the whole fixture equals the reference order; price ascending/descending are exact mirrors; default sort is `newest`; sorting is applied to filtered results |
| Pagination with active criteria | `sorting-pagination.test.js` | walking every page (limit 4) of `q + inStock + minPrice + sort` equals the full expected list; totals and `totalPages` are checked; default page size is 20 and pagination metadata is exact |
| Sorts can use their indexes | `sorting-pagination.test.js` | for each sort, `EXPLAIN` of the page query (with seq scans disabled) uses the expected B-tree index and has no Sort node; this guards against ORDER BY resolving to a computed output alias |
| Stable pagination with equal sort values | `sorting-pagination.test.js` | for **each** sort, the 20 identical `Tie Widget` products paged 7 at a time give 3 pages, 20 unique ids in the exact expected order, and repeated requests return the same page |
| Out-of-range page | `sorting-pagination.test.js` | `page=99` returns `data: []` with `total: 20, totalPages: 3` |
| Empty results and clearing filters | `search.test.js` | the exact empty response body; removing filters restores the full total; empty parameter values mean "no filter" |
| Invalid input | `validation.test.js` | negative prices, `min > max`, non-numeric prices (`abc`, `1e3`, `0x10`, `Infinity`, `NaN`, `10 OR 1=1`), rating out of range, unknown sort, `page` = 0/-1/1.5/abc/10001, `limit` = 0/-5/101/2.5/all, invalid booleans, `q` too long or too many words, repeated parameters (including a repeated `q`, which used to cause a 500 and is now a 400), every error reported together, and unknown parameters ignored |
| SQL injection | `security.test.js` | `' OR '1'='1`, `'; DROP TABLE products; --`, `UNION SELECT`, `pg_sleep` and others in `q`, `category` and `brand` are treated as literal text (0 results, table intact); the same in numeric, boolean and sort parameters is rejected with 400; `DROP TABLE` typed in the search box finds the book whose description contains it |
| LIKE wildcard escaping | `security.test.js` | `%` matches only the 2 products containing `%`; `s%y` and `o_t` match nothing; `_`, `\` and `'` match literally; a NUL byte is stripped instead of causing an error |
| Database errors | `errors.test.js` | a failing query returns a generic 500 whose body contains no SQL, error code or password; an unreachable database (port 1) returns 503 and `/api/health` reports `degraded`; validation runs before the database is touched |
| Other endpoints | `errors.test.js` | `/api/filters` values, counts, price range and category narrowing; the SVG image endpoint; JSON 404 for unknown routes |
| Typo-tolerant search | `typo-suggestions.test.js` | `sonny` → `sony`; only unmatched words are corrected (`sonny earbuds`, `bosee hedphones`); queries with results are never corrected; valid words excluded by filters are not "corrected"; gibberish and 2-character words get no correction; filters, sorting and pagination apply to the corrected query (`widgit` → `widget`, page 3 of 3); `exact=true` disables it; injection text stays data |
| Autocomplete | `typo-suggestions.test.js` | brand suggestion with count; categories; every word must be in the product name; names starting with the query rank first, groups are capped, id tie-breaker; "did you mean"; literal `%`, `_` and quotes; empty or under-3-character input returns no suggestions; validation (length, word count, repeated `q`) |
| Seed data | `seed.test.js` | 1,000 products, deterministic output, unique SKUs, valid values, ≥ 10 categories, ≥ 30 brands, both stock states, duplicate prices, ratings and timestamps; inserting all 1,000 inside a rolled-back transaction satisfies every database constraint |

### Do the tests catch real bugs?

To check that the tests detect real defects and don't merely pass, two bugs were introduced deliberately, the suite was run, and the code was restored:

| Deliberate bug | Result |
| --- | --- |
| `escapeLike()` returns its input unchanged (wildcards not escaped) | 4 tests failed (all LIKE-escaping tests) |
| `id` tie-breaker removed from `price_asc` | 2 tests failed (whole-catalogue order and tie-group paging) |
| Request-id guard removed from `useProducts` (client) | 1 test failed (`ignores a slow, outdated response…`) |
| Unqualified ORDER BY (the defect found in the audit) | 3 tests failed (`can serve sort=price_asc/price_desc/rating_desc in index order`) |
| Request-id guard removed from `useSuggestions` (client) | 1 test failed (`never shows suggestions from an outdated request`) |

## Frontend tests (`client/src/__tests__/`)

Vitest + jsdom + React Testing Library, with `fetch` stubbed.

| Behaviour | Test |
| --- | --- |
| Debouncing | `SearchInput` with fake timers: typing `s`, `so`, `son`, `sony` 100 ms apart produces no commit until 300 ms after the last keystroke, then exactly one commit of `sony`; Enter commits immediately and isn't followed by a duplicate. In the full `App`, typing `sony` with real timers sends exactly one product request for it (no requests for `s`, `so` or `son`). |
| Outdated responses | `useProducts`: requests for `q=so` then `q=sony`; the `sony` response arrives first, then the outdated `so` response, and the displayed data stays `sony`. The fetch mock deliberately ignores the abort signal, so the request-id guard is tested on its own. A separate test asserts that the previous request's signal is aborted. |
| URL state restore | Loading `/?q=sony&brand=Sony&minPrice=10&inStock=true&sort=price_asc&page=2` fills the search box, sort, price, stock and brand checkbox, sends the same query string to the API, and shows "Showing 21–40 of 100". |
| Paging keeps criteria | Clicking Next changes the URL and API query from `q=sony&category=Audio&sort=rating_desc` to the same plus `&page=2`. |
| Criteria change resets the page | Changing sort or stock from page 3 drops `page`. |
| Back/forward | Typing, then changing sort, then Back, Back, Forward restores the search box, sort select and API query at each step. |
| Clear all | Clears the keyword, category, brands, price, rating and stock (inputs included) but keeps the sort order. |
| Autocomplete | `autocomplete.test.jsx`: suggestions appear with types and counts; ↓ + Enter on a brand applies the brand filter (URL, checkbox and API query); clicking a product searches for it; a category applies the category filter; "Did you mean" searches the correction; an outdated, slow suggestions response never replaces newer ones; Escape closes the list; nothing is requested below 3 characters. |
| Typo banner | The banner names the original and corrected query; the corrected terms are highlighted; "Search instead for…" sets `exact=true` in the URL and API and shows the exact (empty) result; typing a new keyword removes `exact`. |
| Client-side validation | `min 500 / max 100` shows "Minimum price cannot exceed maximum price." and sends no request. |
| Empty state | Shows "No products found"; its Clear button resets the URL. |
| Errors | An API 400 shows the validation message, and retry recovers; a network failure shows "Could not reach the server…". |
| URL parsing | Round-trip of every field, defaults omitted, invalid hand-edited values fall back to defaults. |

## Verified manually (not part of the automated suites)

These checks were run against the real application during development. The commands are given so you can repeat them.

- **Real-data cross-check:** `npm run verify:crosscheck` compared the API with an independent JS implementation for 300 random combinations over the seeded 1,000 products, walking every page: **0 mismatches** (24,252 rows compared).
- **Browser run-through:** a Playwright script drove Google Chrome against `npm start` (production build), using the real seeded database. It typed in the search box, selected a category and two brands, entered a price range, ticked in-stock, changed the sort, used Back/Forward, paged, triggered the empty state and Clear all, and entered an invalid price range. It also loaded the page at mobile width (390 px), where horizontal overflow measured 0 px. There were no console errors or failed requests. These runs produced the screenshots in `docs/screenshots/`. Because the script needs a local Chrome and `playwright-core`, it isn't part of the repository's test commands.
- **Bonus features in the browser:** 13 Playwright checks against the production build. They cover: no dropdown at 2 characters; brand and product suggestions for `son`; keyboard selection applying the brand filter; clicking a product suggestion; the `sonny hedphones` banner, with results equal to an exact search for `sony headphones`; highlighting; "Search instead"; "Did you mean camera?" for `camra`; Escape; no console errors. Screenshots `10-autocomplete.png` and `11-typo-correction.png` come from this run.
- **Database-down behaviour:** with PostgreSQL stopped, `/api/products` returned `503 SERVICE_UNAVAILABLE`, `/api/health` returned `503 degraded`, and the UI showed the error state with retry (`09-error-state.png`). After restarting PostgreSQL, health returned `200 ok` without restarting the API.
- **Query plans:** `npm run db:explain` against the seeded database and against a 100,000-product database (see [IMPLEMENTATION.md](IMPLEMENTATION.md#measured-query-plans)).

## Not verified

- Browsers other than desktop Chrome, and real mobile devices. The mobile layout was checked only in Chrome's mobile emulation.
- PostgreSQL versions other than 16.14, and MySQL (not supported).
- The Docker command in the README (Docker was unavailable on the development machine).
- Load and concurrency testing. The timings in IMPLEMENTATION.md are single-query measurements on one machine.
- Screen-reader behaviour. Controls have labels, roles and live regions, but no assistive-technology testing was done.
