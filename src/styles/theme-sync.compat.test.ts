import { beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { compile } from "@tailwindcss/node"
import { Evaluator, Sheet } from "./theme-eval"

// ARCH-2274/2276 PR-C: what the library components RESOLVE to must not change because the contract moved, except where this
// PR declares it. For every (row, theme) the old column (globals.css @ aed3a951 with the components' old classes) and the
// new column (this globals.css + contract, with the components' new classes) are compiled by Tailwind 4.3.3 and resolved
// through the evaluator in theme-eval.ts (cascade, layers, var() chains, calc()/min(), box-shadow + ring-1; a var() cycle throws).
// Identical unless the row is in expected.json, whose entries freeze BOTH sides.
//
// The theme halves are the theme.css of apg's compileTheme on ds-a / ds-b (regenerated with apg's T2 compiler by
// scripts/theme-invariant-fixtures.ts, see the README in __fixtures__/theme-invariant). ds-a carries the semantic sinks
// (--theme-radius-control|card|modal|badge, --theme-shadow-card) and semantic.control; ds-b carries neither (--radius 0, no control
// sizes); ds-c is ds-b plus an all-0px semantic radius and shadows.card "none" (a flat design system). apg's residue Tailwind half is not in the columns: the contract is loaded by globals, and the type-* roles that need the
// residue are covered in theme-contract.test.ts.
const STYLES = import.meta.dir
const ROOT = join(STYLES, "..", "..")
const FIX = join(STYLES, "__fixtures__", "theme-invariant")
const read = (p: string) => readFileSync(p, "utf8")

interface Row { id: string; old: string[]; new?: string[]; prop: string; note?: string }
interface Declared { old: string; new: string; reason: string }
const rows: Row[] = JSON.parse(read(join(FIX, "rows.json")))
const expected = JSON.parse(read(join(FIX, "expected.json"))) as { declared: Record<string, Record<string, Declared>> }

const THEMES: Record<string, string> = {
  none: "",
  "ds-a": read(join(FIX, "ds-a.theme.css")),
  "ds-b": read(join(FIX, "ds-b.theme.css")),
  "ds-c": read(join(FIX, "ds-c.theme.css")),
}
const candidates = [...new Set(rows.flatMap((r) => [...r.old, ...(r.new ?? [])]))]
const GLOBALS = { old: read(join(FIX, "globals.aed3a951.css")), new: read(join(STYLES, "globals.css")) }

const sheets: Record<"old" | "new", Record<string, Sheet>> = { old: {}, new: {} }
beforeAll(async () => {
  for (const col of ["old", "new"] as const)
    for (const [theme, css] of Object.entries(THEMES)) {
      const compiled = await compile(`${GLOBALS[col]}\n${css}`, { base: STYLES, onDependency() {} })
      sheets[col][theme] = new Sheet(compiled.build(candidates))
    }
})

const resolve = (col: "old" | "new", theme: string, classes: string[], prop: string) => new Evaluator(sheets[col][theme], { classes }).computed(prop)

describe("the toolchain is the pinned one", () => {
  test("tailwindcss and @tailwindcss/node are 4.3.3 (a different compiler would make the comparison meaningless)", () => {
    for (const pkg of [["tailwindcss"], ["@tailwindcss", "node"]]) {
      expect((JSON.parse(read(join(ROOT, "node_modules", ...pkg, "package.json"))) as { version: string }).version).toBe("4.3.3")
    }
  })
})

describe("theme sync: aed3a951 vs this globals + contract", () => {
  test("the table is non-trivial and every declared entry names a real row and theme", () => {
    expect(rows.length).toBeGreaterThan(40)
    for (const [id, themes] of Object.entries(expected.declared)) {
      expect(rows.some((r) => r.id === id), id).toBe(true)
      for (const t of Object.keys(themes)) expect(Object.keys(THEMES), `${id}/${t}`).toContain(t)
    }
  })

  for (const row of rows) {
    for (const theme of Object.keys(THEMES)) {
      test(`${row.id} [${theme}]`, () => {
        const before = resolve("old", theme, row.old, row.prop)
        const after = resolve("new", theme, row.new ?? row.old, row.prop)
        expect(before, "the old column resolves").toBeDefined()
        expect(after, "the new column resolves").toBeDefined()
        const declared = expected.declared[row.id]?.[theme]
        if (!declared) {
          expect(after).toBe(before)
          return
        }
        // a declared row freezes BOTH sides, and must be a real change
        expect(before).toBe(declared.old)
        expect(after).toBe(declared.new)
        expect(after).not.toBe(before)
        expect(declared.reason.length).toBeGreaterThan(10)
      })
    }
  }

  test("the components use the classes the new column assumes (and none of the old ones the rows replace)", () => {
    const ui = (f: string) => read(join(ROOT, "src", "components", "ui", f))
    const has = (f: string, ...tokens: string[]) => { for (const t of tokens) expect(ui(f), `${f} ${t}`).toContain(t) }
    const lacks = (f: string, ...tokens: string[]) => { for (const t of tokens) expect(ui(f), `${f} ${t}`).not.toMatch(new RegExp(`(?<![\\w-])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`)) }
    has("button.tsx", "rounded-control", "h-(--control-md)", "h-(--control-sm)", "h-(--control-lg)", "size-(--control-md)", "size-(--control-lg)", "size-(--control-sm)", "rounded-[min(var(--radius-md),10px)]", "rounded-[min(var(--radius-md),12px)]")
    lacks("button.tsx", "h-8", "h-7", "h-9", "size-8", "size-9")
    has("input.tsx", "h-(--control-md)", "rounded-control")
    has("card.tsx", "rounded-card", "shadow-card", "rounded-t-card", "rounded-b-card")
    lacks("card.tsx", "rounded-xl", "rounded-t-xl", "rounded-b-xl")
    has("dialog.tsx", "rounded-modal", "rounded-b-modal")
    has("alert-dialog.tsx", "rounded-modal", "rounded-b-modal")
    has("badge.tsx", "rounded-badge")
    has("checkbox.tsx", "rounded-[min(var(--radius-control),4px)]")
    for (const f of ["popover.tsx", "dropdown-menu.tsx", "select.tsx", "context-menu.tsx", "menubar.tsx", "hover-card.tsx", "combobox.tsx"]) {
      has(f, "shadow-float")
      lacks(f, "shadow-md")
    }
  })
})

describe("sinks: a theme that carries them is followed, one that does not leaves the component as it was", () => {
  test("ds-b (no sinks) keeps control / card / modal / badge radii at the scale step the component used", () => {
    const k = (cls: string, old: string) => [resolve("new", "ds-b", [cls], "border-radius"), resolve("old", "ds-b", [old], "border-radius")]
    for (const [n, o] of [["rounded-control", "rounded-lg"], ["rounded-card", "rounded-xl"], ["rounded-modal", "rounded-xl"], ["rounded-badge", "rounded-4xl"]]) {
      const [after, before] = k(n, o)
      expect(after, n).toBe(before)
    }
  })
  test("with sinks (ds-a, from apg) the semantic radius and card shadow win", () => {
    expect(resolve("new", "ds-a", ["rounded-control"], "border-radius")).toBe("8px")
    expect(resolve("new", "ds-a", ["rounded-card"], "border-radius")).toBe("16px")
    expect(resolve("new", "ds-a", ["rounded-modal"], "border-radius")).toBe("24px")
    expect(resolve("new", "ds-a", ["rounded-badge"], "border-radius")).toBe("9999px")
    expect(resolve("new", "ds-a", ["shadow-card", "ring-1", "ring-foreground/10"], "box-shadow")).toContain("0 2px 6px 0 rgba(20, 20, 20, 0.08)")
  })
  test("a flat design system (ds-c, from apg) gets square controls and no card shadow beyond the ring (none -> 0 0 #0000)", () => {
    expect(resolve("new", "ds-c", ["rounded-control"], "border-radius")).toBe("0px")
    expect(resolve("new", "ds-c", ["shadow-card", "ring-1", "ring-foreground/10"], "box-shadow")).toBe(resolve("old", "ds-c", ["ring-1", "ring-foreground/10"], "box-shadow")!)
  })
  test("a theme without a card shadow adds nothing to the ring (shadow-card falls back to 0 0 #0000, not none)", () => {
    expect(resolve("new", "ds-b", ["shadow-card", "ring-1", "ring-foreground/10"], "box-shadow")).toBe(resolve("old", "ds-b", ["ring-1", "ring-foreground/10"], "box-shadow")!)
  })
})
