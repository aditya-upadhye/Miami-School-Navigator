import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { buildHostOrigins, DEFAULT_HOST_ORIGINS } from "./archie-host-origins"

// The test runner has no DOM (bun test, no jsdom/happy-dom in this template), so the bridge runs against a fake parent
// window and a fake document. CSSStyleSheet is a minimal stand-in whose replaceSync DECODES CSS escapes before
// "serialising" the rules (like a browser does), which is what the escape-bypass cases need; the 'unsupported' path
// is exercised by removing it.

const HOST = "https://app.dev.archie-platform.com"

type Posted = Record<string, unknown>

class FakeSheet {
  cssRules: { cssText: string }[] = []
  replaceSync(css: string): void {
    // Like a browser: escapes are decoded everywhere EXCEPT inside custom-property values, which stay verbatim.
    const kept: string[] = []
    const masked = css.replace(/(--[\w-]+\s*:)([^;}]*)/g, (_m, name: string, value: string) => `${name}@@${kept.push(value) - 1}@@`)
    const decodedMasked = masked.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    const decoded = decodedMasked.replace(/@@(\d+)@@/g, (_m, i: string) => kept[Number(i)])
    if ((decoded.match(/{/g) ?? []).length !== (decoded.match(/}/g) ?? []).length) throw new SyntaxError("unbalanced")
    const rules = decoded.match(/@import[^;]*;|[^{};]+\{[^}]*\}/g) ?? []
    this.cssRules = rules.map((cssText) => ({ cssText: cssText.trim() }))
  }
}

interface FakeLink {
  rel?: string
  href?: string
  attrs: Set<string>
  removed: boolean
  setAttribute(name: string): void
  remove(): void
}

const g = globalThis as unknown as Record<string, unknown>
const saved = { window: g.window, document: g.document, CSSStyleSheet: g.CSSStyleSheet, fetch: g.fetch }

let posted: Posted[]
let handler: ((e: unknown) => void) | undefined
let parent: { postMessage: (m: Posted) => void }
let win: Record<string, unknown>
let adopted: unknown[]
let links: FakeLink[]
let docProps: Map<string, string>
let paletteEl: { removed: boolean; remove(): void } | null

function makeEnv(): void {
  posted = []
  handler = undefined
  adopted = []
  links = []
  docProps = new Map()
  paletteEl = null
  parent = { postMessage: (m) => void posted.push(m) }
  win = {
    parent,
    archieDesignConfig: {},
    addEventListener: (_t: string, h: (e: unknown) => void) => void (handler = h),
  }
  const head = {
    appendChild: (el: FakeLink) => void links.push(el),
    querySelectorAll: () => links.filter((l) => l.attrs.has("data-archie-live-font") && !l.removed),
  }
  g.window = win
  g.document = {
    documentElement: {
      style: {
        setProperty: (k: string, v: string) => void docProps.set(k, v),
        removeProperty: (k: string) => void docProps.delete(k),
      },
      classList: { contains: () => false, add() {}, remove() {} },
      removeAttribute() {},
      setAttribute() {},
    },
    head,
    get adoptedStyleSheets() {
      return adopted
    },
    set adoptedStyleSheets(v: unknown[]) {
      adopted = v
    },
    getElementById: () => paletteEl,
    createElement: (): FakeLink => {
      const l: FakeLink = {
        attrs: new Set(),
        removed: false,
        setAttribute(n) {
          l.attrs.add(n)
        },
        remove() {
          l.removed = true
        },
      }
      return l
    },
    querySelector: () => null,
  }
  g.CSSStyleSheet = FakeSheet
  g.fetch = () => Promise.reject(new Error("no network in tests"))
}

let mod: typeof import("./archie-host-bridge")
let runtime: typeof import("./archie-design-runtime")

