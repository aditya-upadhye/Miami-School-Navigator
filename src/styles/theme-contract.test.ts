import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import postcss, { type AtRule, type ChildNode, type Declaration, type Rule } from "postcss"
import { compile } from "@tailwindcss/node"
import { Evaluator, Sheet } from "./theme-eval"

// The theme contract (src/styles/theme-contract.css, imported by globals.css) is the template's DEFAULT for the tokens/utilities/variant the apg
// library uses. apg generates each project's theme with 02-theme.ts (unlayered `:root`/`.dark`, `@utility type-*`,
// `@custom-variant dark`), and that output must win over the defaults without !important.
//
// APPROACH: the fixtures src/styles/__fixtures__/theme-invariant/ds-a.{tailwind,theme}.css are the REAL output of apg's own
// `compileTheme()` (02-theme.ts at apg T2, via scripts/theme-invariant-fixtures.ts on ds-a.json; no LLM, no network) split into the half Tailwind
// compiles and the theme.css half (splitThemeCss). Here they are compiled together with globals.css by Tailwind v4's
// compile API, and the cascade is evaluated on the compiled CSS: unlayered beats any layer, then specificity, then source order.
const STYLES = import.meta.dir
const globals = readFileSync(join(STYLES, "globals.css"), "utf8")
const contract = readFileSync(join(STYLES, "theme-contract.css"), "utf8")
const FIX = join(STYLES, "__fixtures__", "theme-invariant")
const apg = `${readFileSync(join(FIX, "ds-a.tailwind.css"), "utf8")}\n${readFileSync(join(FIX, "ds-a.theme.css"), "utf8")}`
const IMPORTS_END = '@import "./safelist.css";'

// apg's theme loaded AFTER globals.css (the normal order) and BEFORE the contract (the adversarial order).
const apgAfter = `${globals}\n${apg}`
const apgBefore = globals.replace(IMPORTS_END, `${IMPORTS_END}\n${apg}`)

const CANDIDATES = [
  "type-caption", "type-display", "type-eyebrow", "type-mono-id", "type-row-title", "type-meta", "type-card-title", "type-body",
  "gap-(--component-gap)", "bg-status-danger", "bg-status-danger-bg", "text-status-danger-ink", "text-text-muted",
  "bg-surface-sunken", "border-border-strong", "dark:bg-card",
]

async function build(css: string, candidates: string[] = CANDIDATES): Promise<string> {
  const compiled = await compile(css, { base: STYLES, onDependency() {} })
  return compiled.build(candidates)
}

interface Decl { value: string; layered: boolean; specificity: number; order: number }

const inLayer = (node: ChildNode): boolean => {
  for (let p = node.parent; p && p.type !== "root"; p = p.parent) if (p.type === "atrule" && (p as AtRule).name === "layer") return true
  return false
}
const rootSpecificity = (sel: string): number | null => {
  const s = sel.trim()
  if (s === ":root") return 10
  if (s === ":where(:root)") return 0
  if (/^[a-z]+:root$/.test(s)) return 11 // html:root and the like
  return null
}

/** The winning declaration of `prop` on the root element (`:root`; `.dark` handled by `rootSelector`). */
function winner(css: string, prop: string, match: (sel: string) => number | null = rootSpecificity): Decl | undefined {
  const all: Decl[] = []
  let order = 0
  postcss.parse(css).walkRules((rule: Rule) => {
    if (rule.parent?.type === "atrule" && (rule.parent as AtRule).name === "media") return // viewport-conditional overrides are not the base cascade
    for (const sel of rule.selectors) {
      const spec = match(sel)
      if (spec === null) continue
      rule.walkDecls(prop, (d: Declaration) => all.push({ value: d.value, layered: inLayer(rule), specificity: spec, order: order++ }))
    }
  })
  return all.sort((a, b) => Number(!a.layered) - Number(!b.layered) || a.specificity - b.specificity || a.order - b.order).at(-1)
}

/** The last value of `prop` among the rules of the exact class selector `.name` (Tailwind emits them in source order). */
function utilityValue(css: string, cls: string, prop: string): string | undefined {
  let value: string | undefined
  postcss.parse(css).walkRules((rule: Rule) => {
    if (rule.selectors.includes(`.${cls}`)) rule.walkDecls(prop, (d) => { value = d.value })
  })
  return value
}

