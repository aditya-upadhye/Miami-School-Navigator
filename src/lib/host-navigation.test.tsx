import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { isValidElement, type ReactElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { navigateTo, registerHostNavigate } from "@/lib/host-navigation"
import { ShellPalette } from "@/lib/shell-actions"

// The test env has no DOM: a minimal window carries the two things navigateTo reads (location.href/origin) and the one it calls (assign).
const g = globalThis as unknown as { window?: unknown }
const hadWindow = "window" in g
const savedWindow = g.window
let assigned: string[]
let navigated: string[]
let unregister: (() => void) | null

beforeEach(() => {
  assigned = []
  navigated = []
  unregister = null
  g.window = { location: { href: "https://app.example.com/orders/list?a=1", origin: "https://app.example.com", assign: (h: string) => assigned.push(h) } }
})
afterEach(() => {
  unregister?.()
  if (hadWindow) g.window = savedWindow
  else delete g.window
})
const register = () => { unregister = registerHostNavigate((h) => navigated.push(h)) }

describe("navigateTo", () => {
  test("registered navigator + same-origin path href: the navigator gets the path, assign is not called", () => {
    register()
    navigateTo("/orders/1?x=2#h")
    expect(navigated).toEqual(["/orders/1?x=2#h"])
    expect(assigned).toEqual([])
  })
  test("absolute same-origin href reaches the navigator as path + search + hash", () => {
    register()
    navigateTo("https://app.example.com/orders/1?x=2#h")
    expect(navigated).toEqual(["/orders/1?x=2#h"])
    expect(assigned).toEqual([])
  })
  test("a relative href is resolved against the current location", () => {
    register()
    navigateTo("orders/1?x=2#h")
    expect(navigated).toEqual(["/orders/orders/1?x=2#h"])
    expect(assigned).toEqual([])
  })
  test("no navigator: location.assign gets the href as given", () => {
    navigateTo("/orders/1")
    expect(assigned).toEqual(["/orders/1"])
  })
  test("cross-origin absolute href with a navigator: full load with the original href", () => {
    register()
    navigateTo("https://other.example.org/x?y=1")
    expect(assigned).toEqual(["https://other.example.org/x?y=1"])
    expect(navigated).toEqual([])
  })
  test("unregister restores the full-load fallback", () => {
    register()
    unregister?.()
    navigateTo("/a")
    expect(navigated).toEqual([])
    expect(assigned).toEqual(["/a"])
  })
  test("a stale unregister does not clear a newer registration", () => {
    const first = registerHostNavigate(() => navigated.push("first"))
    unregister = registerHostNavigate((h) => navigated.push(`second:${h}`))
    first()
    navigateTo("/a")
    expect(navigated).toEqual(["second:/a"])
    expect(assigned).toEqual([])
  })
  test("no window (SSR): a no-op", () => {
    register()
    delete g.window
    expect(() => navigateTo("/a")).not.toThrow()
    expect(navigated).toEqual([])
  })
})

// Renders ShellPalette inside a component's own render (hooks need one), keeps the element tree it returns and walks it for every onSelect.
function selectHandlers(closed: boolean[] = []): Array<() => void> {
  let tree: ReactNode = null
  const Probe = () => {
    tree = ShellPalette({ open: true, onOpenChange: (o: boolean) => { closed.push(o) }, actions: { routes: [{ href: "/orders/1?x=2", title: "Order", group: "Sales" }] } as never })
    return null
  }
  renderToStaticMarkup(<Probe />)
  const out: Array<() => void> = []
  const walk = (n: ReactNode): void => {
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (!isValidElement(n)) return
    const props = (n as ReactElement<{ onSelect?: () => void; children?: ReactNode }>).props
    if (props.onSelect) out.push(props.onSelect)
    walk(props.children)
  }
  walk(tree)
  return out
}

describe("ShellPalette selection", () => {
  test("with a registered navigator, selecting a screen navigates in-app and does not assign", () => {
    register()
    const closed: boolean[] = []
    const handlers = selectHandlers(closed)
    expect(handlers).toHaveLength(1)
    handlers[0]()
    expect(navigated).toEqual(["/orders/1?x=2"])
    expect(assigned).toEqual([])
    expect(closed).toEqual([false])
  })
  test("without a navigator, selecting a screen does a full load", () => {
    const handlers = selectHandlers()
    expect(handlers).toHaveLength(1)
    handlers[0]()
    expect(assigned).toEqual(["/orders/1?x=2"])
  })
})