beforeAll(async () => {
  makeEnv()
  runtime = await import("./archie-design-runtime")
  mod = await import("./archie-host-bridge")
})
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete g[k]
    else g[k] = v
  }
})
beforeEach(() => {
  makeEnv()
  mod.installArchieHostBridge()
  posted = posted.filter((m) => m.type !== "ready")
})

function send(data: Record<string, unknown>, o: { origin?: string; source?: unknown } = {}): void {
  const e = { data: { source: "archie-app", ...data }, origin: o.origin ?? HOST, source: "source" in o ? o.source : parent }
  handler?.(e)
}

const acks = () => posted.filter((m) => m.type === "design-config-applied")
const lastAck = () => acks().at(-1) as { applied: unknown; reason?: string; themeCss: number }
const NORMAL_CSS = ":root{--primary:oklch(0.5 0.1 200)}"

describe("ready advertisement", () => {
  test("posts ready with themeCss:1 once at install, never again on a repeat install or a module re-eval", async () => {
    makeEnv()
    mod.installArchieHostBridge()
    expect(posted).toEqual([{ source: "archie-prototype", type: "ready", themeCss: 1 }])
    mod.installArchieHostBridge()
    await import("./archie-host-bridge.ts?re-eval")
    expect(posted.filter((m) => m.type === "ready")).toHaveLength(1)
  })
})

describe("acks carry themeCss:1 and applied", () => {
  test("design-config-applied from apply-design-config, apply-palette-mode and apply-theme-css; design-config from get-design-config", () => {
    send({ type: "apply-design-config", config: { fontFamily: "A" } })
    expect(lastAck()).toMatchObject({ themeCss: 1, applied: "design-config" })
    send({ type: "apply-palette-mode", mode: "dark" })
    expect(lastAck()).toMatchObject({ themeCss: 1, applied: "palette-mode" })
    send({ type: "get-design-config" })
    expect(posted.at(-1)).toMatchObject({ type: "design-config", themeCss: 1 })
    send({ type: "apply-theme-css", css: NORMAL_CSS })
    expect(lastAck()).toMatchObject({ themeCss: 1, applied: "theme-css" })
  })
})

describe("sender checks apply to every message type", () => {
  test("origin outside the allow-list is dropped (positive control from the host origin)", () => {
    for (const data of [
      { type: "get-design-config" },
      { type: "apply-design-config", config: { fontFamily: "A" } },
      { type: "apply-palette-mode", mode: "dark" },
      { type: "apply-theme-css", css: NORMAL_CSS },
    ]) {
      send(data, { origin: "https://evil.example.com" })
      send(data, { origin: "http://localhost:3000" }) // DEV-only origin; this test runs without import.meta.env.DEV
    }
    expect(posted).toEqual([])
    expect(adopted).toEqual([])
    expect(docProps.size).toBe(0)
    send({ type: "apply-theme-css", css: NORMAL_CSS })
    expect(lastAck().applied).toBe("theme-css")
  })

  test("a message the frame posts to itself (source === window) is dropped", () => {
    send({ type: "apply-theme-css", css: NORMAL_CSS }, { source: win })
    send({ type: "get-design-config" }, { source: win })
    expect(posted).toEqual([])
    expect(adopted).toEqual([])
  })

  test("another window (sibling frame) is dropped", () => {
    send({ type: "apply-theme-css", css: NORMAL_CSS }, { source: { postMessage() {} } })
    expect(posted).toEqual([])
  })

  test("origin list: defaults, VITE_ARCHIE_HOST_ORIGINS exact entries, localhost only in dev", () => {
    expect(buildHostOrigins(undefined, false)).toEqual([...DEFAULT_HOST_ORIGINS])
    expect(buildHostOrigins(" https://app.example.com , *.evil.com, https://x.com/path, ,HTTPS://Up.Example.com", false)).toEqual([
      ...DEFAULT_HOST_ORIGINS,
      "https://app.example.com",
      "https://up.example.com",
    ])
    expect(buildHostOrigins(undefined, true)).toContain("http://localhost:3000")
    expect(buildHostOrigins(undefined, false)).not.toContain("http://localhost:3000")
  })
})

