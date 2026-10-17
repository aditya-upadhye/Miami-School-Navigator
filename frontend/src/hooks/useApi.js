import { useEffect, useRef, useState } from 'react';
import { useProfile } from '../profile/ProfileProvider';

/**
 * Run an async loader whenever `deps` change. Aborts the previous request, ignores stale responses, and optionally debounces
 * (for filters that change quickly). `load(signal)` must pass the signal to fetch. Returns { data, error, loading }.
 * The last good `data` is kept while a new request is loading, so lists do not flash empty.
 */
export function useApi(load, deps, { enabled = true, delay = 0 } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const { profile } = useProfile();
  const lang = profile.lang ?? 'en'; // a language change refetches, because the server's text changes with it
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return undefined;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    const timer = setTimeout(() => {
      loadRef
        .current(ctrl.signal)
        .then((data) => setState({ data, error: null, loading: false }))
        .catch((error) => {
          if (error?.name !== 'AbortError') setState((s) => ({ data: s.data, error, loading: false }));
        });
    }, delay);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, lang]);

  return state;
}
