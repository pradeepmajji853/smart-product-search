import { useMemo, useState } from 'react';
import { SearchInput } from './components/SearchInput.jsx';
import { FilterPanel } from './components/FilterPanel.jsx';
import { ProductCard } from './components/ProductCard.jsx';
import { Pagination } from './components/Pagination.jsx';
import { EmptyState, ErrorState, SkeletonGrid, Spinner } from './components/StatusViews.jsx';
import { useUrlState } from './hooks/useUrlState.js';
import { useProducts } from './hooks/useProducts.js';
import { useFilterOptions } from './hooks/useFilterOptions.js';
import { SORT_OPTIONS, hasActiveCriteria, toSearchString } from './lib/searchState.js';
import { formatCount, formatPrice } from './lib/format.js';

function activeChips(state) {
  const chips = [];
  if (state.q) chips.push({ key: 'q', label: `“${state.q}”`, patch: { q: '', exact: false } });
  if (state.category) chips.push({ key: 'category', label: state.category, patch: { category: '' } });
  for (const brand of state.brands) {
    chips.push({ key: `brand-${brand}`, label: brand, patch: { brands: state.brands.filter((b) => b !== brand) } });
  }
  if (state.minPrice !== '' || state.maxPrice !== '') {
    const label =
      state.minPrice !== '' && state.maxPrice !== ''
        ? `${formatPrice(state.minPrice)} – ${formatPrice(state.maxPrice)}`
        : state.minPrice !== ''
          ? `From ${formatPrice(state.minPrice)}`
          : `Up to ${formatPrice(state.maxPrice)}`;
    chips.push({ key: 'price', label, patch: { minPrice: '', maxPrice: '' }, resync: true });
  }
  if (state.minRating) chips.push({ key: 'rating', label: `${state.minRating}★ & up`, patch: { minRating: '' } });
  if (state.inStock) chips.push({ key: 'stock', label: 'In stock', patch: { inStock: false } });
  return chips;
}

export default function App() {
  const { state, update, clearAll, syncKey } = useUrlState();
  // Chips that clear a text input need the input to re-initialise too.
  // Bumped whenever the search box must re-initialise from state (chip removal, picking a suggestion).
  const [inputSync, setInputSync] = useState(0);
  const inputKey = `${syncKey}-${inputSync}`;
  const apiQuery = useMemo(() => toSearchString(state), [state]);
  const products = useProducts(apiQuery);
  const filterOptions = useFilterOptions(state.category);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { pagination, data, status } = products;
  const loading = status === 'loading';
  const hasCriteria = hasActiveCriteria(state);
  const chips = activeChips(state);
  const { correctedQuery } = products;
  // Highlight what the results were actually matched against.
  const terms = (correctedQuery || state.q).split(/\s+/).filter(Boolean);

  // A new keyword always re-enables typo correction.
  const searchFor = (q) => update({ q, exact: false });
  const selectSuggestion = (suggestion) => {
    if (suggestion.type === 'brand') update({ q: '', exact: false, brands: [suggestion.value] });
    else if (suggestion.type === 'category') update({ q: '', exact: false, category: suggestion.value });
    else searchFor(suggestion.value);
    setInputSync((n) => n + 1);
  };

  const goToPage = (page) => {
    update({ page });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  let summary = status === 'error' ? 'Could not load products' : 'Loading products…';
  if (pagination) {
    if (pagination.total === 0) summary = 'No products match your search';
    else if (data.length === 0) summary = `${formatCount(pagination.total)} products`;
    else {
      const first = (pagination.page - 1) * pagination.limit + 1;
      const last = first + data.length - 1;
      summary = `Showing ${formatCount(first)}–${formatCount(last)} of ${formatCount(pagination.total)} products`;
    }
  }

  let content;
  if (status === 'error') {
    content = <ErrorState message={products.error.message} onRetry={products.retry} />;
  } else if (!pagination) {
    content = <SkeletonGrid />;
  } else if (pagination.total === 0) {
    content = <EmptyState hasCriteria={hasCriteria} onClear={clearAll} />;
  } else if (data.length === 0) {
    content = (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <h2 className="text-base font-semibold text-slate-900">Page {state.page} does not exist</h2>
        <p className="mt-1 text-sm text-slate-500">There are only {pagination.totalPages} pages of results.</p>
        <button type="button" onClick={() => goToPage(pagination.totalPages)} className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Go to last page
        </button>
      </div>
    );
  } else {
    content = (
      <ul className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 ${loading ? 'opacity-60' : ''}`} aria-label="Products">
        {data.map((product) => (
          <li key={product.id} className="flex">
            <ProductCard product={product} terms={terms} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
          <a href="/" className="shrink-0 text-lg font-bold tracking-tight text-slate-900">
            Product<span className="text-indigo-600">Catalogue</span>
          </a>
          <SearchInput key={`q-${inputKey}`} initialValue={state.q} onCommit={searchFor} onSelectSuggestion={selectSuggestion} />
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 lg:grid lg:grid-cols-[240px_1fr] lg:gap-8">
        <aside aria-label="Filters" className="mb-4 lg:mb-0">
          <div className="flex items-center justify-between lg:mb-4">
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium shadow-sm lg:hidden"
              aria-expanded={filtersOpen}
              aria-controls="filter-panel"
              onClick={() => setFiltersOpen((o) => !o)}
            >
              {filtersOpen ? 'Hide filters' : 'Show filters'}
              {chips.length > 0 && ` (${chips.length})`}
            </button>
            <h2 className="hidden text-sm font-bold uppercase tracking-wide text-slate-500 lg:block">Filters</h2>
            <button
              type="button"
              onClick={clearAll}
              disabled={!hasCriteria}
              className="text-sm font-medium text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
            >
              Clear all
            </button>
          </div>
          <div id="filter-panel" className={`${filtersOpen ? 'mt-4 block' : 'hidden'} rounded-lg border border-slate-200 bg-white p-4 lg:mt-0 lg:block`}>
            <FilterPanel state={state} options={filterOptions} update={update} syncKey={inputKey} />
          </div>
        </aside>

        <main>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-slate-600" aria-live="polite" aria-busy={loading}>
              {loading && <Spinner />}
              <span>{loading && pagination ? 'Updating results…' : summary}</span>
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="sort" className="text-sm text-slate-600">
                Sort by
              </label>
              <select
                id="sort"
                value={state.sort}
                onChange={(e) => update({ sort: e.target.value })}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {chips.length > 0 && (
            <ul className="mb-4 flex flex-wrap gap-2" aria-label="Active filters">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <button
                    type="button"
                    onClick={() => {
                      update(chip.patch);
                      if (chip.key === 'q' || chip.resync) setInputSync((n) => n + 1);
                    }}
                    className="flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                    aria-label={`Remove filter ${chip.label}`}
                  >
                    {chip.label} <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {correctedQuery && status !== 'error' && (
            <p role="status" className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No results for <strong>“{state.q}”</strong>. Showing results for <strong>“{correctedQuery}”</strong>.{' '}
              <button type="button" onClick={() => update({ exact: true })} className="font-medium text-indigo-700 underline">
                Search instead for “{state.q}”
              </button>
            </p>
          )}

          {content}

          {pagination && status !== 'error' && data.length > 0 && (
            <div className="mt-8">
              <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={goToPage} disabled={loading} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
