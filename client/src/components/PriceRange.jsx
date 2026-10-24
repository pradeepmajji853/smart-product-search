import { useEffect, useState } from 'react';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { priceRangeError } from '../lib/searchState.js';

const PRICE_DEBOUNCE_MS = 500;

// Price inputs validate locally and only commit a valid range, so an invalid
// range never reaches the API (the API validates independently as well).
export function PriceRange({ initialMin, initialMax, onCommit }) {
  const [min, setMin] = useState(initialMin);
  const [max, setMax] = useState(initialMax);
  const debounced = useDebouncedValue(`${min}|${max}`, PRICE_DEBOUNCE_MS);
  const error = priceRangeError(min, max);

  useEffect(() => {
    const [dMin, dMax] = debounced.split('|').map((v) => v.trim());
    if (priceRangeError(dMin, dMax)) return;
    if (dMin !== initialMin || dMax !== initialMax) onCommit({ minPrice: dMin, maxPrice: dMax });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const inputClass = (invalid) =>
    `w-full rounded-md border bg-white px-2.5 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 ${
      invalid ? 'border-red-400 focus:ring-red-500/30' : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/30'
    }`;

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-slate-800">Price (₹)</legend>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="minPrice">Minimum price</label>
        <input
          id="minPrice"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="Min"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'price-error' : undefined}
          className={inputClass(error)}
        />
        <span className="text-slate-400" aria-hidden="true">–</span>
        <label className="sr-only" htmlFor="maxPrice">Maximum price</label>
        <input
          id="maxPrice"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="Max"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'price-error' : undefined}
          className={inputClass(error)}
        />
      </div>
      {error && (
        <p id="price-error" role="alert" className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  );
}