describe("apply-theme-css", () => {
  test("adopts one sheet as the LAST adopted sheet and replaces it on each apply", () => {
    const other = new FakeSheet()
    adopted = [other]
    send({ type: "apply-theme-css", css: ":root{--a:1}" })
    expect(adopted).toHaveLength(2)
    expect(adopted[0]).toBe(other)
    const first = adopted[1]
    // another sheet gets adopted after ours (e.g. a library): ours must go back to the end
    const late = new FakeSheet()
    adopted = [...adopted, late]
    send({ type: "apply-theme-css", css: ":root{--a:2}" })
    expect(adopted).toHaveLength(3)
    expect(adopted).not.toContain(first)
    expect(adopted.slice(0, 2)).toEqual([other, late])
    expect((adopted[2] as FakeSheet).cssRules[0].cssText).toBe(":root{--a:2}")
  })

  test("css null and '' remove the sheet and the live font links", () => {
    send({ type: "apply-theme-css", css: NORMAL_CSS, fonts: ["https://fonts.googleapis.com/css2?family=Inter"] })
    expect(adopted).toHaveLength(1)
    expect(links.filter((l) => !l.removed)).toHaveLength(1)
    send({ type: "apply-theme-css", css: null })
    expect(adopted).toHaveLength(0)
    expect(links.filter((l) => !l.removed)).toHaveLength(0)
    expect(lastAck().applied).toBe("theme-css")
    send({ type: "apply-theme-css", css: NORMAL_CSS })
    send({ type: "apply-theme-css", css: "" })
    expect(adopted).toHaveLength(0)
  })

  test("fonts: only https://fonts.googleapis.com/css2 links, created with data-archie-live-font and replaced each apply", () => {
    const ok = "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap"
    send({ type: "apply-theme-css", css: NORMAL_CSS, fonts: [ok] })
    const live = () => links.filter((l) => !l.removed)
    expect(live().map((l) => [l.href, l.rel, l.attrs.has("data-archie-live-font")])).toEqual([[ok, "stylesheet", true]])
    send({ type: "apply-theme-css", css: NORMAL_CSS, fonts: [ok] })
    expect(live()).toHaveLength(1)
    for (const bad of [
      "http://fonts.googleapis.com/css2?family=Inter",
      "https://fonts.googleapis.com/css?family=Inter",
      "https://evil.example.com/css2?family=Inter",
      "https://fonts.googleapis.com.evil.com/css2?family=Inter",
      "https://user@fonts.googleapis.com/css2?family=Inter",
      "javascript:alert(1)",
    ]) {
      send({ type: "apply-theme-css", css: NORMAL_CSS, fonts: [ok, bad] })
      expect(lastAck()).toMatchObject({ applied: null, reason: "forbidden-font" })
    }
    expect(live().map((l) => l.href)).toEqual([ok]) // rejected payloads changed nothing
  })

  test("rejected payloads: ack applied:null with a reason and nothing adopted", () => {
    const rejected = (css: unknown, reason: string): void => {
      send({ type: "apply-theme-css", css })
      expect(lastAck()).toMatchObject({ themeCss: 1, applied: null, reason })
      expect(adopted).toEqual([])
    }
    rejected("@import 'https://evil.example.com/x.css';:root{--a:1}", "forbidden-css")
    rejected("@\\69mport 'https://evil.example.com/x.css';:root{--a:1}", "forbidden-css")
    rejected("@\\69 mport url(x);", "forbidden-css")
    rejected("a{background:url(https://evil.example.com/p.png)}", "forbidden-css")
    rejected("a{background:u\\72l(https://evil.example.com/p.png)}", "forbidden-css")
    rejected("a{background:\\75 rl(//evil.example.com)}", "forbidden-css")
    rejected("a{background:image-set('x.png' 1x)}", "forbidden-css")
    rejected("a{background:-webkit-image-set('x.png' 1x)}", "forbidden-css")
    rejected(":root{--x:url(https://e.test/a.png)} body{background-image:var(--x)}", "forbidden-css")
    rejected(":root{--x:src(\"https://e.test/a.png\")} body{background-image:var(--x)}", "forbidden-css")
    rejected(":root{--x:image(\"https://e.test/a.png\")} body{background-image:var(--x)}", "forbidden-css")
    rejected("a{background:\\69mage-set('x.png' 1x)}", "forbidden-css")
    rejected(":root{--x:u\\72l(https://e.test/2.png)} body{background-image:var(--x)}", "forbidden-css")
    rejected(":root{--x:\\69mage-set(\"https://e.test/2.png\" 1x)} body{background-image:var(--x)}", "forbidden-css")
    rejected("@property --w{syntax:'*';inherits:false;initial-value:u\\72l(https://e.test/2.png)}", "forbidden-css")
    rejected("@\\69mport 'https://e.test/x.css';:root{--a:1}", "forbidden-css")
    rejected("@IMPORT 'https://e.test/x.css';:root{--a:1}", "forbidden-css")
    rejected("a{content:'\\41'}", "forbidden-css")
    rejected(":root{--a:1", "invalid-css")
    rejected("a{b:c}".padEnd(256 * 1024 + 1, " "), "too-large")
    rejected(42, "invalid-payload")
    rejected({ x: 1 }, "invalid-payload")
  })

  test("a payload exactly at the cap is accepted", () => {
    send({ type: "apply-theme-css", css: ":root{--a:" + "x".repeat(256 * 1024 - 12) + "}" })
    expect(lastAck().applied).toBe("theme-css")
  })

  test("no constructable stylesheet support: ack applied:null 'unsupported', never a <style> fallback", () => {
    delete g.CSSStyleSheet
    send({ type: "apply-theme-css", css: NORMAL_CSS })
    expect(lastAck()).toMatchObject({ themeCss: 1, applied: null, reason: "unsupported" })
    expect(adopted).toEqual([])
    expect(links).toEqual([])
    expect(win.__archieThemeCssLatched).toBeUndefined()
  })

  test("a rejected payload does not latch", () => {
    send({ type: "apply-theme-css", css: "a{background:url(x)}" })
    expect(win.__archieThemeCssLatched).toBeUndefined()
    send({ type: "apply-design-config", config: { fontFamily: "A" } })
    expect(lastAck().applied).toBe("design-config")
    expect(docProps.get("--font-body")).toBe("A")
  })
})

