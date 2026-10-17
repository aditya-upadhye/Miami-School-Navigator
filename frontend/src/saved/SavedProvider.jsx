import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Saved schools are public school ids and names, not personal data, so they live in localStorage and survive closing the tab.
// (The family profile, which holds the address, stays in sessionStorage only.)
const KEY = 'sn-saved';

function load() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY));
    if (Array.isArray(raw)) return raw.filter((s) => s && typeof s.id === 'string');
  } catch {
    /* storage unavailable or corrupt: start empty */
  }
  return [];
}

const SavedContext = createContext(null);

export function SavedProvider({ children }) {
  const [saved, setSaved] = useState(load);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(saved));
    } catch {
      /* ignore */
    }
  }, [saved]);

  const isSaved = useCallback((id) => saved.some((s) => s.id === String(id)), [saved]);
  const toggleSaved = useCallback(
    (id, name) =>
      setSaved((list) =>
        list.some((s) => s.id === String(id))
          ? list.filter((s) => s.id !== String(id))
          : [...list, { id: String(id), name: name ?? '' }],
      ),
    [],
  );
  const clearSaved = useCallback(() => setSaved([]), []);

  const value = useMemo(
    () => ({ saved, isSaved, toggleSaved, clearSaved }),
    [saved, isSaved, toggleSaved, clearSaved],
  );
  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSaved() {
  const ctx = useContext(SavedContext);
  if (!ctx) throw new Error('useSaved must be used inside <SavedProvider>');
  return ctx;
}
