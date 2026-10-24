import { useEffect, useRef, useState } from 'react';
import { fetchSuggestions } from '../lib/api.js';
import { useDebouncedValue } from './useDebouncedValue.js';

export const SUGGEST_DEBOUNCE_MS = 150;
// Matches the server, which needs 3+ characters to use its trigram index.
export const SUGGEST_MIN_CHARS = 3;

// Autocomplete suggestions for the text being typed. Uses the same protection as
// useProducts: the previous request is aborted and only the latest response is applied.
export function useSuggestions(text, enabled) {
  const query = useDebouncedValue(text.trim(), SUGGEST_DEBOUNCE_MS);
  const [suggestions, setSuggestions] = useState([]);
  const latestRequestId = useRef(0);

  useEffect(() => {
    const requestId = ++latestRequestId.current;
    if (!enabled || query.length < SUGGEST_MIN_CHARS) {
      setSuggestions([]);
      return undefined;
    }
    const controller = new AbortController();
    fetchSuggestions(query, controller.signal)
      .then((body) => {
        if (requestId === latestRequestId.current) setSuggestions(Array.isArray(body.suggestions) ? body.suggestions : []);
      })
      .catch((error) => {
        // Suggestions are a convenience: failures simply show no dropdown.
        if (error.name !== 'AbortError' && requestId === latestRequestId.current) setSuggestions([]);
      });
    return () => controller.abort();
  }, [query, enabled]);

  return { suggestions, query };
}