describe("legacy shim latch", () => {
  test("first css apply clears the legacy writes and latches; later apply-design-config only acks", () => {
    send({ type: "apply-design-config", config: { fontFamily: "A", borderRadius: "9px", densityFactor: 1.1, shadowIntensity: "subtle" } })
    expect(docProps.get("--radius")).toBe("9px")
    paletteEl = { removed: false, remove() { this.removed = true } }

    send({ type: "apply-theme-css", css: NORMAL_CSS })
    expect(win.__archieThemeCssLatched).toBe(true)
    expect([...docProps.keys()]).toEqual([])
    expect(paletteEl.removed).toBe(true)

    send({ type: "apply-design-config", config: { fontFamily: "B", borderRadius: "1px", lightPalette: { primary: "#fff" } } })
    expect(lastAck()).toMatchObject({ themeCss: 1, applied: null, reason: "theme-css-latched" })
    expect([...docProps.keys()]).toEqual([])

    // still latched after the sheet is cleared: the legacy path stays off
    send({ type: "apply-theme-css", css: null })
    send({ type: "apply-design-config", config: { fontFamily: "C" } })
    expect(lastAck().reason).toBe("theme-css-latched")
    expect(docProps.size).toBe(0)
  })

  test("apply-palette-mode keeps working after the latch", () => {
    send({ type: "apply-theme-css", css: NORMAL_CSS })
    send({ type: "apply-palette-mode", mode: "dark" })
    expect(lastAck()).toMatchObject({ applied: "palette-mode" })
  })

  test("boot hydration after a css apply is skipped; unlatched it applies (positive control)", async () => {
    const cfg = { lightPalette: { primary: "#fff" }, borderRadius: "7px" }
    g.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(cfg) })
    win.__archieThemeCssLatched = true
    const latched = await import("./archie-design-runtime.ts?boot-latched")
    await (win.__designConfigReady as Promise<unknown>)
    expect(docProps.size).toBe(0)

    delete win.__archieThemeCssLatched
    await import("./archie-design-runtime.ts?boot-unlatched")
    await (win.__designConfigReady as Promise<unknown>)
    expect(docProps.get("--radius")).toBe("7px")
    expect(latched.isThemeCssLatched()).toBe(false)
  })
})

