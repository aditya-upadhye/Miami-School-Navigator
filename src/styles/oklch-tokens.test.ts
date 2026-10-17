import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import postcss, { type Declaration, type Rule } from "postcss"
import { compile } from "@tailwindcss/node"

// ARCH-2055 8.7: colour tokens are FULL oklch values (shadcn v4 / apg), never bare HSL triplets, and nothing wraps a
// token in hsl(). Otherwise apg's generated theme (full oklch values, `@theme inline { --color-x: var(--x) }`)
// loaded into a template-built app yields `hsl(oklch(...))`, which is invalid CSS.
const STYLES = import.meta.dir
const globals = readFileSync(join(STYLES, "globals.css"), "utf8")
const apg = readFileSync(join(STYLES, "__fixtures__", "apg-theme.sample.css"), "utf8")
// globals.css as it was on master @ 0d87108 (bare HSL triplets): the baseline for the visual-identity check.
const baseline = readFileSync(join(STYLES, "__fixtures__", "globals.hsl-baseline.css"), "utf8")

const CANDIDATES = [
  "bg-primary", "text-primary-foreground", "bg-background", "text-foreground", "border-border", "bg-card", "bg-muted",
  "text-muted-foreground", "bg-destructive", "bg-success", "bg-sidebar", "bg-chart-1", "ring-ring", "bg-gradient-hero",
  "bg-gradient-primary", "glass", "glass-card", "bg-status-danger", "text-text-muted", "bg-surface-sunken",
  "border-border-strong", "bg-primary/50", "dark:bg-card",
]

async function build(css: string): Promise<string> {
  const compiled = await compile(css, { base: STYLES, onDependency() {} })
  return compiled.build(CANDIDATES)
}

const BARE_TRIPLET = /^-?\d*\.?\d+(?:deg)?\s+\d*\.?\d+%\s+\d*\.?\d+%$/

function declarations(css: string): Declaration[] {
  const out: Declaration[] = []
  postcss.parse(css).walkDecls((d) => { out.push(d) })
  return out
}

/** Assertions shared by the template-only and template+apg compiles. */
function expectNoHslWrapping(out: string): void {
  expect(out).not.toContain("hsl(oklch(")
  expect(out).not.toContain("hsl(var(")
  const triplets = declarations(out)
    .filter((d) => d.prop.startsWith("--") && BARE_TRIPLET.test(d.value.trim()))
    .map((d) => `${d.prop}: ${d.value}`)
  expect(triplets).toEqual([])
}

function winnerOf(css: string, prop: string, selector = ":root"): string | undefined {
  let value: string | undefined
  postcss.parse(css).walkRules((rule: Rule) => {
    if (!rule.selectors.includes(selector)) return
    if (rule.parent?.type === "atrule") {
      const at = rule.parent as postcss.AtRule
      if (at.name === "layer") return // the layered theme-defaults lose to unlayered declarations
      if (at.name === "media") return
    }
    rule.walkDecls(prop, (d) => { value = d.value })
  })
  return value
}

/** The root-element custom properties as the browser cascade resolves them (unlayered beats layered, then source order). */
function rootVars(css: string): Map<string, string> {
  const all: { prop: string; value: string; layered: number; order: number }[] = []
  let order = 0
  postcss.parse(css).walkRules((rule: Rule) => {
    if (!rule.selectors.includes(":root")) return
    if (rule.parent?.type === "atrule" && (rule.parent as postcss.AtRule).name === "media") return
    const layered = rule.parent?.type === "atrule" && (rule.parent as postcss.AtRule).name === "layer" ? 0 : 1
    rule.walkDecls((d) => { if (d.prop.startsWith("--")) all.push({ prop: d.prop, value: d.value, layered, order: order++ }) })
  })
  all.sort((a, b) => a.layered - b.layered || a.order - b.order)
  return new Map(all.map((d) => [d.prop, d.value]))
}

/** Substitute var(--x) from the root vars until fixed point, as the browser would compute the value. */
function resolveVars(value: string, vars: Map<string, string>): string {
  let v = value
  for (let i = 0; i < 8 && /var\(--[\w-]+\)/.test(v); i++) v = v.replace(/var\((--[\w-]+)\)/g, (m, name) => vars.get(name) ?? m)
  return v
}

