import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

// Component and lib code must reference colours through the Tailwind v4 theme tokens (`var(--color-x)`), which are
// a full colour in both worlds: (`--color-x: var(--x)` over full oklch values), the same in the template and in an apg project.
// A literal `hsl(var(--x))` is invalid in both (`hsl(oklch(…))`). Since ARCH-2055 8.7 the template stores full colours too,
// so there is no bridge left: not even globals.css wraps a token in hsl().
const SRC = join(import.meta.dir, "..")
const ROOTS = ["components", "lib"]
const CODE = /\.(tsx?|jsx?)$/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

function offenders(pattern: RegExp): string[] {
  const hits: string[] = []
  for (const root of ROOTS) {
    for (const file of walk(join(SRC, root))) {
      if (!CODE.test(file) || /\.test\.[tj]sx?$/.test(file)) continue
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (pattern.test(line)) hits.push(`${relative(SRC, file)}:${i + 1}`)
        })
    }
  }
  return hits
}

describe("colour tokens in component/lib code work under both the template and apg themes", () => {
  test("no literal hsl(var(--…)) in src/components or src/lib", () => {
    expect(offenders(/hsl\(var\(--/)).toEqual([])
  })
})
