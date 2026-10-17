import { afterEach, beforeEach, describe, expect, test } from "bun:test"

type G = Record<string, unknown>
const g = globalThis as unknown as G

let classes: Set<string>
let store: Record<string, string>
let cssVars: Record<string, string>
let n = 0

function install(vars: Record<string, string>, seedPreview?: string, stored?: Record<string, string>) {
  classes = new Set()
  store = { ...(stored ?? {}) }
  cssVars = vars
  const win: G = {
    localStorage: { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = v } },
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  if (seedPreview) win.__archiePreviewMode = seedPreview
  g.window = win
  g.document = {
    documentElement: {
      classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
      getAttribute: () => null,
    },
  }
  g.getComputedStyle = () => ({ getPropertyValue: (k: string) => cssVars[k] ?? "" })
  return win
}

// A fresh module instance per test: cssCache and the override are module state.
const load = () => import(`./theme-mode.ts?t=${++n}`) as Promise<typeof import("./theme-mode")>

const DARK = { "--theme-dark": "1" }
const saved = { window: g.window, document: g.document, getComputedStyle: g.getComputedStyle }

beforeEach(() => { install(DARK) })
afterEach(() => { Object.assign(g, saved) })

describe("host preview override", () => {
  test("survives a re-hydration applyThemeMode (the bug)", async () => {
    const m = await load()
    m.setHostPreviewMode("dark")
    expect(m.getThemeMode()).toBe("dark")
    expect(classes.has("dark")).toBe(true)
    m.applyThemeMode()
    expect(m.getThemeMode()).toBe("dark")
    expect(classes.has("dark")).toBe(true)
  })

  test("null clears back to stored/default", async () => {
    const m = await load()
    m.setHostPreviewMode("dark")
    m.setHostPreviewMode(null)
    expect(m.getThemeMode()).toBe("light")
    expect(classes.has("dark")).toBe(false)
    expect((g.window as G).__archiePreviewMode).toBeUndefined()
  })

  test("beats a persisted mode without writing storage", async () => {
    const key = "app.theme"
    install(DARK, undefined, { [key]: "light" })
    const m = await load()
    m.setHostPreviewMode("dark")
    expect(m.getThemeMode()).toBe("dark")
    expect(store[key]).toBe("light")
    expect(Object.keys(store)).toEqual([key])
  })

  test("is ignored when the design system has no dark mode", async () => {
    install({})
    const m = await load()
    m.setHostPreviewMode("dark")
    expect(m.getThemeMode()).toBe("light")
    expect(classes.has("dark")).toBe(false)
  })

  test("notifies subscribers on change", async () => {
    const m = await load()
    let calls = 0
    const off = m.subscribeThemeMode(() => { calls++ })
    m.setHostPreviewMode("dark")
    m.setHostPreviewMode("dark")
    expect(calls).toBe(1)
    off()
  })
})

describe("window seam", () => {
  test("__archieApplyPreviewMode drives the store", async () => {
    const m = await load()
    const win = g.window as G
    expect(typeof win.__archieApplyPreviewMode).toBe("function")
    ;(win.__archieApplyPreviewMode as (x: unknown) => void)("dark")
    expect(m.getThemeMode()).toBe("dark")
    ;(win.__archieApplyPreviewMode as (x: unknown) => void)("light")
    expect(m.getThemeMode()).toBe("light")
    expect(win.__archiePreviewMode).toBe("light")
  })

  test("a seed left before evaluation is honoured", async () => {
    install(DARK, "dark")
    const m = await load()
    expect(m.getThemeMode()).toBe("dark")
  })

  test("an invalid seed is ignored", async () => {
    install(DARK, "system")
    const m = await load()
    expect(m.getThemeMode()).toBe("light")
  })
})
