import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_STATE, parseSearchState, toSearchString } from '../lib/searchState.js';

// Keeps search state in sync with the URL.
//  * update(patch) writes a new history entry (or replaces it with { replace: true })
//    and resets to page 1 unless the patch sets a page itself.
//  * Browser back/forward (popstate) re-reads the URL.
//  * syncKey changes whenever state changes from outside the inputs (back/forward,
//    clear all); text inputs are keyed on it so their drafts re-initialise.
export function useUrlState() {
  const [state, setState] = useState(() => parseSearchState(window.location.search));
  const [syncKey, setSyncKey] = useState(0);
  const stateRef = useRef(state);

  const commit = useCallback((next, replace) => {
    stateRef.current = next;
    const search = toSearchString(next);
    if (search !== window.location.search.replace(/^\?/, '')) {
      const url = `${window.location.pathname}${search ? `?${search}` : ''}`;
      window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
    }
    setState(next);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const next = parseSearchState(window.location.search);
      stateRef.current = next;
      setState(next);
      setSyncKey((k) => k + 1);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const update = useCallback(
    (patch, { replace = false } = {}) => {
      const next = { ...stateRef.current, ...patch };
      if (!('page' in patch)) next.page = 1;
      commit(next, replace);
    },
    [commit],
  );

  // Clears the keyword and every filter; the chosen sort order is kept.
  const clearAll = useCallback(() => {
    commit({ ...DEFAULT_STATE, sort: stateRef.current.sort }, false);
    setSyncKey((k) => k + 1);
  }, [commit]);

  return { state, update, clearAll, syncKey };
}
