// Per-app theme storage key (ARCH-2695 S3.6 / ARCH-2770; owner decision 2026-10-13, option A).
//
// The theme choice lives in the BROWSER only (no server persistence), under `<app>.theme`, where `<app>` comes from the
// app/project id. Two Archie apps served from the same domain share one localStorage, so a single global key
// (`archie-ui-theme`, `archie-theme-mode`) made one app's choice leak into the other.
//
// Key source, in precedence order (the SAME order as the inline script in index.html):
//   1. `<html data-theme-key="<id>.theme">`, accepted only when it matches THEME_KEY_RE. apg builds this lib ONCE for every
//      prototype, so `import.meta.env.VITE_ARCHIE_PROJECT_ID` does not exist there; apg stamps the attribute on every page instead.
//   2. `VITE_ARCHIE_PROJECT_ID` (generated apps, where gv2 sets it at build time) -> `<id>.theme`.
//   3. `app.theme`.
// The index.html script cannot import this module, so `theme-key.test.ts` runs the script against `appThemeKey` in every case
// to keep the two from drifting.

export type StoredTheme = "light" | "dark" | "system"

export const THEME_VALUES: readonly StoredTheme[] = ["light", "dark", "system"]

/** Keys written by earlier template versions, read once to carry the user's choice over (never deleted: another app on the same
 *  domain may still need to migrate from them). `archie-ui-theme` = ThemeProvider, `archie-theme-mode` = lib/theme-mode. */
export const LEGACY_THEME_KEYS: readonly string[] = ["archie-ui-theme", "archie-theme-mode"]

// Same allow-list as the index.html script: keeps the key predictable and rules out anything odd in an env value.
const APP_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const FALLBACK_APP_ID = "app"

/** Attribute on <html> carrying the full key (apg prototypes). Contract shared with apg and the index.html script. */
export const THEME_KEY_ATTR = "data-theme-key"
export const THEME_KEY_RE = /^[A-Za-z0-9_-]{1,64}\.theme$/

/** Attribute on <html> carrying the design system's default mode (light | dark | system). */
export const THEME_DEFAULT_ATTR = "data-theme-default"

/** `<app>.theme`; an absent or malformed id falls back to `app.theme` (the sentinel project of an unconfigured build). */
export function themeStorageKey(appId?: string | null): string {
  const id = typeof appId === "string" && APP_ID_RE.test(appId) ? appId : FALLBACK_APP_ID
  return `${id}.theme`
}

function htmlAttr(name: string): string | null {
  try { return document.documentElement.getAttribute(name) } catch { return null /* no document (SSR, tests) */ }
}

/** The key of THIS page, resolved at call time: a valid `data-theme-key` attribute first, else derived from
 *  VITE_ARCHIE_PROJECT_ID (the value index.html receives through Vite's %ENV% substitution), else `app.theme`. */
export function appThemeKey(): string {
  const attr = htmlAttr(THEME_KEY_ATTR)
  if (attr !== null && THEME_KEY_RE.test(attr)) return attr
  return themeStorageKey(import.meta.env?.VITE_ARCHIE_PROJECT_ID as string | undefined)
}

/** The design default for ThemeProvider: a valid `data-theme-default` attribute, else "system". The index.html script applies the same rule. */
export function appDefaultTheme(): StoredTheme {
  const v = htmlAttr(THEME_DEFAULT_ATTR)
  return isStoredTheme(v) ? v : "system"
}

export function isStoredTheme(v: unknown): v is StoredTheme {
  return THEME_VALUES.includes(v as StoredTheme)
}

type ReadWrite = Pick<Storage, "getItem" | "setItem">

/**
 * One-time migration: when the per-app key holds no valid choice, copy the first valid legacy value into it.
 * Idempotent and storage-failure tolerant (private windows and blocked storage throw). Returns the value the key holds afterwards.
 */
export function migrateLegacyTheme(key: string = appThemeKey(), storage?: ReadWrite): StoredTheme | null {
  try {
    const s = storage ?? window.localStorage
    const current = s.getItem(key)
    if (isStoredTheme(current)) return current
    for (const legacy of LEGACY_THEME_KEYS) {
      const v = s.getItem(legacy)
      if (isStoredTheme(v)) {
        try { s.setItem(key, v) } catch { /* the value still applies for this page load */ }
        return v
      }
    }
  } catch { /* no storage */ }
  return null
}
