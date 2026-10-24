// The catalogue's search state lives in the URL query string, using the same
// parameter names as GET /api/products, so URLs can be bookmarked and shared.

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating_desc', label: 'Highest rating' },
  { value: 'name_asc', label: 'Name: A–Z' },
];
export const RATING_OPTIONS = ['4.5', '4', '3.5', '3'];
export const PAGE_SIZE = 20;
const SORT_VALUES = SORT_OPTIONS.map((o) => o.value);

export const DEFAULT_STATE = Object.freeze({
  q: '',
  category: '',
  brands: [],
  minPrice: '',
  maxPrice: '',
  minRating: '',
  inStock: false,
  sort: 'newest',
  page: 1,
});

export const isValidPrice = (v) => v === '' || (/^\d+(\.\d+)?$/.test(v) && Number(v) >= 0);

// Returns an error message for a min/max price pair, or null when it is valid.
export function priceRangeError(minPrice, maxPrice) {
  const min = String(minPrice).trim();
  const max = String(maxPrice).trim();
  if (!isValidPrice(min) || !isValidPrice(max)) {
    return min.startsWith('-') || max.startsWith('-') ? 'Prices cannot be negative.' : 'Enter a valid price.';
  }
  if (min !== '' && max !== '' && Number(min) > Number(max)) return 'Minimum price cannot exceed maximum price.';
  return null;
}

// Reads state from a query string. Invalid values (e.g. from a hand-edited URL)
// fall back to defaults rather than producing an error page.
export function parseSearchState(search) {
  const params = new URLSearchParams(search);
  const text = (key) => (params.get(key) || '').trim();
  const page = Number(text('page'));
  const sort = text('sort');
  const minRating = text('minRating');
  let minPrice = text('minPrice');
  let maxPrice = text('maxPrice');
  if (priceRangeError(minPrice, maxPrice)) {
    minPrice = '';
    maxPrice = '';
  }

  return {
    q: text('q'),
    category: text('category'),
    brands: [...new Set(params.getAll('brand').map((b) => b.trim()).filter(Boolean))].sort(),
    minPrice,
    maxPrice,
    minRating: RATING_OPTIONS.includes(minRating) ? minRating : '',
    inStock: text('inStock') === 'true',
    sort: SORT_VALUES.includes(sort) ? sort : DEFAULT_STATE.sort,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

// Serializes state, omitting defaults so URLs stay short. The result doubles as the
// API query string.
export function toSearchString(state) {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set('q', state.q.trim());
  if (state.category) params.set('category', state.category);
  for (const brand of [...state.brands].sort()) params.append('brand', brand);
  if (state.minPrice !== '') params.set('minPrice', state.minPrice);
  if (state.maxPrice !== '') params.set('maxPrice', state.maxPrice);
  if (state.minRating) params.set('minRating', state.minRating);
  if (state.inStock) params.set('inStock', 'true');
  if (state.sort !== DEFAULT_STATE.sort) params.set('sort', state.sort);
  if (state.page > 1) params.set('page', String(state.page));
  return params.toString();
}

export function hasActiveCriteria(state) {
  return Boolean(
    state.q || state.category || state.brands.length || state.minPrice !== '' ||
    state.maxPrice !== '' || state.minRating || state.inStock,
  );
}
