import { afterEach, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { ThemeProvider, useTheme } from "../components/theme-provider"
import { appDefaultTheme, appThemeKey, LEGACY_THEME_KEYS, migrateLegacyTheme, themeStorageKey } from "./theme-key"

// ── The inline pre-paint script of index.html, executed against fakes ──
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8")
const scriptSource = (/<!-- archie:theme-init -->\s*<script>([\s\S]*?)<\/script>\s*<!-- \/archie:theme-init -->/.exec(html) ?? [])[1] ?? ""

function memoryStorage(seed: Record<string, string> = {}) {
  const data = { ...seed }
  return { data, getItem: (k: string) => (k in data ? data[k] : null), setItem: (k: string, v: string) => { data[k] = v } }
}

function runPrepaint(opts: { projectId?: string; keyAttr?: string; seed?: Record<string, string>; osDark?: boolean; defaultAttr?: string; brokenStorage?: boolean }) {
  const classes = new Set<string>()
  const root = {
    classList: { remove: (...c: string[]) => c.forEach((x) => classes.delete(x)), add: (c: string) => classes.add(c) },
    getAttribute: (n: string) => (n === "data-theme-default" ? opts.defaultAttr ?? null : n === "data-theme-key" ? opts.keyAttr ?? null : null),
  }
  const storage = memoryStorage(opts.seed)
  const localStorage = opts.brokenStorage ? { getItem: () => { throw new Error("blocked") }, setItem: () => { throw new Error("blocked") } } : storage
  const window = { matchMedia: () => ({ matches: opts.osDark === true }) }
  // Vite substitutes %VITE_ARCHIE_PROJECT_ID% at build time; emulate it (left literal when the variable is unset).
  const code = opts.projectId === undefined ? scriptSource : scriptSource.replace("%VITE_ARCHIE_PROJECT_ID%", opts.projectId)
  new Function("document", "localStorage", "window", code)({ documentElement: root }, localStorage, window)
  return { classes: [...classes], storage: storage.data }
}

describe("themeStorageKey", () => {
  test("is <app>.theme", () => expect(themeStorageKey("6f1c-aa")).toBe("6f1c-aa.theme"))
  test("falls back to app.theme for an absent or malformed id", () => {
    for (const bad of [undefined, null, "", "%VITE_ARCHIE_PROJECT_ID%", "a b", "x".repeat(65), "a.b"]) expect(themeStorageKey(bad)).toBe("app.theme")
  })
  test("two apps never share a key", () => expect(themeStorageKey("a1")).not.toBe(themeStorageKey("b2")))
})

describe("migrateLegacyTheme", () => {
  test("copies the first valid legacy value into the per-app key and keeps the legacy ones", () => {
    const s = memoryStorage({ "archie-theme-mode": "dark" })
    expect(migrateLegacyTheme("p1.theme", s)).toBe("dark")
    expect(s.data["p1.theme"]).toBe("dark")
    expect(s.data["archie-theme-mode"]).toBe("dark")
  })
  test("archie-ui-theme wins over archie-theme-mode (ThemeProvider was the control the user saw)", () => {
    expect(LEGACY_THEME_KEYS[0]).toBe("archie-ui-theme")
    expect(migrateLegacyTheme("p1.theme", memoryStorage({ "archie-ui-theme": "light", "archie-theme-mode": "dark" }))).toBe("light")
  })
  test("an existing per-app choice is never overwritten", () => {
    const s = memoryStorage({ "p1.theme": "system", "archie-ui-theme": "dark" })
    expect(migrateLegacyTheme("p1.theme", s)).toBe("system")
    expect(s.data["p1.theme"]).toBe("system")
  })
  test("ignores invalid legacy values and tolerates blocked storage", () => {
    expect(migrateLegacyTheme("p1.theme", memoryStorage({ "archie-ui-theme": "purple" }))).toBeNull()
    const blocked = { getItem: () => { throw new Error("x") }, setItem: () => { throw new Error("x") } }
    expect(migrateLegacyTheme("p1.theme", blocked)).toBeNull()
  })
})

describe("index.html pre-paint script (no flash on reload)", () => {
  test("is present, inline in <head>, before the module entry", () => {
    expect(scriptSource.length).toBeGreaterThan(100)
    expect(html.indexOf("archie:theme-init")).toBeLessThan(html.indexOf("</head>"))
    expect(html.indexOf("/archie:theme-init")).toBeLessThan(html.indexOf("/src/main.tsx"))
  })
  test("a saved dark choice puts .dark on <html> synchronously, whatever the OS says", () => {
    expect(runPrepaint({ projectId: "p1", seed: { [themeStorageKey("p1")]: "dark" }, osDark: false }).classes).toEqual(["dark"])
  })
  test("a saved light choice beats a dark OS", () => {
    expect(runPrepaint({ projectId: "p1", seed: { [themeStorageKey("p1")]: "light" }, osDark: true }).classes).toEqual(["light"])
  })
  test("another app's choice on the same domain is ignored", () => {
    expect(runPrepaint({ projectId: "p1", seed: { [themeStorageKey("p2")]: "dark" }, osDark: false }).classes).toEqual(["light"])
  })
  test("key parity with themeStorageKey: the script reads exactly <app>.theme", () => {
    const { storage } = runPrepaint({ projectId: "abc-123", seed: { "archie-ui-theme": "dark" } })
    expect(storage[themeStorageKey("abc-123")]).toBe("dark")
  })
  test("legacy keys migrate once into the per-app key and apply", () => {
    const r = runPrepaint({ projectId: "p1", seed: { "archie-theme-mode": "dark" } })
    expect(r.classes).toEqual(["dark"])
    expect(r.storage["p1.theme"]).toBe("dark")
  })
  test("nothing stored: starts from the design default (data-theme-default), else system", () => {
    expect(runPrepaint({ projectId: "p1", defaultAttr: "dark", osDark: false }).classes).toEqual(["dark"])
    expect(runPrepaint({ projectId: "p1", osDark: true }).classes).toEqual(["dark"])
    expect(runPrepaint({ projectId: "p1", osDark: false }).classes).toEqual(["light"])
  })
  test("an unset project id (literal placeholder) uses app.theme", () => {
    expect(runPrepaint({ seed: { "app.theme": "dark" } }).classes).toEqual(["dark"])
  })
  test("blocked storage never throws and falls back to the default", () => {
    expect(runPrepaint({ projectId: "p1", brokenStorage: true, osDark: true }).classes).toEqual(["dark"])
  })
})

// ── appThemeKey / appDefaultTheme read the live document and env; the script must agree with them in every case ──
const g = globalThis as unknown as Record<string, unknown>
const realDocument = g.document
const realLocalStorage = g.localStorage
const ENV = "VITE_ARCHIE_PROJECT_ID"
const realEnv = process.env[ENV] // bun aliases import.meta.env to process.env
afterEach(() => {
  g.document = realDocument
  g.localStorage = realLocalStorage
  if (realEnv === undefined) delete process.env[ENV]
  else process.env[ENV] = realEnv
})

function withPage(opts: { projectId?: string; keyAttr?: string; defaultAttr?: string }) {
  g.document = { documentElement: { getAttribute: (n: string) => (n === "data-theme-key" ? opts.keyAttr ?? null : n === "data-theme-default" ? opts.defaultAttr ?? null : null) } }
  if (opts.projectId === undefined) delete process.env[ENV]
  else process.env[ENV] = opts.projectId
}

/** The key the index.html script writes to, observed through the legacy migration (a seeded legacy value lands under the key it chose). */
function scriptKey(opts: { projectId?: string; keyAttr?: string }): string {
  const { storage } = runPrepaint({ ...opts, seed: { "archie-ui-theme": "dark" } })
  const keys = Object.keys(storage).filter((k) => k !== "archie-ui-theme")
  expect(keys).toHaveLength(1)
  return keys[0]
}

describe("key source: data-theme-key attribute > env > app.theme (script and function agree)", () => {
  const cases: Array<[string, { projectId?: string; keyAttr?: string }, string]> = [
    ["attribute wins over env", { keyAttr: "proto-1.theme", projectId: "env-1" }, "proto-1.theme"],
    ["attribute alone (no env, apg prototype)", { keyAttr: "proto-1.theme" }, "proto-1.theme"],
    ["invalid attribute (wrong suffix) is ignored", { keyAttr: "proto-1", projectId: "env-1" }, "env-1.theme"],
    ["invalid attribute (bad chars) is ignored", { keyAttr: "a b.theme", projectId: "env-1" }, "env-1.theme"],
    ["invalid attribute (dotted id) is ignored", { keyAttr: "a.b.theme", projectId: "env-1" }, "env-1.theme"],
    ["invalid attribute (too long) is ignored", { keyAttr: `${"x".repeat(65)}.theme`, projectId: "env-1" }, "env-1.theme"],
    ["empty attribute is ignored", { keyAttr: "", projectId: "env-1" }, "env-1.theme"],
    ["invalid attribute and no env falls to app.theme", { keyAttr: "nope" }, "app.theme"],
    ["env only", { projectId: "env-1" }, "env-1.theme"],
    ["empty env id falls to app.theme", { projectId: "" }, "app.theme"],
    ["malformed env id falls to app.theme", { projectId: "a b" }, "app.theme"],
    ["nothing set", {}, "app.theme"],
  ]
  for (const [name, opts, expected] of cases) {
    test(name, () => {
      withPage(opts)
      expect(appThemeKey()).toBe(expected)
      expect(scriptKey(opts)).toBe(expected)
    })
  }
  test("the key is resolved lazily: the same module follows a changed attribute", () => {
    withPage({ keyAttr: "one.theme" })
    expect(appThemeKey()).toBe("one.theme")
    withPage({ keyAttr: "two.theme" })
    expect(appThemeKey()).toBe("two.theme")
  })
  test("no document at all falls back without throwing", () => {
    g.document = undefined
    delete process.env[ENV]
    expect(appThemeKey()).toBe("app.theme")
    expect(appDefaultTheme()).toBe("system")
  })
})

describe("default mode: data-theme-default, ThemeProvider and the script pick the same initial theme", () => {
  function providerTheme(storage: ReturnType<typeof memoryStorage>): string {
    g.localStorage = storage
    let seen = ""
    const Probe = () => { seen = useTheme().theme; return null }
    // main.tsx renders exactly this: storageKey/defaultTheme come from the page attributes
    renderToString(createElement(ThemeProvider, { storageKey: appThemeKey(), defaultTheme: appDefaultTheme() }, createElement(Probe)))
    return seen
  }
  const resolve = (theme: string, osDark: boolean) => (theme === "dark" || (theme === "system" && osDark) ? "dark" : "light")

  const cases: Array<{ name: string; keyAttr?: string; defaultAttr?: string; seed?: Record<string, string>; osDark: boolean }> = [
    { name: "default dark", defaultAttr: "dark", osDark: false },
    { name: "default light on a dark OS", defaultAttr: "light", osDark: true },
    { name: "default system on a dark OS", defaultAttr: "system", osDark: true },
    { name: "no attribute on a dark OS", osDark: true },
    { name: "no attribute on a light OS", osDark: false },
    { name: "invalid default is ignored by both", defaultAttr: "purple", osDark: true },
    { name: "stored choice beats the default", defaultAttr: "dark", seed: { "p1.theme": "light" }, osDark: true },
    { name: "attribute key + stored choice", keyAttr: "proto-1.theme", defaultAttr: "dark", seed: { "proto-1.theme": "light" }, osDark: true },
    { name: "legacy value migrates, then wins over the default", defaultAttr: "light", seed: { "archie-theme-mode": "dark" }, osDark: false },
  ]
  for (const c of cases) {
    test(c.name, () => {
      const projectId = "p1"
      withPage({ projectId, keyAttr: c.keyAttr, defaultAttr: c.defaultAttr })
      const store = memoryStorage(c.seed)
      migrateLegacyTheme(appThemeKey(), store) // main.tsx runs this before the provider mounts
      const fromProvider = providerTheme(store)
      const fromScript = runPrepaint({ projectId, keyAttr: c.keyAttr, defaultAttr: c.defaultAttr, seed: c.seed, osDark: c.osDark }).classes
      expect(fromScript).toEqual([resolve(fromProvider, c.osDark)])
    })
  }
  test("appDefaultTheme validates the attribute", () => {
    for (const v of ["light", "dark", "system"]) { withPage({ defaultAttr: v }); expect(appDefaultTheme()).toBe(v) }
    for (const v of ["purple", "", "DARK"]) { withPage({ defaultAttr: v }); expect(appDefaultTheme()).toBe("system") }
  })
})

describe("index.html script with an empty project id", () => {
  test("an empty substituted id (VITE_ARCHIE_PROJECT_ID=) uses app.theme", () => {
    expect(runPrepaint({ projectId: "", seed: { "app.theme": "dark" } }).classes).toEqual(["dark"])
  })
})

describe("main.tsx wiring", () => {
  // main.tsx mounts the whole app on import, so it is checked as source: the provider must receive the lazily resolved key and default.
  const main = readFileSync(new URL("../main.tsx", import.meta.url), "utf8")
  test("passes appThemeKey() and appDefaultTheme() to ThemeProvider", () => {
    expect(main).toMatch(/<ThemeProvider\s+defaultTheme=\{appDefaultTheme\(\)\}\s+storageKey=\{appThemeKey\(\)\}/)
  })
  test("theme-provider keeps the initializer text gv2 patches", () => {
    const tp = readFileSync(new URL("../components/theme-provider.tsx", import.meta.url), "utf8")
    expect(tp).toContain("(localStorage.getItem(storageKey) as Theme) || defaultTheme")
  })
})
