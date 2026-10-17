import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import postcss, { type AtRule, type Declaration, type Rule } from "postcss"
import { compile } from "@tailwindcss/node"

// ARCH-2276: density, radius, type scale and fonts flow through CSS variables. These tests compile globals.css with
// Tailwind v4 (as theme-contract.test.ts does) and read what the utilities and :root actually resolve to.
const STYLES = import.meta.dir
const globals = readFileSync(join(STYLES, "globals.css"), "utf8")
const contract = readFileSync(join(STYLES, "theme-contract.css"), "utf8")
const apg = readFileSync(join(STYLES, "__fixtures__", "apg-theme.sample.css"), "utf8")

const CANDIDATES = ["p-4", "-mt-2", "gap-6", "rounded-md", "rounded-2xl", "font-heading", "font-mono", "text-xs", "text-3xl", "font-sans", "type-body", "type-caption", "type-eyebrow", "rounded-control", "shadow-md", "shadow-float"]

async function build(css: string): Promise<string> {
  const compiled = await compile(css, { base: STYLES, onDependency() {} })
  return compiled.build(CANDIDATES)
}

const inLayer = (rule: Rule): boolean => {
  for (let p = rule.parent; p && p.type !== "root"; p = p.parent) if (p.type === "atrule" && (p as AtRule).name === "layer") return true
  return false
}

/** Winning `:root` declaration of `prop`: unlayered beats layered, then source order. */
function rootValue(css: string, prop: string): string | undefined {
  const all: { value: string; layered: boolean; order: number }[] = []
  let order = 0
  postcss.parse(css).walkRules((rule: Rule) => {
    if (!rule.selectors.includes(":root")) return
    rule.walkDecls(prop, (d: Declaration) => all.push({ value: d.value, layered: inLayer(rule), order: order++ }))
  })
  return all.sort((a, b) => Number(!a.layered) - Number(!b.layered) || a.order - b.order).at(-1)?.value
}

function utility(css: string, cls: string, prop: string): string | undefined {
  let value: string | undefined
  postcss.parse(css).walkRules((rule: Rule) => {
    if (rule.selectors.includes(`.${cls}`)) rule.walkDecls(prop, (d) => { value = d.value })
  })
  return value
}

/** Evaluates a length made of `calc(var(--x) ± n unit)`, `var(--x)` and `n unit` (rem or px, all the sinks use), in px. */
function px(css: string, value: string, env: Record<string, string> = {}): number {
  const resolved = value.replace(/var\((--[\w-]+)(?:,\s*([^)]*))?\)/g, (_m, name: string, fallback?: string) => {
    const v = env[name] ?? rootValue(css, name) ?? fallback
    if (v === undefined) throw new Error(`unresolved ${name}`)
    return `(${px(css, v, env)})`
  })
  const expr = resolved.replace(/calc/g, "").replace(/([\d.]+)rem/g, (_m, n: string) => `(${Number(n) * 16})`).replace(/px/g, "")
  if (!/^[\d.\s()+*/-]+$/.test(expr)) throw new Error(`cannot evaluate ${value}`)
  return Function(`return (${expr})`)() as number
}