describe("clearLegacyWrites covers every property applyDesignConfig writes", () => {
  const FULL = {
    lightPalette: { primary: "#112233" },
    gradients: { primary: "a", accent: "b", hero: "c" },
    borderRadius: "12px",
    borderRadiusScale: { md: "10px", xl: "20px" },
    fontFamily: "A",
    headingFontFamily: "B",
    monoFontFamily: "C",
    typeScale: { xs: "0.8rem", base: "1rem" },
    typeRoleSizes: { body: "1.1rem", caption: "0.7rem" },
    animations: {
      duration: { fast: "1ms", normal: "2ms", slow: "3ms", slower: "4ms" },
      easing: { easeIn: "e1", easeOut: "e2", easeInOut: "e3" },
    },
    glassmorphism: true,
    glassmorphismIntensity: "heavy",
    spacing: { semantic: { pageGutter: "2rem", cardPadding: "1rem" } },
    densityFactor: 1.1,
    shadows: { sm: "0 1px 2px #000", card: "0 2px 4px #000" },
    shadowIntensity: "prominent",
    iconStrokeWidth: 1.5,
    iconSize: 20,
  }

  test("applying the full config then clearing leaves no inline property, incl. --icon-size and --icon-scale", () => {
    runtime.applyDesignConfig(FULL)
    for (const name of ["--icon-size", "--icon-scale", "--icon-stroke-width", "--shadow-strength", "--density-factor", "--shadow-sm", "--text-xs", "--type-body-size", "--spacing-page-gutter", "--ease-default", "--gradient-hero", "--radius-md", "--font-code", "--glassmorphism-blur", "--duration-slower"]) {
      expect(docProps.has(name)).toBe(true)
    }
    runtime.clearLegacyWrites()
    expect([...docProps.keys()]).toEqual([])
  })

  test("the icon defaults written when the config has no icon size are cleared too", () => {
    runtime.applyDesignConfig({})
    expect(docProps.get("--icon-size")).toBe("1em")
    runtime.clearLegacyWrites()
    expect(docProps.size).toBe(0)
  })

  test("previous shadow / text / role bookkeeping is reset: nothing from before the clear is removed again", () => {
    runtime.applyDesignConfig({ shadows: { sm: "x" }, typeScale: { xs: "1px" }, typeRoleSizes: { body: "1px" } })
    runtime.clearLegacyWrites()
    const removed: string[] = []
    const style = (g.document as { documentElement: { style: { removeProperty: (k: string) => void } } }).documentElement.style
    const orig = style.removeProperty
    style.removeProperty = (k: string) => {
      removed.push(k)
      orig(k)
    }
    runtime.applyDesignConfig({})
    expect(removed.filter((k) => k === "--shadow-sm" || k === "--text-xs" || k === "--type-body-size")).toEqual([])
  })
})
