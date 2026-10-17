import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'sn-theme';

// Dark is the default, matching the prototype. Storage can throw (private mode, blocked cookies), so every
// access is guarded and the app simply falls back to the default.
function readStoredDark() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return stored === 'dark';
  } catch {
    /* ignore */
  }
  return true;
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(readStoredDark);

  // Keep several open tabs in sync.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) setDark(e.newValue === 'dark');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleTheme = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      dark,
      light: !dark,
      theme: dark ? 'dark' : 'light',
      themeLabel: dark ? 'Dark' : 'Light',
      themeAria: dark ? 'Switch to light theme' : 'Switch to dark theme',
      toggleTheme,
    }),
    [dark, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