// Tokens apg's generated :root sets, and the template's contract also defaults.
const WON_BY_APG: Record<string, string> = {
  "--component-gap": "calc(2.5rem * var(--density-factor, 1))",
  "--section-gap": "calc(5rem * var(--density-factor, 1))",
  "--container-padding": "calc(3rem * var(--density-factor, 1))",
  "--card-padding": "calc(2rem * var(--density-factor, 1))",
  "--input-padding": "calc(1rem * var(--density-factor, 1))",
  "--font-body": '"Fraunces", ui-serif, Georgia, serif',
  "--theme-dark": "1",
  "--bottom-nav-h": "3.75rem",
}

describe("theme contract: apg's generated theme wins over the template defaults", () => {
  for (const [label, css] of [["apg theme after globals.css", apgAfter], ["apg theme BEFORE the contract", apgBefore]] as const) {
    describe(label, () => {
      test("spacing / font / mode tokens take apg's values, from an unlayered rule", async () => {
        const out = await build(css)
        for (const [prop, value] of Object.entries(WON_BY_APG)) {
          const w = winner(out, prop)
          expect(w, prop).toBeDefined()
          expect(w!.layered, `${prop} is won by a layered rule`).toBe(false)
          expect(w!.value, prop).toBe(value)
        }
      })

      test("status / text / surface colours take apg's values", async () => {
        const out = await build(css)
        for (const prop of ["--status-danger", "--status-danger-ink", "--status-danger-bg", "--status-success", "--text-muted", "--surface-sunken", "--border-strong"]) {
          const w = winner(out, prop)
          expect(w, prop).toBeDefined()
          expect(w!.layered, `${prop} is won by a layered rule`).toBe(false)
          expect(w!.value, prop).toStartWith("oklch(") // apg's colours, not the template's own layered defaults (oklch values derived via var(--…))
        }
        expect(winner(out, "--status-neutral")!.layered).toBe(false)
      })

      test(".dark: apg's values for the dark palette", async () => {
        const out = await build(css)
        const dark = winner(out, "--status-danger", (s) => (s.trim() === ".dark" ? 10 : null))
        expect(dark?.value).toStartWith("oklch(")
      })

      test("the template defaults are layered, never in the unlayered cascade", async () => {
        const out = await build(css)
        // every contract default sits inside @layer theme-defaults
        const root = postcss.parse(out)
        let found = false
        root.walkAtRules("layer", (at) => { if (at.params === "theme-defaults") found = true })
        expect(found).toBe(true)
      })
    })
  }

  // PR-C: the template used to define `@utility type-body` too with FEWER properties than apg's. The contract now owns ONE
  // rule per role over the SAME `--type-<role>-*` vars. Tailwind 4.3.3 (internal, undocumented) sorts same-named utilities
  // by its property-order index list and merges them, so apg's declarations land last and win; the template's fallbacks never
  // apply to a role apg declares. PQ-3 (ARCH-2390 precondition 10) makes apg stop emitting `@utility type-<role>` for the
  // contract's 11 roles. Roles BOTH define at e3a0b21:
  //  ds-a: eyebrow, body (+ display, which only apg has)   ds-b: caption, body
  describe("type-* roles: apg's values win without relying on source order", () => {
    const probe = async (css: string, themeFile: string, role: string, prop: string) => {
      const out = await build(`${css}\n${readFileSync(join(FIX, themeFile), "utf8")}`, [`type-${role}`])
      return new Evaluator(new Sheet(out), { classes: [`type-${role}`] }).computed(prop)
    }
    // [file, role, property, apg's value (from the fixture's --type-<role>-* vars), the template's own default for it]
    const ROWS: [string, string, string, string, string][] = [
      ["ds-a", "body", "font-family", '"Fraunces", ui-serif, Georgia, serif', "Inter"],
      ["ds-a", "body", "line-height", "24px", "1.5"],
      ["ds-a", "eyebrow", "font-size", "11px", "12px"],
      ["ds-a", "eyebrow", "letter-spacing", "0.08em", "0.1em"],
      ["ds-a", "eyebrow", "text-transform", "uppercase", "uppercase"],
      ["ds-b", "body", "font-size", "15px", "16px"],
      ["ds-b", "caption", "font-size", "12px", "12px"],
    ]
    for (const [label, mk] of [
      ["apg half AFTER the template", (ds: string) => `${globals}\n${readFileSync(join(FIX, `${ds}.tailwind.css`), "utf8")}`],
      ["apg half BEFORE the contract", (ds: string) => globals.replace(IMPORTS_END, `${IMPORTS_END}\n${readFileSync(join(FIX, `${ds}.tailwind.css`), "utf8")}`)],
    ] as const) {
      test(`${label}: every role both define reads apg's values`, async () => {
        for (const [ds, role, prop, apgValue, tplValue] of ROWS) {
          const got = await probe(mk(ds), `${ds}.theme.css`, role, prop)
          expect(got, `${ds} type-${role} ${prop}`).toStartWith(apgValue)
          if (apgValue !== tplValue) expect(got, `${ds} type-${role} ${prop} fell back to the template's`).not.toStartWith(tplValue)
        }
      })
    }

    test("the contract has exactly one @utility per type role (no duplicate names left in the template)", () => {
      const names: string[] = []
      postcss.parse(contract).walkAtRules("utility", (at) => void names.push(at.params))
      expect(new Set(names).size).toBe(names.length)
      expect(names.filter((n) => n.startsWith("type-")).sort()).toEqual(
        ["type-body", "type-caption", "type-card-title", "type-eyebrow", "type-meta", "type-metric", "type-mono-id", "type-page-title", "type-row-title", "type-section", "type-stat"],
      )
      expect(globals).not.toContain("@utility type-")
    })

    test("each role reads apg's property form, with the template's value as the fallback", () => {
      const out = postcss.parse(contract)
      const decl = (role: string, prop: string) => {
        let v: string | undefined
        out.walkAtRules("utility", (at) => { if (at.params === `type-${role}`) at.walkDecls(prop, (d) => { v = d.value }) })
        return v
      }
      expect(decl("row-title", "font-weight")).toBe("var(--type-row-title-font-weight, 500)")
      expect(decl("caption", "font-size")).toBe("var(--type-caption-size, var(--type-caption-font-size, var(--text-xs)))")
      expect(decl("eyebrow", "letter-spacing")).toBe("var(--type-eyebrow-letter-spacing, var(--tracking-widest))")
      expect(decl("mono-id", "font-family")).toBe("var(--type-mono-id-font-family, var(--font-code))")
      expect(decl("page-title", "line-height")).toBe("var(--type-page-title-line-height, var(--text-2xl--line-height))")
    })

    test("roles the apg theme does not declare fall back to the template defaults", async () => {
      const out = await build(apgAfter)
      expect(utilityValue(out, "type-row-title", "font-weight")).toBe("var(--type-row-title-font-weight, 500)")
      expect(utilityValue(out, "type-caption", "font-size")).toBe("var(--type-caption-size, var(--type-caption-font-size, var(--text-xs)))")
      expect(utilityValue(out, "type-mono-id", "font-weight")).toBe("var(--type-mono-id-font-weight, 400)")
    })
  })

  test("utilities resolve: colours go through the contract vars", async () => {
    const out = await build(apgAfter)
    expect(utilityValue(out, "bg-status-danger", "background-color")).toBe("var(--status-danger)")
    expect(utilityValue(out, "text-text-muted", "color")).toBe("var(--text-muted)")
    expect(utilityValue(out, "bg-surface-sunken", "background-color")).toBe("var(--surface-sunken)")
  })

  test("the contract never uses !important (apg must win by cascade, not by force)", () => {
    const offenders: string[] = []
    postcss.parse(contract).walkDecls((d: Declaration) => {
      if (d.important) offenders.push(d.prop)
    })
    expect(offenders).toEqual([])
  })

  test("the contract file: sentinel on line 1, no @import, no @apply", () => {
    expect(contract.split("\n")[0]).toBe("/* archie theme-contract v1 */")
    const root = postcss.parse(contract)
    const offenders: string[] = []
    root.walkAtRules((at: AtRule) => {
      if (at.name === "import" || at.name === "apply") offenders.push(`@${at.name} ${at.params}`)
    })
    expect(offenders).toEqual([])
  })

  test("globals.css imports the contract and no longer holds it", () => {
    expect(globals).toContain('@import "./theme-contract.css";')
    expect(globals).not.toContain("@layer theme-defaults")
  })

  test("@custom-variant dark: declared by both, no conflict, follows the .dark class", async () => {
    for (const css of [globals, apgAfter, apgBefore]) {
      const out = await build(css)
      expect(out).toContain(".dark")
      expect(out).not.toContain("prefers-color-scheme")
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// PR-C (ARCH-2274/2276): semantic sinks, control heights, no-self-reference keys.
const ROOT = join(STYLES, "..", "..")
const readJson = <T>(...p: string[]) => JSON.parse(readFileSync(join(ROOT, ...p), "utf8")) as T

/** every class the PR-C contract introduces (the standalone-emission test asserts each emits a declaration) */
const NEW_UTILITIES: Record<string, string> = {
  "rounded-control": "border-radius",
  "rounded-card": "border-radius",
  "rounded-modal": "border-radius",
  "rounded-badge": "border-radius",
  "rounded-[min(var(--radius-control),4px)]": "border-radius",
  "shadow-card": "--tw-shadow",
  "shadow-float": "--tw-shadow",
  "h-(--control-sm)": "height",
  "h-(--control-md)": "height",
  "h-(--control-lg)": "height",
  "size-(--control-md)": "width",
  "type-page-title": "font-size",
  "type-section": "font-size",
  "type-metric": "font-size",
  "type-stat": "font-size",
  "type-body": "font-size",
}
const STANDALONE = `@import "tailwindcss";\n@import "./theme-contract.css";`

describe("PR-C: the toolchain is the pinned one", () => {
  test("tailwindcss AND @tailwindcss/node are 4.3.3, in package.json and installed", () => {
    const pkg = readJson<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>("package.json")
    const pin = (n: string) => pkg.devDependencies?.[n] ?? pkg.dependencies?.[n]
    expect(pin("tailwindcss")).toBe("4.3.3")
    expect(readJson<{ version: string }>("node_modules", "tailwindcss", "package.json").version).toBe("4.3.3")
    // @tailwindcss/node is a dependency of @tailwindcss/vite (pinned 4.3.3); the compiler the tests call is the installed copy
    expect(readJson<{ version: string }>("node_modules", "@tailwindcss", "node", "package.json").version).toBe("4.3.3")
  })
})

describe("PR-C: no key names itself, every chain ends in a literal", () => {
  const decls: { file: string; prop: string; value: string }[] = []
  for (const [file, text] of [["theme-contract.css", contract], ["globals.css", globals]] as const)
    postcss.parse(text).walkDecls((d) => void decls.push({ file, prop: d.prop, value: d.value }))

  test("no custom property is declared with a value that reads itself (`--k: var(--k`)", () => {
    const offenders = decls.filter((d) => d.prop.startsWith("--") && new RegExp(`var\\(\\s*${d.prop}\\s*[,)]`).test(d.value)).map((d) => `${d.file}: ${d.prop}: ${d.value}`)
    expect(offenders).toEqual([])
  })

  test("every --radius-<k> key ends in a literal and reads --theme-radius-<k>", () => {
    for (const k of ["sm", "md", "lg", "xl", "2xl", "3xl", "4xl"]) {
      const d = decls.find((x) => x.file === "theme-contract.css" && x.prop === `--radius-${k}`)
      expect(d?.value, k).toMatch(new RegExp(`^var\\(--theme-radius-${k}, [\\d.]+rem\\)$`))
    }
    const get = (k: string) => decls.find((x) => x.file === "theme-contract.css" && x.prop === `--radius-${k}`)?.value
    expect(get("control")).toBe("var(--theme-radius-control, var(--theme-radius-lg, 0.5rem))")
    expect(get("card")).toBe("var(--theme-radius-card, var(--theme-radius-xl, 0.75rem))")
    expect(get("modal")).toBe("var(--theme-radius-modal, var(--theme-radius-xl, 0.75rem))")
    expect(get("badge")).toBe("var(--theme-radius-badge, var(--theme-radius-4xl, 2rem))")
  })

  test("--shadow-card falls back to `0 0 #0000` (never `none`: none would kill the ring on the same box-shadow list)", () => {
    expect(decls.find((x) => x.prop === "--shadow-card")?.value).toBe("var(--theme-shadow-card, 0 0 #0000)")
    expect(decls.find((x) => x.prop === "--shadow-float")?.value).toStartWith("var(--theme-shadow-float, var(--theme-shadow-md, ")
  })

  test("every shadow colour is wrapped in var(--tw-shadow-color, rgb(0 0 0 / calc(α * var(--shadow-strength, 1))))", () => {
    const WRAPPED = /var\(--tw-shadow-color, rgb\(0 0 0 \/ calc\([\d.]+ \* var\(--shadow-strength, 1\)\)\)\)/g
    const shadows = decls.filter((d) => d.file === "theme-contract.css" && /^--shadow-/.test(d.prop))
    expect(shadows.map((d) => d.prop)).toEqual(["--shadow-2xs", "--shadow-xs", "--shadow-sm", "--shadow-md", "--shadow-lg", "--shadow-xl", "--shadow-2xl", "--shadow-card", "--shadow-float"])
    for (const d of shadows) {
      const rest = d.value.replace(WRAPPED, "").replace("0 0 #0000", "") // `0 0 #0000` is the no-shadow value (transparent, no colour to recolour)
      expect(rest, d.prop).not.toMatch(/rgb|hsl|oklch|#[0-9a-f]+/i)
      if (d.prop !== "--shadow-card") expect(d.value, d.prop).toMatch(WRAPPED)
    }
  })

  test("the contract compiled alone resolves every sink without a cycle or an unresolved var()", async () => {
    const out = await build(STANDALONE, Object.keys(NEW_UTILITIES))
    const ev = new Evaluator(new Sheet(out))
    const names = new Set<string>()
    postcss.parse(out).walkDecls((d) => {
      if (/^--(radius|shadow|font|control|theme|type|spacing|density|container|section|component|card-padding|input-padding)/.test(d.prop) && d.parent?.type === "rule" && /(^|,\s*):root\b/.test((d.parent as Rule).selector)) names.add(d.prop)
    })
    expect(names.size).toBeGreaterThan(10)
    for (const n of names) expect(() => ev.rootVar(n), n).not.toThrow()
    // and the literals are Tailwind's own / the template's
    expect(ev.rootVar("--radius-control")).toBe("8px")
    // (`inline` keys are emitted to :root only when a var() reads them, e.g. the checkbox's min(var(--radius-control),4px))
    expect(new Evaluator(new Sheet(out), { classes: ["rounded-card"] }).computed("border-radius")).toBe("12px")
    expect(new Evaluator(new Sheet(out), { classes: ["rounded-badge"] }).computed("border-radius")).toBe("32px")
    expect(ev.rootVar("--control-md")).toBe("32px")
    expect(new Evaluator(new Sheet(out), { classes: ["shadow-card"] }).computed("--tw-shadow")).toBe("0 0 #0000")
  })
})

describe("PR-C: the contract is idempotent and self-sufficient", () => {
  test("importing the contract twice compiles to the same CSS (plain layer blocks repeat verbatim, nothing else changes)", async () => {
    const one = await build(STANDALONE, Object.keys(NEW_UTILITIES))
    const two = await build(`${STANDALONE}\n@import "./theme-contract.css";`, Object.keys(NEW_UTILITIES))
    // Tailwind dedupes @theme keys, @utility, @custom-variant; it NEVER dedupes plain rules inside `@layer` (checked on 4.3.3:
    // `@layer base{:root{..}}` twice stays twice). The contract has exactly two plain blocks (theme-defaults, base); the
    // second import repeats them byte for byte, which the cascade ignores. Everything else must be byte-identical.
    const strip = (css: string) => {
      const root = postcss.parse(css)
      const seen = new Set<string>()
      root.walkAtRules("layer", (at) => {
        if (at.parent?.type !== "root" || !at.nodes) return
        if (at.params !== "theme-defaults" && at.params !== "base") return
        const key = `${at.params}\n${at.toString()}`
        if (seen.has(key)) at.remove()
        else seen.add(key)
      })
      return root.toString()
    }
    expect(strip(two)).toBe(strip(one))
    // the only difference is those repeats: the same declarations, nothing new, nothing reordered
    const names = (css: string) => [...css.matchAll(/^\s*(--[\w-]+|[a-z-]+):/gm)].map((m) => m[1])
    expect(new Set(names(two))).toEqual(new Set(names(one)))
  })

  test("standalone (tailwindcss + the contract only): every new utility emits its declaration", async () => {
    const out = await build(STANDALONE, Object.keys(NEW_UTILITIES))
    for (const [cls, prop] of Object.entries(NEW_UTILITIES)) {
      const ev = new Evaluator(new Sheet(out), { classes: [cls] })
      expect(ev.computed(prop), `${cls} -> ${prop}`).toBeDefined()
    }
    const ev = (cls: string[]) => new Evaluator(new Sheet(out), { classes: cls })
    expect(ev(["rounded-control"]).computed("border-radius")).toBe("8px")
    expect(ev(["h-(--control-sm)"]).computed("height")).toBe("28px")
    expect(ev(["h-(--control-lg)"]).computed("height")).toBe("36px")
    expect(ev(["rounded-[min(var(--radius-control),4px)]"]).computed("border-radius")).toBe("4px")
    expect(ev(["shadow-card"]).computed("--tw-shadow")).toBe("0 0 #0000")
  })

  test("the semantic sinks follow the theme that carries them, and fall back through the scale", async () => {
    const themeA = `:root{--theme-radius-control:3px;--theme-radius-card:9px;--theme-radius-modal:11px;--theme-radius-badge:5px;--control-md:2.5rem}\n*{--theme-shadow-card:0 1px 2px 0 var(--tw-shadow-color,rgba(0,0,0,0.2));--theme-shadow-float:0 8px 8px 0 var(--tw-shadow-color,rgba(0,0,0,0.3))}`
    const out = await build(`${STANDALONE}\n${themeA}`, Object.keys(NEW_UTILITIES))
    const ev = (cls: string) => new Evaluator(new Sheet(out), { classes: [cls] })
    expect(ev("rounded-control").computed("border-radius")).toBe("3px")
    expect(ev("rounded-card").computed("border-radius")).toBe("9px")
    expect(ev("rounded-modal").computed("border-radius")).toBe("11px")
    expect(ev("rounded-badge").computed("border-radius")).toBe("5px")
    expect(ev("h-(--control-md)").computed("height")).toBe("40px")
    expect(ev("shadow-card").computed("--tw-shadow")).toBe("0 1px 2px 0 rgba(0, 0, 0, 0.2)")
    // control falls back to the lg step when the theme has no control radius
    const lgOnly = await build(`${STANDALONE}\n:root{--theme-radius-lg:7px}`, ["rounded-control", "rounded-card"])
    expect(new Evaluator(new Sheet(lgOnly), { classes: ["rounded-control"] }).computed("border-radius")).toBe("7px")
    // float falls back to the md shadow
    const mdOnly = await build(`${STANDALONE}\n*{--theme-shadow-md:0 3px 3px 0 var(--tw-shadow-color,rgba(1,2,3,0.4))}`, ["shadow-float"])
    expect(new Evaluator(new Sheet(mdOnly), { classes: ["shadow-float"] }).computed("--tw-shadow")).toBe("0 3px 3px 0 rgba(1, 2, 3, 0.4)")
  })

  test("the evaluator throws on a var() cycle (so a self-naming key can never pass silently)", async () => {
    const cyc = await build(`${STANDALONE}\n:root{--radius-control:var(--radius-control,2px)}`, ["rounded-control"])
    expect(() => new Evaluator(new Sheet(cyc)).rootVar("--radius-control")).toThrow(/cycle/)
  })
})
