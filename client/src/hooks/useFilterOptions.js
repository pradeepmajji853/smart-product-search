import { useCallback, useEffect, useState } from 'react';
import { fetchFilterOptions } from '../lib/api.js';

// Category options are global; brand options are narrowed to the selected category.
export function useFilterOptions(category) {
  const [state, setState] = useState({ status: 'loading', categories: [], brands: [], error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => ({ ...prev, status: 'loading', error: null }));
    fetchFilterOptions(category, controller.signal)
      .then((body) => setState({ status: 'success', categories: body.categories, brands: body.brands, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState((prev) => ({ ...prev, status: 'error', error }));
      });
    return () => controller.abort();
  }, [category, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
