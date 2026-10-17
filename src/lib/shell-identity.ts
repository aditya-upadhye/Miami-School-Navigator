// The identity (avatar) menu's pure rules (ARCH-3018): initials and which rows exist, in which order. No imports, no React, so a unit
// test can load them; @/lib/shell-actions draws what `planIdentityMenu` returns. Nothing here invents a row: every row is gated by data
// the shell's action bag really carries (`actions.profile.href`, `actions.legal`, ...) or by a capability (dark mode, a dialog to open).

/** The viewer. `role` and `roleLabel` are the same label under two names (apg's `persona` has both; gv2's transplant gives only `roleLabel`): `roleLabel` wins. */
export interface ShellIdentityPersona {
  name?: string
  role?: string
  roleLabel?: string
  email?: string
  /** The avatar fallback letters, when the host already computed them; otherwise derived from `name`. */
  initials?: string
}

/** A link row of the bag: `href` is required to draw it (a row with nowhere to go is a dead control). */
export interface IdentityLinkSlot { href?: string; label?: string }
/** The language row: shows the current `value` ("English") and links to where it is changed. */
export interface IdentityLanguageSlot { href?: string; value?: string; label?: string }
export interface IdentityLegalLink { label: string; href: string }

/** The slice of the shell's action bag the identity menu reads. */
export interface IdentityBag {
  about?: { name?: string }
  profile?: { href?: string }
  signOut?: { href?: string }
  /** Optional slots: drawn only when the bag carries them (nothing is invented). */
  preferences?: IdentityLinkSlot
  billing?: IdentityLinkSlot
  language?: IdentityLanguageSlot
  admin?: IdentityLinkSlot
  legal?: readonly IdentityLegalLink[]
}

export type IdentityRowKind = "profile" | "preferences" | "billing" | "theme" | "language" | "help" | "admin" | "about" | "signOut"
export interface IdentityRow { kind: IdentityRowKind; href?: string; label?: string; value?: string }

export interface IdentityMenuInput {
  actions?: IdentityBag | null
  /** `has.help` / `has.about` / `has.profile` / `has.signOut` of the shell (useShellActions) or of `hasShellActions`. */
  has: { help: boolean; about: boolean; profile: boolean; signOut: boolean }
  /** The design system has a dark mode (`useThemeMode().available`): without it there is no Theme row. */
  darkAvailable: boolean
}

export interface IdentityMenuPlan {
  /** Account rows: My account, Preferences, Billing, Theme, Language. */
  account: IdentityRow[]
  /** Product rows: Help, Admin, About. */
  product: IdentityRow[]
  /** Sign out, drawn last (alone, after a separator). */
  signOut: IdentityRow | null
  /** The footer documents, exactly `actions.legal` (entries without a label or href are dropped). */
  legal: IdentityLegalLink[]
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "")
const hrefOf = (v: { href?: string } | undefined): string => text(v?.href)

/** Up to two upper-case letters: the first letters of the first and the last word of `name` ("Albert Santalo" -> "AS", "Madonna" -> "M"); "" when there is no name. */
export function initialsOf(name: string | null | undefined): string {
  const words = text(name).split(/\s+/).filter(Boolean)
  if (!words.length) return ""
  const first = Array.from(words[0]!)[0] ?? ""
  const last = words.length > 1 ? (Array.from(words[words.length - 1]!)[0] ?? "") : ""
  return (first + last).toLocaleUpperCase()
}

/** The label under the name: `roleLabel`, else `role`; "" when there is none. */
export function roleTextOf(p: ShellIdentityPersona | null | undefined): string {
  return text(p?.roleLabel) || text(p?.role)
}

/** Which rows the menu draws, in order. Pure: same input, same plan. */
export function planIdentityMenu({ actions, has, darkAvailable }: IdentityMenuInput): IdentityMenuPlan {
  const a: IdentityBag = actions ?? {}
  const account: IdentityRow[] = []
  if (has.profile && hrefOf(a.profile)) account.push({ kind: "profile", href: hrefOf(a.profile) })
  // The order is the shell prompt's (profile, preferences, billing): profile-class rows first, so gate 08x (PRO.3) never sees them go backwards.
  if (hrefOf(a.preferences)) account.push({ kind: "preferences", href: hrefOf(a.preferences), label: text(a.preferences?.label) })
  if (hrefOf(a.billing)) account.push({ kind: "billing", href: hrefOf(a.billing), label: text(a.billing?.label) })
  if (darkAvailable) account.push({ kind: "theme" })
  if (hrefOf(a.language)) account.push({ kind: "language", href: hrefOf(a.language), label: text(a.language?.label), value: text(a.language?.value) })
  const product: IdentityRow[] = []
  if (has.help) product.push({ kind: "help" })
  if (hrefOf(a.admin)) product.push({ kind: "admin", href: hrefOf(a.admin), label: text(a.admin?.label) })
  if (has.about && text(a.about?.name)) product.push({ kind: "about", label: text(a.about?.name) })
  const signOut: IdentityRow | null = has.signOut && hrefOf(a.signOut) ? { kind: "signOut", href: hrefOf(a.signOut) } : null
  const legal = (Array.isArray(a.legal) ? a.legal : []).filter((l) => text(l?.label) && text(l?.href)).map((l) => ({ label: text(l.label), href: text(l.href) }))
  return { account, product, signOut, legal }
}
