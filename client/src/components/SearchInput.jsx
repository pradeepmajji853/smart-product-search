import { useEffect, useState } from 'react';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useSuggestions } from '../hooks/useSuggestions.js';
import { Highlight } from './Highlight.jsx';

export const SEARCH_DEBOUNCE_MS = 300;
const LISTBOX_ID = 'search-suggestions';

const KIND_LABEL = { brand: 'Brand', category: 'Category', product: 'Product' };

function SuggestionContent({ suggestion, terms }) {
  if (suggestion.type === 'correction') {
    return (
      <span>
        Did you mean <strong className="font-semibold text-indigo-700">{suggestion.value}</strong>?
      </span>
    );
  }
  const detail =
    suggestion.type === 'product'
      ? `${suggestion.brand} · ${suggestion.category}`
      : `${KIND_LABEL[suggestion.type]} · ${suggestion.count} product${suggestion.count === 1 ? '' : 's'}`;
  return (
    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
      <span className="truncate text-slate-900">
        <Highlight text={suggestion.value} terms={terms} />
      </span>
      <span className="shrink-0 text-xs text-slate-500">{detail}</span>
    </span>
  );
}

// Search box with autocomplete. Keeps its own draft while the user types and commits it
// after a pause (or on Enter). The parent re-mounts it (via key) when the committed value
// changes externally. Implements the ARIA combobox pattern: arrow keys move through the
// suggestions, Enter picks one, Escape closes the list.
export function SearchInput({ initialValue, onCommit, onSelectSuggestion }) {
  const [draft, setDraft] = useState(initialValue);
  const debounced = useDebouncedValue(draft, SEARCH_DEBOUNCE_MS);
  const [committed, setCommitted] = useState(initialValue.trim());
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { suggestions, query } = useSuggestions(draft, open);
  const showList = open && suggestions.length > 0;
  const terms = query.split(/\s+/).filter(Boolean);

  const commit = (value) => {
    const next = value.trim();
    if (next === committed) return;
    setCommitted(next);
    onCommit(next);
  };

  const choose = (suggestion) => {
    setOpen(false);
    onSelectSuggestion(suggestion);
  };

  useEffect(() => {
    commit(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  useEffect(() => setActiveIndex(-1), [suggestions]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && showList) {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && showList && activeIndex >= 0) {
      e.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
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
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={LISTBOX_ID}
        aria-activedescendant={showList && activeIndex >= 0 ? `${LISTBOX_ID}-${activeIndex}` : undefined}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
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
            setOpen(false);
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
      <ul
        id={LISTBOX_ID}
        role="listbox"
        aria-label="Search suggestions"
        hidden={!showList}
        className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
      >
        {suggestions.map((suggestion, index) => (
          <li
            key={`${suggestion.type}-${suggestion.id ?? suggestion.value}`}
            id={`${LISTBOX_ID}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            // mousedown (not click) so the input does not blur and close the list first
            onMouseDown={(e) => {
              e.preventDefault();
              choose(suggestion);
            }}
            onMouseEnter={() => setActiveIndex(index)}
            className={`flex cursor-pointer items-center px-3 py-2 text-sm ${index === activeIndex ? 'bg-indigo-50' : ''}`}
          >
            <SuggestionContent suggestion={suggestion} terms={terms} />
          </li>
        ))}
      </ul>
    </form>
  );
}
