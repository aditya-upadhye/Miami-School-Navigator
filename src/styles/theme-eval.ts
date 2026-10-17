import postcss, { type AtRule, type ChildNode, type Rule } from "postcss"

// A small CSS cascade + var() evaluator for the theme tests (ARCH-2274/2276). It resolves what a browser would compute for
// a probe element from COMPILED css (Tailwind's output plus a theme half):
//  - custom properties inherit; a value is substituted where it is DECLARED (so `--tw-shadow-color` inside a `*` rule is
//    read on the element, but inside a `:root` rule it is read at the root);
//  - cascade: unlayered beats any layer, later layers beat earlier ones, then specificity, then source order;
//  - var() with nested fallbacks and the empty fallback, @property initial-values, `calc()`/`min()`/`max()` over px/rem;
//  - a var() CYCLE THROWS (a browser makes the property invalid; a test must fail loudly instead of comparing garbage);
//  - an unresolvable var() without a fallback THROWS.
// Scopes understood: `*`, `:root`, `:where(:root)`, `.dark` (on the root), `[data-surface="x"]` (on the root), `.utility`
// (on the probe element), `@media (min-width: …)`, `@layer`, `@supports` (taken as true).

export interface Probe {
  /** utility class names on the probe element (selectors are matched after CSS-unescaping) */
  classes?: string[]
  /** `.dark` on the root element */
  dark?: boolean
  /** `data-surface` on the root element */
  surface?: string
  /** viewport width in px, for `@media (min-width)` */
  viewport?: number
  /** inline style on the root element (the runtime's writes) */
  inline?: Record<string, string>
}

interface Decl {
  sel: string
  prop: string
  value: string
  layer: number
  spec: number
  order: number
}

const UNLAYERED = 1_000_000

export function unescapeCss(s: string): string {
  return s.replace(/\\([0-9a-fA-F]{1,6}\s?|.)/g, (_m, g: string) => (/^[0-9a-fA-F]{1,6}\s?$/.test(g) && g.length > 1 ? String.fromCodePoint(parseInt(g, 16)) : g))
}

function mediaMin(params: string): number | null {
  const m = /\(\s*min-width:\s*([\d.]+)(rem|px)\s*\)/.exec(params)
  if (!m) return null
  return Number(m[1]) * (m[2] === "rem" ? 16 : 1)
}

export class Sheet {
  readonly decls: Decl[] = []
  readonly initial = new Map<string, string>()
  private layers = new Map<string, number>()
  private order = 0

  constructor(css: string, private viewport = 1280) {
    this.walk(postcss.parse(css).nodes, "", true)
  }

  private layerRank(name: string): number {
    if (!this.layers.has(name)) this.layers.set(name, this.layers.size)
    return this.layers.get(name)!
  }

  private walk(nodes: ChildNode[], layer: string, on: boolean): void {
    for (const node of nodes) {
      if (node.type === "atrule") {
        const at = node as AtRule
        if (at.name === "layer") {
          if (!at.nodes) {
            for (const n of at.params.split(",")) this.layerRank(layer ? `${layer}.${n.trim()}` : n.trim())
          } else {
            const full = layer ? `${layer}.${at.params.trim()}` : at.params.trim()
            this.layerRank(full)
            this.walk(at.nodes, full, on)
          }
        } else if (at.name === "media") {
          const min = mediaMin(at.params)
          this.walk(at.nodes ?? [], layer, on && (min === null ? false : this.viewport >= min))
        } else if (at.name === "supports") {
          this.walk(at.nodes ?? [], layer, on)
        } else if (at.name === "property") {
          const name = at.params.trim()
          at.walkDecls("initial-value", (d) => void this.initial.set(name, d.value))
        }
      } else if (node.type === "rule" && on) {
        const rule = node as Rule
        for (const sel of rule.selectors) {
          rule.each((child) => {
            if (child.type === "decl") this.decls.push({ sel: sel.trim(), prop: child.prop, value: child.value, layer: layer ? this.layerRank(layer) : UNLAYERED, spec: 0, order: this.order++ })
          })
        }
      }
    }
  }
}