/** What every utility colour declaration computes to: must never be `hsl(oklch(...))` (invalid under apg's theme). */
function expectResolvedColoursValid(out: string): void {
  const vars = rootVars(out)
  const bad: string[] = []
  postcss.parse(out).walkDecls((d) => {
    if (!/^(background-color|color|border-color|--color-\S+)$/.test(d.prop) && !d.prop.includes("color")) return
    const resolved = resolveVars(d.value, vars)
    if (/hsl\(\s*(oklch|hsl|rgb|var)\(/.test(resolved) || resolved.includes("hsl(oklch(")) bad.push(`${d.prop}: ${resolved}`)
  })
  expect(bad).toEqual([])
}

describe("compiled CSS: no hsl() wrapping, no bare triplets", () => {
  test("(a) template only", async () => {
    const out = await build(globals)
    expectNoHslWrapping(out)
    expect(winnerOf(out, "--primary")).toStartWith("oklch(")
    expect(winnerOf(out, "--primary", ".dark")).toStartWith("oklch(")
  })

  test("(b) template + apg's generated theme (valid CSS in both load orders; --color-primary resolves to apg's oklch when loaded after)", async () => {
    const IMPORTS_END = '@import "./safelist.css";'
    // Loaded BEFORE globals' own :root, apg's palette loses by source order to the template defaults (it is meant to
    // load after); the contract layer is what the other test file covers for that order. Here: valid CSS either way.
    expectNoHslWrapping(await build(globals.replace(IMPORTS_END, `${IMPORTS_END}\n${apg}`)))
    for (const css of [`${globals}\n${apg}`]) {
      const out = await build(css)
      expectNoHslWrapping(out)
      expectResolvedColoursValid(out)
      // `--color-primary` is `var(--primary)` and --primary is apg's (unlayered) value
      expect(css).toContain("--color-primary: var(--primary);")
      expect(winnerOf(out, "--primary")).toBe("oklch(0.4783 0.0975 164.85)")
      let bg: string | undefined
      postcss.parse(out).walkRules((r) => { if (r.selectors.includes(".bg-primary")) r.walkDecls("background-color", (d) => { bg = d.value }) })
      expect(bg).toBe("var(--primary)")
    }
  })

  test("globals.css source: no hsl( and no triplet-valued colour property", () => {
    expect(globals).not.toMatch(/hsl\(/i)
    const triplets = declarations(globals).filter((d) => d.prop.startsWith("--") && BARE_TRIPLET.test(d.value.trim()))
    expect(triplets.map((d) => d.prop)).toEqual([])
  })
})

// --- visual identity: OLD hsl triplet vs NEW oklch, ΔE in OKLab (×100), via an independent XYZ route ---------------

function hslToSrgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)) }
  return [f(0), f(8), f(4)]
}
function srgbToOklabViaXyz(rgb: [number, number, number]): [number, number, number] {
  const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  const X = 0.4123907993 * r + 0.3575843394 * g + 0.1804807884 * b
  const Y = 0.2126390059 * r + 0.7151686788 * g + 0.0721923154 * b
  const Z = 0.0193308187 * r + 0.1191947798 * g + 0.9505321522 * b
  const l = Math.cbrt(0.8190224432 * X + 0.3619062562 * Y - 0.1288737815 * Z)
  const m = Math.cbrt(0.0329836539 * X + 0.9292868615 * Y + 0.0361446663 * Z)
  const s = Math.cbrt(0.0481771894 * X + 0.2642395317 * Y + 0.6335478258 * Z)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
function block(css: string, selector: string): Map<string, string> {
  const map = new Map<string, string>()
  let seen = false
  postcss.parse(css).walkRules((rule: Rule) => {
    if (seen || rule.parent?.type !== "root" || !rule.selectors.includes(selector)) return
    seen = true
    rule.walkDecls((d) => { map.set(d.prop, d.value.trim()) })
  })
  return map
}

describe("visual identity: default tokens are the exact numeric conversion of the old HSL", () => {
  for (const selector of [":root", ".dark"]) {
    test(`${selector}: ΔE(OKLab) < 1 for every colour token`, () => {
      const oldBlock = block(baseline, selector)
      const newBlock = block(globals, selector)
      let checked = 0
      for (const [prop, value] of oldBlock) {
        const m = /^(-?[\d.]+) ([\d.]+)% ([\d.]+)%$/.exec(value)
        if (!m) continue // non-colour token
        const next = newBlock.get(prop)
        expect(next, `${selector} ${prop} missing`).toBeDefined()
        const n = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(next!)
        expect(n, `${selector} ${prop} = ${next}`).not.toBeNull()
        const oldLab = srgbToOklabViaXyz(hslToSrgb(+m[1], +m[2] / 100, +m[3] / 100))
        const L = +n![1], C = +n![2], H = (+n![3] * Math.PI) / 180
        const newLab = [L, C * Math.cos(H), C * Math.sin(H)]
        const dE = 100 * Math.hypot(oldLab[0] - newLab[0], oldLab[1] - newLab[1], oldLab[2] - newLab[2])
        expect(dE, `${selector} ${prop}`).toBeLessThan(1)
        checked++
      }
      expect(checked).toBeGreaterThanOrEqual(selector === ":root" ? 38 : 36)
    })
  }

  test("every colour token of the old block is converted (no triplet left, none dropped)", () => {
    const oldColours = [...block(baseline, ":root").entries()].filter(([, v]) => BARE_TRIPLET.test(v)).map(([k]) => k)
    const newBlock = block(globals, ":root")
    for (const k of oldColours) expect(newBlock.get(k), k).toStartWith("oklch(")
  })
})

// --- runtime: what archie-design-runtime writes ------------------------------------------------------------------

describe("archie-design-runtime writes FULL colours", () => {
  const g = globalThis as Record<string, unknown>
  const saved = { window: g.window, document: g.document, fetch: g.fetch }
  const styleEl = { id: "", textContent: "" }
  const rootProps = new Map<string, string>()
  let runtime: typeof import("../lib/archie-design-runtime")

  beforeAll(async () => {
    const win: Record<string, unknown> = {}
    g.window = win
    g.document = {
      getElementById: () => null,
      createElement: () => styleEl,
      head: { appendChild: () => {} },
      querySelector: () => null,
      documentElement: {
        classList: { contains: () => false, remove: () => {}, add: () => {} },
        removeAttribute: () => {},
        setAttribute: () => {},
        style: { setProperty: (k: string, v: string) => rootProps.set(k, v), removeProperty: () => {} },
      },
    }
    g.fetch = () => Promise.reject(new Error("no network in test"))
    runtime = await import("../lib/archie-design-runtime")
  })
  afterAll(() => {
    g.window = saved.window
    g.document = saved.document
    g.fetch = saved.fetch
  })

  function written(): Map<string, string> {
    const map = new Map<string, string>()
    const light = /:root\{([^}]*)\}/.exec(styleEl.textContent)?.[1] ?? ""
    for (const m of light.matchAll(/--([a-z0-9-]+):([^;]+);/g)) map.set(m[1], m[2])
    return map
  }
  const FULL = /^(oklch\([\d.]+ [\d.]+ [\d.]+( \/ [\d.]+)?\)|hsl\([\d.]+ [\d.]+% [\d.]+%\)|rgb\(.+\))$/

  test("a hex palette value becomes oklch(...), never a triplet", () => {
    runtime.applyDesignConfig({ lightPalette: { primary: "#3b82f6", onPrimary: "#fff", error: "#ef4444" }, darkPalette: { primary: "#60a5fa" } })
    const w = written()
    expect(w.get("primary")).toBe("oklch(0.6231 0.1880 259.81)")
    expect(w.get("primary-foreground")).toBe("oklch(1.0000 0.0000 0)")
    expect(w.get("destructive")).toMatch(/^oklch\(/)
    for (const v of w.values()) {
      expect(v).toMatch(FULL)
      expect(v).not.toMatch(BARE_TRIPLET)
    }
  })

  test("a legacy bare HSL triplet in design-config is converted on read to hsl(...)", () => {
    runtime.applyDesignConfig({ lightPalette: { primary: "221.2 83.2% 53.3%", background: "0 0% 100%" } })
    const w = written()
    expect(w.get("primary")).toBe("hsl(221.2 83.2% 53.3%)")
    expect(w.get("background")).toBe("hsl(0 0% 100%)")
  })

  test("a legacy triplet WITH alpha keeps its alpha; a no-alpha triplet is unchanged", () => {
    runtime.applyDesignConfig({ lightPalette: { primary: "221.2 83.2% 53.3% / 0.5", accent: "221.2 83.2% 53.3% / 50%", muted: "210 40% 96.1%" } })
    const w = written()
    expect(w.get("primary")).toBe("hsl(221.2 83.2% 53.3% / 0.5)")
    expect(w.get("accent")).toBe("hsl(221.2 83.2% 53.3% / 50%)")
    expect(w.get("muted")).toBe("hsl(210 40% 96.1%)")
  })

  test("an already-full colour passes through untouched", () => {
    runtime.applyDesignConfig({ lightPalette: { primary: "oklch(0.5 0.1 200)", accent: "rgb(1 2 3)" } })
    const w = written()
    expect(w.get("primary")).toBe("oklch(0.5 0.1 200)")
    expect(w.get("accent")).toBe("rgb(1 2 3)")
  })
})
