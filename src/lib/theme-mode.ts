import { useSyncExternalStore } from "react"
import { appThemeKey, migrateLegacyTheme } from "./theme-key"

// The colour mode of a prototype: light, dark or system (the OS preference). ARCH-1930.
//
// - The mode toggles the `.dark` class on <html>, which the compiled theme answers (`.dark { ... }`).
// - It is stored in localStorage (try/catch: private windows and blocked storage throw) under the per-app key `<app>.theme`
//   (lib/theme-key, shared with ThemeProvider; ARCH-2770, formerly `archie-theme-mode`), so every page of a
//   prototype (one origin) keeps it across navigation. Before the first choice the mode is the design system's default.
// - The page head carries a tiny inline script (src/steps/07-build.ts) that applies the stored mode before first paint; this
//   module does the same after hydration and on every change.
// - The theme CSS declares what the design system has through two custom properties on :root: `--theme-dark: 1` when the
//   system has a dark mode, `--theme-default: dark` when it opens in it. A system without a dark mode is always light and
//   `available` is false (the shell does not draw a Theme control then).
// - SSR-safe: the server render and the hydration render return the fixed default ("light", available) and never touch
//   window; the real value arrives right after hydration (useSyncExternalStore's server snapshot).

/** The storage key, resolved per call: apg prototypes get it from `<html data-theme-key>`, which must not be read once at module load. */
export const themeModeKey = (): string => appThemeKey()
export type ThemeMode = "light" | "dark" | "system"
export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"]
const DARK_QUERY = "(prefers-color-scheme: dark)"

const isMode = (v: unknown): v is ThemeMode => THEME_MODES.includes(v as ThemeMode)

// getComputedStyle forces style recalculation: the two theme variables never change on a page, so the first non-empty read is kept.
const cssCache: Record<string, string> = {}
function cssVar(name: string): string {
  if (cssCache[name]) return cssCache[name]
  let v = ""
  try { v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() } catch { /* no document */ }
  if (v) cssCache[name] = v
  return v
}

/** Whether the design system has a dark mode (the theme declares `--theme-dark: 1`). */
export function isDarkAvailable(): boolean { return cssVar("--theme-dark") === "1" }

/** The mode before the user's first choice: the design system's default, light when it declares none. */
export function defaultMode(): ThemeMode { return cssVar("--theme-default") === "dark" ? "dark" : "light" }

// One-time carry-over of `archie-theme-mode` / `archie-ui-theme`. It WRITES, so it runs from init/subscribe (an effect), never from
// getSnapshot (render). Tracked per key because the key is resolved lazily.
let migratedKey: string | null = null
export function initThemeMode(): void {
  const key = themeModeKey()
  if (migratedKey === key) return
  migratedKey = key
  migrateLegacyTheme(key)
}

/** Pure read (no writes): safe inside render. */
export function readStoredMode(): ThemeMode | null {
  try {
    const v = window.localStorage.getItem(themeModeKey())
    return isMode(v) ? v : null
  } catch { return null }
}

let memoryMode: ThemeMode | null = null // the choice of this page: the answer whenever storage cannot be written
let storageWritable = true
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

// The host's preview palette mode (apply-palette-mode): in memory only, never persisted, and the top precedence so a
// hydration/soft-nav `applyThemeMode()` does not strip the `.dark` the host pushed.
let hostPreviewMode: Exclude<ThemeMode, "system"> | null = null

/** The current mode: the host preview override, else the stored choice, else the in-memory choice, else the design system's default. */
export function getThemeMode(): ThemeMode {
  if (!isDarkAvailable()) return "light"
  if (hostPreviewMode) return hostPreviewMode
  // A write that failed means storage holds a stale value (or none): this page's own choice wins over it.
  return (storageWritable ? readStoredMode() : memoryMode) ?? memoryMode ?? defaultMode()
}

export function prefersDark(): boolean {
  try { return window.matchMedia(DARK_QUERY).matches } catch { return false }
}

/** Puts the class on <html> for a mode. A system without a dark mode never gets `.dark`. */
export function applyThemeMode(mode: ThemeMode = getThemeMode()): boolean {
  const dark = isDarkAvailable() && (mode === "dark" || (mode === "system" && prefersDark()))
  document.documentElement.classList.toggle("dark", dark)
  return dark
}

export function setThemeMode(mode: unknown): void {
  if (!isMode(mode)) return
  memoryMode = mode
  try { window.localStorage.setItem(themeModeKey(), mode); storageWritable = true } catch { storageWritable = false /* the in-memory choice stands */ }
  applyThemeMode(mode)
  emit()
}

declare global {
  interface Window {
    __archiePreviewMode?: "light" | "dark"
    __archieApplyPreviewMode?: (mode: unknown) => void
  }
}

/** Sets (or, with anything but "light"/"dark", clears) the host preview override. Not persisted. */
export function setHostPreviewMode(mode: unknown): void {
  const next = mode === "light" || mode === "dark" ? mode : null
  if (next === hostPreviewMode) return
  hostPreviewMode = next
  try {
    if (typeof window !== "undefined") {
      if (next) window.__archiePreviewMode = next
      else delete window.__archiePreviewMode
    }
  } catch { /* window not writable */ }
  applyThemeMode()
  emit()
}

// The apg router (outside the module graph) may push before or after this module evaluates: take its seed, expose the setter.
if (typeof window !== "undefined") {
  const seed = window.__archiePreviewMode
  if (seed === "light" || seed === "dark") hostPreviewMode = seed
  window.__archieApplyPreviewMode = (m: unknown) => setHostPreviewMode(m)
}

let mql: MediaQueryList | null = null
function ensureSystemListener() {
  if (mql || typeof window === "undefined" || !window.matchMedia) return
  try {
    mql = window.matchMedia(DARK_QUERY)
    // "system" follows the OS live; any other mode ignores the change
    mql.addEventListener("change", () => { if (getThemeMode() === "system") { applyThemeMode("system"); emit() } })
  } catch { mql = null }
}

function onStorage(e: StorageEvent): void {
  if (e.key !== null && e.key !== themeModeKey()) return
  applyThemeMode(); emit() // another tab changed it
}

export function subscribeThemeMode(listener: () => void): () => void {
  initThemeMode()
  if (!listeners.size) window.addEventListener("storage", onStorage)
  listeners.add(listener)
  ensureSystemListener()
  applyThemeMode() // first subscriber: the page head script already did this; it is idempotent
  return () => {
    listeners.delete(listener)
    if (!listeners.size) window.removeEventListener("storage", onStorage)
  }
}

// useSyncExternalStore: the server snapshot is the hydration snapshot, so the first client render matches the server HTML.
const serverMode = (): ThemeMode => "light"
const serverAvailable = (): boolean => true

/** `{ mode, setMode, available }`: mode is "light" | "dark" | "system"; `available` is false when the design system has no dark mode. */
export function useThemeMode(): { mode: ThemeMode; setMode: (mode: unknown) => void; available: boolean } {
  const mode = useSyncExternalStore(subscribeThemeMode, getThemeMode, serverMode)
  const available = useSyncExternalStore(subscribeThemeMode, isDarkAvailable, serverAvailable)
  return { mode, setMode: setThemeMode, available }
}
