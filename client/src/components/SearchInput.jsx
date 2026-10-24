import { useEffect, useState } from 'react';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';

export const SEARCH_DEBOUNCE_MS = 300;

// Keeps its own draft while the user types and commits it after a pause.
// The parent re-mounts it (via key) when the committed value changes externally.
export function SearchInput({ initialValue, onCommit }) {
  const [draft, setDraft] = useState(initialValue);
  const debounced = useDebouncedValue(draft, SEARCH_DEBOUNCE_MS);
  const [committed, setCommitted] = useState(initialValue.trim());

  const commit = (value) => {
    const next = value.trim();
    if (next === committed) return;
    setCommitted(next);
    onCommit(next);
  };

  useEffect(() => {
    commit(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        commit(draft);
      }}
    >
      <label htmlFor="search" className="sr-only">
        Search products
      </label>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="currentColor">
        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 3.47 9.77l3.63 3.63a.75.75 0 1 0 1.06-1.06l-3.63-3.63A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z" clipRule="evenodd" />
      </svg>
      <input
        id="search"
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Search by name, brand, category or SKU"
        autoComplete="off"
        maxLength={100}
        className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft('');
            commit('');
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Clear search"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      )}
    </form>
  );
}
