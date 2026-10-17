// Drives <ShellIdentityMenu> in a real DOM (happy-dom) and prints what it observed as JSON. shell-identity-menu.dom.test.tsx spawns this file in its own
// process: the DOM globals must exist BEFORE Radix is first imported (it decides at load whether layout effects and portals exist), and the other tests of the
// template run without one. It is not a test file: bun test does not pick it up.
import { Window } from "happy-dom"

const win = new Window({ url: "https://app.example.com/" })
const w = win as unknown as Record<string, unknown>
const g = globalThis as unknown as Record<string, unknown>
for (const k of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent", "PointerEvent", "FocusEvent", "CustomEvent", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment", "HTMLButtonElement", "HTMLAnchorElement", "SVGElement", "ShadowRoot", "CSSStyleDeclaration", "NodeFilter", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "HTMLDivElement", "HTMLSpanElement", "HTMLIFrameElement", "DOMRect"]) if (k in w) g[k] = w[k]
g.IS_REACT_ACT_ENVIRONMENT = true
g.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }

const { act, createElement: h } = await import("react")
const { createRoot } = await import("react-dom/client")
const { ShellIdentityMenu } = await import("@/lib/shell-actions")

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))
const press = (el: Element, key: string) => el.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true }) as unknown as Event)
const out: Record<string, unknown> = {}

const host = document.createElement("div")
document.body.appendChild(host)
const actions = { about: { name: "Hangar 2", description: "Charter desk" }, signOut: { href: "/sign-in" }, language: { href: "/lang", value: "English" } }
const root = createRoot(host)
await act(async () => { root.render(h(ShellIdentityMenu, { persona: { name: "Albert Santalo" }, actions })) })
const trigger = document.querySelector<HTMLButtonElement>('[data-slot="identity-menu-trigger"]')!

await act(async () => { press(trigger, "Enter"); await tick(30) })
out.menuOpen = trigger.getAttribute("aria-expanded") === "true"
const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
const language = items.find((e) => e.getAttribute("href") === "/lang")
out.languageName = language?.getAttribute("aria-label") ?? null
out.languageValueHidden = language?.querySelector("[aria-hidden='true']:not(svg)")?.textContent ?? null
const about = items.find((e) => /About Hangar 2/.test(e.textContent ?? ""))
await act(async () => { about?.click(); await tick(60) })
const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
out.menuClosed = trigger.getAttribute("aria-expanded") === "false"
out.dialogOpen = !!dialog
out.dialogText = dialog?.textContent ?? ""
out.focusInDialog = !!dialog && dialog.contains(document.activeElement)

await act(async () => { if (dialog) press(dialog, "Escape"); await tick(20) })
await act(async () => { await tick(60) }) // the close commits when the first act scope ends; Radix hands the focus back a tick later
out.dialogClosed = document.querySelector('[role="dialog"]') === null
out.bodyPointerEvents = document.body.style.pointerEvents
out.focusOnTrigger = document.activeElement === trigger

console.log("RESULT " + JSON.stringify(out))
process.exit(0)
