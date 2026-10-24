import { PriceRange } from './PriceRange.jsx';
import { RATING_OPTIONS } from '../lib/searchState.js';

const selectClass =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30';

export function FilterPanel({ state, options, update, syncKey }) {
  const toggleBrand = (brand) => {
    const brands = state.brands.includes(brand) ? state.brands.filter((b) => b !== brand) : [...state.brands, brand];
    update({ brands: brands.sort() });
  };
  // Keep selected values visible even if the options request failed or the value is unknown.
  const categoryValues = [...new Set([...options.categories.map((c) => c.value), ...(state.category ? [state.category] : [])])];
  const brandOptions = [
    ...options.brands,
    ...state.brands.filter((b) => !options.brands.some((o) => o.value === b)).map((value) => ({ value, count: null })),
  ];
  const countFor = (value) => options.categories.find((c) => c.value === value)?.count;

  return (
    <div className="space-y-6">
      {options.status === 'error' && (
        <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Could not load filter options.{' '}
          <button type="button" onClick={options.retry} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      <div>
        <label htmlFor="category" className="mb-2 block text-sm font-semibold text-slate-800">
          Category
        </label>
        <select id="category" value={state.category} onChange={(e) => update({ category: e.target.value })} className={selectClass}>
          <option value="">All categories</option>
          {categoryValues.map((value) => (
            <option key={value} value={value}>
              {value}
              {countFor(value) !== undefined ? ` (${countFor(value)})` : ''}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="mb-2 flex w-full items-center justify-between text-sm font-semibold text-slate-800">
          <span>Brand</span>
          {state.brands.length > 0 && (
            <button type="button" onClick={() => update({ brands: [] })} className="text-xs font-medium text-indigo-600 hover:underline">
              Clear ({state.brands.length})
            </button>
          )}
        </legend>
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
          {options.status === 'loading' && brandOptions.length === 0 && <p className="p-1 text-xs text-slate-500">Loading brands…</p>}
          {brandOptions.map(({ value, count }) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-50">
              <input
                type="checkbox"
                checked={state.brands.includes(value)}
                onChange={() => toggleBrand(value)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="flex-1 truncate">{value}</span>
              {count !== null && <span className="text-xs text-slate-400">{count}</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <PriceRange
        key={`price-${syncKey}`}
        initialMin={state.minPrice}
        initialMax={state.maxPrice}
        onCommit={(range) => update(range)}
      />

      <div>
        <label htmlFor="minRating" className="mb-2 block text-sm font-semibold text-slate-800">
          Minimum rating
        </label>
        <select id="minRating" value={state.minRating} onChange={(e) => update({ minRating: e.target.value })} className={selectClass}>
          <option value="">Any rating</option>
          {RATING_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}★ & up
            </option>
          ))}
        </select>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          checked={state.inStock}
          onChange={(e) => update({ inStock: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        In stock only
      </label>
    </div>
  );
}
