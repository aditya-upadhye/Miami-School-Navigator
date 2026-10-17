import { describe, expect, test } from "bun:test"
import { initialsOf, planIdentityMenu, roleTextOf } from "./shell-identity"

const ALL = { help: true, about: true, profile: true, signOut: true }
const kinds = (rows: { kind: string }[]) => rows.map((r) => r.kind)

describe("initialsOf", () => {
  test("first letter of the first and the last word, upper-case, at most two", () => {
    expect(initialsOf("Albert Santalo")).toBe("AS")
    expect(initialsOf("  maría   del  carmen   pérez ")).toBe("MP")
    expect(initialsOf("Madonna")).toBe("M")
  })
  test("nothing when there is no name", () => {
    expect(initialsOf("")).toBe("")
    expect(initialsOf("   ")).toBe("")
    expect(initialsOf(undefined)).toBe("")
    expect(initialsOf(null)).toBe("")
  })
})

describe("roleTextOf", () => {
  test("roleLabel wins over role; either alone is used; none is empty", () => {
    expect(roleTextOf({ role: "admin", roleLabel: "Administrator" })).toBe("Administrator")
    expect(roleTextOf({ role: "admin" })).toBe("admin")
    expect(roleTextOf({ roleLabel: "Broker" })).toBe("Broker")
    expect(roleTextOf({})).toBe("")
    expect(roleTextOf(null)).toBe("")
  })
})

describe("planIdentityMenu", () => {
  const bag = { profile: { href: "/account" }, signOut: { href: "/sign-in" }, about: { name: "Hangar" }, legal: [{ label: "Privacy", href: "/privacy" }, { label: "Terms", href: "/terms" }] }

  test("the full bag: account rows, product rows, Sign out last, legal footer in the bag's order", () => {
    const p = planIdentityMenu({ actions: bag, has: ALL, darkAvailable: true })
    expect(kinds(p.account)).toEqual(["profile", "theme"])
    expect(kinds(p.product)).toEqual(["help", "about"])
    expect(p.signOut).toEqual({ kind: "signOut", href: "/sign-in" })
    expect(p.legal.map((l) => l.label)).toEqual(["Privacy", "Terms"])
  })

  test("every row is gated by what exists", () => {
    const none = planIdentityMenu({ actions: {}, has: { help: false, about: false, profile: false, signOut: false }, darkAvailable: false })
    expect(none).toEqual({ account: [], product: [], signOut: null, legal: [] })
    // a flag without data behind it draws nothing: no href, no row
    const noData = planIdentityMenu({ actions: {}, has: ALL, darkAvailable: false })
    expect(kinds(noData.account)).toEqual([])
    expect(kinds(noData.product)).toEqual(["help"])
    expect(noData.signOut).toBeNull()
    // data without its flag draws nothing either
    const noFlag = planIdentityMenu({ actions: bag, has: { help: false, about: false, profile: false, signOut: false }, darkAvailable: false })
    expect(noFlag).toEqual({ account: [], product: [], signOut: null, legal: bag.legal })
  })

  test("Theme only when the design system has a dark mode", () => {
    expect(kinds(planIdentityMenu({ actions: bag, has: ALL, darkAvailable: false }).account)).toEqual(["profile"])
    expect(kinds(planIdentityMenu({ actions: bag, has: ALL, darkAvailable: true }).account)).toContain("theme")
  })

  test("optional slots (Preferences, Billing, Language, Admin) exist only with an href, in the shell prompt's order", () => {
    const p = planIdentityMenu({
      actions: { ...bag, preferences: { href: "/prefs" }, billing: { href: "/billing", label: "Plan & billing" }, language: { href: "/lang", value: "English" }, admin: { href: "/admin" } },
      has: ALL,
      darkAvailable: true,
    })
    expect(kinds(p.account)).toEqual(["profile", "preferences", "billing", "theme", "language"])
    expect(kinds(p.product)).toEqual(["help", "admin", "about"])
    expect(p.account.find((r) => r.kind === "billing")?.label).toBe("Plan & billing")
    expect(p.account.find((r) => r.kind === "language")?.value).toBe("English")
    const empty = planIdentityMenu({ actions: { ...bag, preferences: {}, billing: { label: "x" }, language: { value: "English" }, admin: { href: " " } }, has: ALL, darkAvailable: false })
    expect(kinds(empty.account)).toEqual(["profile"])
    expect(kinds(empty.product)).toEqual(["help", "about"])
  })

  test("legal entries without a label or an href are dropped; a non-array is nothing", () => {
    const p = planIdentityMenu({ actions: { legal: [{ label: "Privacy", href: "/p" }, { label: "", href: "/x" }, { label: "Terms", href: "" }] }, has: ALL, darkAvailable: false })
    expect(p.legal).toEqual([{ label: "Privacy", href: "/p" }])
    expect(planIdentityMenu({ actions: { legal: "nope" as never }, has: ALL, darkAvailable: false }).legal).toEqual([])
  })

  test("About needs the product's name", () => {
    expect(kinds(planIdentityMenu({ actions: { about: {} }, has: ALL, darkAvailable: false }).product)).toEqual(["help"])
  })
})
