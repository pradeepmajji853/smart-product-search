import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchProducts } from '../lib/api.js';

const INITIAL = { status: 'loading', data: [], pagination: null, error: null };

// Fetches a page of products for the given API query string.
//
// Two layers protect against out-of-order responses when the query changes quickly:
//  1. The previous request is aborted (AbortController) as soon as the query changes.
//  2. Every request gets an increasing id; a response is only applied if its id is
//     still the latest one. This covers responses that resolve despite the abort
//     (e.g. already parsed, or a fetch implementation that ignores the signal).
export function useProducts(queryString) {
  const [result, setResult] = useState(INITIAL);
  const [attempt, setAttempt] = useState(0);
  const latestRequestId = useRef(0);

  useEffect(() => {
    const requestId = ++latestRequestId.current;
    const controller = new AbortController();
    setResult((prev) => ({ ...prev, status: 'loading', error: null }));

    fetchProducts(queryString, controller.signal)
      .then((body) => {
        if (requestId !== latestRequestId.current) return;
        setResult({ status: 'success', data: body.data, pagination: body.pagination, error: null });
      })
      .catch((error) => {
        if (error.name === 'AbortError' || requestId !== latestRequestId.current) return;
        setResult((prev) => ({ ...prev, status: 'error', error }));
      });

    return () => controller.abort();
  }, [queryString, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...result, retry };
}