describe("theme sinks (ARCH-2276)", () => {
  let out: string
  let withApg: string
  beforeAll(async () => {
    out = await build(globals)
    withApg = await build(`${globals}\n${apg}`)
  })

  test("--spacing scales with --density-factor, and is the unscaled 0.25rem without it", () => {
    const spacing = rootValue(out, "--spacing")
    expect(spacing).toBeDefined()
    expect(px(out, spacing!)).toBe(4)
    expect(px(out, spacing!, { "--density-factor": "1.25" })).toBe(5)
    expect(px(out, spacing!, { "--density-factor": "0.75" })).toBe(3)
    // the numeric utilities (p-4, gap-6, -mt-2 …) are what multiply it
    expect(utility(out, "p-4", "padding")).toBe("calc(var(--spacing) * 4)")
    expect(utility(out, "gap-6", "gap")).toBe("calc(var(--spacing) * 6)")
  })

  test("apg's generated theme does not redeclare --spacing", () => {
    expect(rootValue(withApg, "--spacing")).toBe(rootValue(out, "--spacing"))
  })

  test("--radius-* derive from --radius (apg's convention: --radius is the MEDIUM radius)", () => {
    // without a theme: sm/md/lg stay 4/6/8px; xl/2xl are 10/14px (declared change)
    const expected: Record<string, number> = { sm: 4, md: 6, lg: 8, xl: 10, "2xl": 14 }
    for (const [k, v] of Object.entries(expected)) expect(px(out, rootValue(out, `--radius-${k}`)!), k).toBe(v)
    // PR-C retarget (declared): the scale is `--theme-radius-<k>` (unlayered, derived from --radius) and `--radius-<k>` reads it
    expect(rootValue(out, "--theme-radius-md")).toBe("var(--radius)")
    expect(rootValue(out, "--radius-md")).toBe("var(--theme-radius-md)")
    // one write to --radius re-rounds the whole scale
    expect(px(out, rootValue(out, "--radius-sm")!, { "--radius": "0.25rem" })).toBe(2)
    expect(px(out, rootValue(out, "--radius-lg")!, { "--radius": "1rem" })).toBe(18)
    // PR-C retarget (declared): the utilities read `--theme-radius-<k>` and end in Tailwind's own literal (no key names itself)
    expect(utility(out, "rounded-md", "border-radius")).toBe("var(--theme-radius-md, 0.375rem)")
    expect(utility(out, "rounded-2xl", "border-radius")).toBe("var(--theme-radius-2xl, 1rem)")
  })

  // Legacy shim on an old host: no theme, only inline `--radius-<k>` / `--theme-radius-<k>` / `--theme-shadow-<k>` set on :root.
  test("inline per-key radius and shadow reach the utilities with no theme", () => {
    const chain = (name: string, env: Record<string, string>): string => {
      const v = env[name] ?? rootValue(out, name)
      if (v === undefined) throw new Error(`unresolved ${name}`)
      return v.replace(/var\((--[\w-]+)(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (_m, n: string, fb?: string) => env[n] ?? rootValue(out, n) ?? fb ?? "")
    }
    const resolveUtil = (cls: string, prop: string, env: Record<string, string>): string => {
      let v = utility(out, cls, prop)!
      for (let i = 0; i < 6 && v.includes("var("); i++) {
        v = v.replace(/var\((--[\w-]+)(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (_m, n: string, fb?: string) => env[n] ?? (rootValue(out, n) !== undefined ? chain(n, env) : (fb ?? "")))
      }
      return v
    }
    expect(resolveUtil("rounded-md", "border-radius", { "--theme-radius-md": "20px" })).toBe("20px")
    expect(resolveUtil("rounded-md", "border-radius", {})).not.toBe("20px")
    expect(resolveUtil("rounded-control", "border-radius", { "--theme-radius-control": "20px" })).toBe("20px")
    expect(resolveUtil("rounded-control", "border-radius", { "--theme-radius-lg": "20px" })).toBe("20px")
    // the shadow utilities inline the chain: the FIRST var is --theme-shadow-<k> (set inline, it wins), shadow-float falls to md
    expect(utility(out, "shadow-md", "--tw-shadow")).toStartWith("var(--theme-shadow-md, ")
    expect(utility(out, "shadow-float", "--tw-shadow")).toStartWith("var(--theme-shadow-float, var(--theme-shadow-md, ")
  })

  test("with apg's fixture (--radius: 4px) the direct readers of --radius-md and rounded-* give 4/6px", () => {
    // components read `var(--radius-md)` on :root: that is `--radius` (4px), as apg's fixture means md
    expect(rootValue(withApg, "--radius")).toBe("4px")
    expect(rootValue(withApg, "--radius-md")).toBe("var(--theme-radius-md)") // PR-C retarget (declared): --radius-md reads --theme-radius-md, which is apg's --radius (md)
    expect(rootValue(withApg, "--theme-radius-md")).toBe("var(--radius)")
    // button's `rounded-[min(var(--radius-md),10px)]` and calendar's `--cell-radius: var(--radius-md)`
    expect(Math.min(px(withApg, "var(--radius-md)"), 10)).toBe(4)
    expect(px(withApg, "var(--radius-md)")).toBe(4)
    expect(px(withApg, "var(--radius-lg)")).toBe(6)
    expect(px(withApg, "var(--radius-xl)")).toBe(8)
    expect(px(withApg, "var(--radius-2xl)")).toBe(12)
  })

  test("text-* read the --text-* scale on :root, whose defaults are Tailwind's", () => {
    expect(utility(out, "text-xs", "font-size")).toBe("var(--text-xs)")
    expect(utility(out, "text-3xl", "font-size")).toBe("var(--text-3xl)")
    const defaults: Record<string, string> = { xs: "0.75rem", sm: "0.875rem", base: "1rem", lg: "1.125rem", xl: "1.25rem", "2xl": "1.5rem", "3xl": "1.875rem" }
    for (const [k, v] of Object.entries(defaults)) expect(rootValue(out, `--text-${k}`), k).toBe(v)
  })

  test("type-* sizes read --type-<role>-size first, falling back to the scale step they used", () => {
    // PR-C retarget (declared): apg's property form, so the size also reads --type-<role>-font-size before the scale step
    expect(utility(out, "type-body", "font-size")).toBe("var(--type-body-size, var(--type-body-font-size, var(--text-base)))")
    expect(utility(out, "type-eyebrow", "font-size")).toBe("var(--type-eyebrow-size, var(--type-eyebrow-font-size, var(--text-xs)))")
  })

  test("font families resolve through the role names without a cycle", () => {
    // PR-C retarget (declared): the keys are inline in the contract (no :root --font-sans), so the utilities read the role names
    expect(utility(out, "font-sans", "font-family")).toBe("var(--font-body)")
    expect(utility(out, "font-heading", "font-family")).toBe("var(--font-display)")
    expect(utility(out, "font-mono", "font-family")).toBe("var(--font-code)")
    // the role names are plain stacks (never an alias of --font-sans/heading/mono, which would loop)
    for (const role of ["--font-body", "--font-display", "--font-code"]) expect(rootValue(out, role)).not.toContain("var(--font-")
    expect(rootValue(out, "--font-body")).toStartWith("Inter")
  })

  test("base layer: headings and pre follow the role fonts, so with apg's theme h5/h6 and pre take its display/code", () => {
    // PR-C retarget (declared): apg's base block (h1-h4, code/kbd/samp) is in the contract, h5/h6 and pre stay template-side
    expect(contract).toMatch(/h1, h2, h3, h4 \{\s*font-family: var\(--font-display\);\s*color: var\(--foreground\)/)
    expect(contract).toMatch(/code, kbd, samp \{\s*font-family: var\(--font-code\)/)
    expect(globals).toMatch(/h5, h6 \{\s*font-family: var\(--font-display\)/)
    expect(globals).toMatch(/pre \{\s*font-family: var\(--font-code\)/)
    expect(rootValue(withApg, "--font-display")).toStartWith('"Fraunces"')
    expect(rootValue(withApg, "--font-code")).toStartWith('"IBM Plex Mono"')
    expect(utility(withApg, "font-heading", "font-family")).toBe("var(--font-display)")
    expect(utility(withApg, "font-mono", "font-family")).toBe("var(--font-code)")
  })

  test("with apg's theme the role names are apg's, and the sinks stay in place", () => {
    expect(rootValue(withApg, "--font-body")).toStartWith('"Fraunces"')
    expect(utility(withApg, "font-sans", "font-family")).toBe("var(--font-body)")
  })
})

describe("archie-design-runtime writes the sink variables", () => {
  const g = globalThis as unknown as Record<string, unknown>
  const saved = { window: g.window, document: g.document, fetch: g.fetch }
  const props = new Map<string, string>()
  let apply: (cfg: Record<string, unknown>) => void
  let clear: () => void

  beforeAll(async () => {
    const root = {
      style: {
        setProperty: (k: string, v: string) => void props.set(k, v),
        removeProperty: (k: string) => void props.delete(k),
      },
      classList: { contains: () => false, add() {}, remove() {} },
      removeAttribute() {},
      setAttribute() {},
    }
    const head = { appendChild() {} }
    g.window = {}
    g.document = { documentElement: root, head, getElementById: () => null, createElement: () => ({}), querySelector: () => null }
    g.fetch = () => Promise.reject(new Error("no network in tests"))
    const mod = await import("@/lib/archie-design-runtime")
    apply = mod.applyDesignConfig as unknown as (cfg: Record<string, unknown>) => void
    clear = mod.clearLegacyWrites
  })
  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete g[k]
      else g[k] = v
    }
  })

  test("fonts: the three historical names AND the apg role names", () => {
    apply({ fontFamily: "A", headingFontFamily: "B", monoFontFamily: "C" })
    expect(Object.fromEntries(["--font-sans", "--font-heading", "--font-mono", "--font-body", "--font-display", "--font-code"].map((k) => [k, props.get(k)]))).toEqual({
      "--font-sans": "A", "--font-heading": "B", "--font-mono": "C", "--font-body": "A", "--font-display": "B", "--font-code": "C",
    })
  })

  test("density factor is clamped and removed when absent", () => {
    apply({ densityFactor: 2 })
    expect(props.get("--density-factor")).toBe("1.25")
    apply({})
    expect(props.has("--density-factor")).toBe(false)
  })

  test("type scale is written only when the theme brings one, and reverts when it goes", () => {
    apply({})
    expect([...props.keys()].filter((k) => k.startsWith("--text-") || k.startsWith("--type-"))).toEqual([])
    apply({ typeScale: { xs: "0.8rem", base: "1.05rem" }, typeRoleSizes: { body: "1.1rem" } })
    expect(props.get("--text-xs")).toBe("0.8rem")
    expect(props.get("--text-base")).toBe("1.05rem")
    expect(props.get("--type-body-size")).toBe("1.1rem")
    apply({ typeScale: { xs: "0.8rem" } })
    expect(props.has("--text-base")).toBe(false)
    expect(props.has("--type-body-size")).toBe(false)
    apply({})
    expect(props.has("--text-xs")).toBe(false)
  })

  test("type scale keys outside the whitelist are ignored", () => {
    apply({ typeScale: { xs: "1px", evil: "2px", "4xl": "3px" }, typeRoleSizes: { body: "1px", "x-y": "2px" } })
    expect(props.get("--text-xs")).toBe("1px")
    expect(props.get("--type-body-size")).toBe("1px")
    expect([...props.keys()].filter((k) => k.includes("evil") || k.includes("4xl") || k.includes("x-y"))).toEqual([])
    apply({})
  })

  test("radius: --radius and the per-key scale are written", () => {
    apply({ borderRadius: "12px", borderRadiusScale: { md: "10px" } })
    expect(props.get("--radius")).toBe("12px")
    expect(props.get("--radius-md")).toBe("10px")
  })

  test("radius/shadow: the per-key writes also set the --theme-* names the sinks read", () => {
    apply({ borderRadiusScale: { md: "20px" }, shadows: { md: "0 1px 2px red" } })
    expect(props.get("--theme-radius-md")).toBe("20px")
    expect(props.get("--theme-shadow-md")).toBe("0 1px 2px red")
    // a key that goes away takes BOTH shadow names with it
    apply({ shadows: { lg: "0 2px 4px blue" } })
    expect(props.has("--shadow-md")).toBe(false)
    expect(props.has("--theme-shadow-md")).toBe(false)
    expect(props.get("--theme-shadow-lg")).toBe("0 2px 4px blue")
    apply({})
  })

  // Latch (apply-theme-css took over): clearing leaves no inline sink behind, so the stylesheet is the only writer.
  test("clearLegacyWrites removes every sink variable applyDesignConfig wrote", () => {
    apply({ borderRadiusScale: { md: "9px" }, shadows: { md: "0 1px red" }, borderRadius: "12px", densityFactor: 1.1, shadowIntensity: "subtle", iconStrokeWidth: 2, iconSize: 20, typeScale: { xs: "1px" }, fontFamily: "A" })
    expect(props.size).toBeGreaterThan(8)
    clear()
    expect([...props.keys()]).toEqual([])
  })
})