type El = "root" | "child"

/** Does the (single) selector match the element? Returns its specificity or null. */
function matches(sel: string, el: El, probe: Probe): number | null {
  if (sel === "*") return 0
  if (sel === ":where(:root)") return el === "root" ? 0 : null
  if (sel === ":root") return el === "root" ? 10 : null
  if (sel === ".dark") return el === "root" && probe.dark ? 10 : null
  const surf = /^\[data-surface=["']?([\w-]+)["']?\]$/.exec(sel)
  if (surf) return el === "root" && probe.surface === surf[1] ? 10 : null
  if (/^\.[^\s:>+~[,]/.test(sel) && !/[\s>+~]/.test(sel.replace(/\\./g, ""))) {
    // a single class selector (escaped characters allowed)
    return el === "child" && (probe.classes ?? []).includes(unescapeCss(sel.slice(1))) ? 10 : null
  }
  return null
}

const NONE = Symbol("guaranteed-invalid")

export class Evaluator {
  constructor(private sheet: Sheet, private probe: Probe = {}) {}

  private winner(prop: string, el: El): string | typeof NONE {
    if (el === "root" && this.probe.inline && prop in this.probe.inline) return this.probe.inline[prop]
    let best: (Decl & { spec: number }) | null = null
    for (const d of this.sheet.decls) {
      if (d.prop !== prop) continue
      const spec = matches(d.sel, el, this.probe)
      if (spec === null) continue
      const cand = { ...d, spec }
      if (!best || cand.layer > best.layer || (cand.layer === best.layer && (cand.spec > best.spec || (cand.spec === best.spec && cand.order > best.order)))) best = cand
    }
    return best ? best.value : NONE
  }

  /** computed value of a custom property on the element (already substituted), or NONE */
  private custom(name: string, el: El, stack: string[]): string | typeof NONE {
    const key = `${el}:${name}`
    if (stack.includes(key)) throw new Error(`var() cycle: ${[...stack, key].join(" -> ")}`)
    const own = this.winner(name, el)
    // `--x: initial` is the guaranteed-invalid value (Tailwind's `properties` layer sets its --tw-* that way); it also stops inheritance
    if (own !== NONE) return own.trim() === "initial" ? (this.sheet.initial.get(name) ?? NONE) : this.subst(own, el, [...stack, key])
    if (el === "child") return this.custom(name, "root", stack)
    return this.sheet.initial.get(name) ?? NONE
  }

  subst(value: string, el: El, stack: string[]): string {
    let out = ""
    let i = 0
    while (i < value.length) {
      const j = value.indexOf("var(", i)
      if (j < 0 || (j > 0 && /[\w-]/.test(value[j - 1]))) {
        if (j < 0) {
          out += value.slice(i)
          break
        }
        out += value.slice(i, j + 4)
        i = j + 4
        continue
      }
      out += value.slice(i, j)
      let depth = 0
      let k = j + 3
      let comma = -1
      for (; k < value.length; k++) {
        const c = value[k]
        if (c === "(") depth++
        else if (c === ")") {
          depth--
          if (depth === 0) break
        } else if (c === "," && depth === 1 && comma < 0) comma = k
      }
      if (depth !== 0) throw new Error(`unbalanced var() in ${value}`)
      const name = value.slice(j + 4, comma < 0 ? k : comma).trim()
      const fallback = comma < 0 ? undefined : value.slice(comma + 1, k)
      const v = this.custom(name, el, stack)
      if (v !== NONE) out += v
      else if (fallback !== undefined) out += this.subst(fallback, el, stack)
      else throw new Error(`unresolved ${name} (no declaration, no initial value, no fallback) in ${value}`)
      i = k + 1
    }
    return out
  }

  /** the computed value of `prop` on the probe element, vars substituted and math reduced; undefined if nothing sets it */
  computed(prop: string): string | undefined {
    const v = prop.startsWith("--") ? this.custom(prop, "child", []) : this.winner(prop, "child")
    if (v === NONE) return undefined
    return simplify(prop.startsWith("--") ? (v as string) : this.subst(v as string, "child", [`child:${prop}`]))
  }

  /** the computed value of a custom property on the ROOT element */
  rootVar(name: string): string | undefined {
    const v = this.custom(name, "root", [])
    return v === NONE ? undefined : simplify(v)
  }
}

// ---------------------------------------------------------------------------------------------------- math reduction
interface Num {
  n: number
  unit: "px" | ""
}

function parseMath(expr: string): Num | null {
  const tokens = expr.match(/[\d.]+(?:rem|px)?|[+*/()-]|\S+/g) ?? []
  let pos = 0
  const peek = () => tokens[pos]
  function atom(): Num | null {
    const t = tokens[pos++]
    if (t === undefined) return null
    if (t === "(") {
      const v = sum()
      if (tokens[pos++] !== ")") return null
      return v
    }
    if (t === "-") {
      const v = atom()
      return v && { n: -v.n, unit: v.unit }
    }
    const m = /^([\d.]+)(rem|px)?$/.exec(t)
    if (!m) return null
    return m[2] === "rem" ? { n: Number(m[1]) * 16, unit: "px" } : m[2] === "px" ? { n: Number(m[1]), unit: "px" } : { n: Number(m[1]), unit: "" }
  }
  function product(): Num | null {
    let l = atom()
    while (l && (peek() === "*" || peek() === "/")) {
      const op = tokens[pos++]
      const r = atom()
      if (!r) return null
      if (op === "*") {
        if (l.unit && r.unit) return null
        l = { n: l.n * r.n, unit: l.unit || r.unit }
      } else {
        if (r.unit) return null
        l = { n: l.n / r.n, unit: l.unit }
      }
    }
    return l
  }
  function sum(): Num | null {
    let l = product()
    while (l && (peek() === "+" || peek() === "-")) {
      const op = tokens[pos++]
      const r = product()
      if (!r || r.unit !== l.unit) return null
      l = { n: op === "+" ? l.n + r.n : l.n - r.n, unit: l.unit }
    }
    return l
  }
  const v = sum()
  return pos === tokens.length ? v : null
}

const fmt = (x: Num) => `${Math.round(x.n * 10000) / 10000}${x.unit}`

function splitTop(s: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ""
  for (const c of s) {
    if (c === "(") depth++
    if (c === ")") depth--
    if (c === "," && depth === 0) {
      parts.push(cur)
      cur = ""
    } else cur += c
  }
  parts.push(cur)
  return parts
}

/** Reduces calc()/min()/max()/bare groups over px & rem lengths and numbers, then normalises whitespace. Anything else is left as is. */
export function simplify(value: string): string {
  let s = value.replace(/\s+/g, " ").trim()
  const HIDE_OPEN = "\u0001"
  const HIDE_CLOSE = "\u0002"
  const re = /(\bcalc|\bmin|\bmax|(?<![\w-]))\(([^()]*)\)/
  for (let guard = 0; guard < 500; guard++) {
    const m = re.exec(s)
    if (!m) break
    const [whole, fn, inner] = m
    let replaced: string | null = null
    if (fn === "" || fn === "calc") {
      const v = parseMath(inner)
      if (v) replaced = fmt(v)
    } else {
      const vals = splitTop(inner).map(parseMath)
      if (vals.every((v): v is Num => v !== null) && new Set(vals.map((v) => v.unit)).size === 1) {
        replaced = fmt({ n: (fn === "min" ? Math.min : Math.max)(...vals.map((v) => v.n)), unit: vals[0].unit })
      }
    }
    s = s.slice(0, m.index) + (replaced ?? `${fn}${HIDE_OPEN}${inner}${HIDE_CLOSE}`) + s.slice(m.index + whole.length)
  }
  s = s.replace(/(?<![\w.-])(-?[\d.]+)rem\b/g, (_m, n: string) => `${Math.round(Number(n) * 16 * 10000) / 10000}px`) // rem -> px, so 0.5rem equals 8px
  return s.replace(new RegExp(HIDE_OPEN, "g"), "(").replace(new RegExp(HIDE_CLOSE, "g"), ")").replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").trim()
}
