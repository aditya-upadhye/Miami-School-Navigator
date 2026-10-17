import { createContext, useContext, useMemo, type ReactNode } from "react"

// The kit's chrome strings (ARCH-1972): the a11y defaults and empty states the library itself writes ("Close", "Nothing matches.",
// the board's drag announcements, ...). A page that is not in English wraps its tree in <ChromeProvider value={dictionary}>; every
// kit component then reads its default text through useChrome(). An explicit prop (label, emptyLabel, text, ...) always wins.
//
// KIT_EN is the English fallback: what useChrome() returns when there is NO provider (and for any key a provided dictionary lacks),
// so a page without a provider renders exactly what it rendered before this module existed. It is a copy of the `kit.` keys of
// CHROME.en in src/shared/chrome-i18n.ts (the kit is its own bundle and cannot import it): chrome-i18n.test.ts fails on drift.
// Values may hold {name} placeholders, filled from the second argument of t(key, vars).
export const KIT_EN: Readonly<Record<string, string>> = {
  "kit.close": "Close",
  "kit.command.title": "Command Palette",
  "kit.command.description": "Search for a command to run...",
  "kit.pagination.label": "pagination",
  "kit.pagination.previous": "Previous",
  "kit.pagination.next": "Next",
  "kit.pagination.goPrevious": "Go to previous page",
  "kit.pagination.goNext": "Go to next page",
  "kit.pagination.more": "More pages",
  "kit.carousel.previous": "Previous slide",
  "kit.carousel.next": "Next slide",
  "kit.breadcrumb.label": "breadcrumb",
  "kit.breadcrumb.more": "More",
  "kit.sidebar.toggle": "Toggle Sidebar",
  "kit.sidebar.title": "Sidebar",
  "kit.sidebar.description": "Displays the mobile sidebar.",
  "kit.spinner.loading": "Loading",
  "kit.shell.searchPlaceholder": "Search screens and records",
  "kit.shell.searchTitle": "Search",
  "kit.shell.nothingMatches": "Nothing matches.",
  "kit.shell.screens": "Screens",
  "kit.shell.helpTitle": "Help and shortcuts",
  "kit.shell.helpDescription": "Keyboard shortcuts in this prototype.",
  "kit.shell.aboutTitle": "About {name}",
  "kit.shell.notifications": "Notifications",
  "kit.shell.viewAllNotifications": "View all notifications",
  "kit.shell.shortcutSearchAlso": "⌘ K on a Mac",
  "kit.shell.shortcutSearch": "Search screens and records",
  "kit.shell.shortcutHelp": "Show the keyboard shortcuts",
  "kit.shell.shortcutClose": "Close a dialog or menu",
  "kit.shell.account": "Account menu",
  "kit.shell.myAccount": "My account",
  "kit.shell.preferences": "Preferences",
  "kit.shell.billing": "Billing",
  "kit.shell.theme": "Theme",
  "kit.shell.themeLight": "Light",
  "kit.shell.themeDark": "Dark",
  "kit.shell.themeSystem": "System",
  "kit.shell.language": "Language",
  "kit.shell.admin": "Admin",
  "kit.shell.help": "Help",
  "kit.shell.signOut": "Sign out",
  "kit.shell.legal": "Legal documents",
  "kit.board.label": "Board",
  "kit.board.empty": "Nothing here",
  "kit.board.card": "Card",
  "kit.board.cardLower": "card",
  "kit.board.moved": "{title} moved to {column}",
  "kit.board.dropped": "{title} dropped in {column}",
  "kit.board.lifted": "{title} lifted from {column}. Use Left and Right to move, Space to drop, Escape to cancel.",
  "kit.board.returned": "{title} returned to {column}",
  "kit.board.move": "Move {title}, now in {column}",
  "kit.board.overLimit": "(over the limit)",
  "kit.schedule.label": "Schedule",
  "kit.schedule.empty": "Nothing scheduled",
  "kit.schedule.month": "Month",
  "kit.schedule.week": "Week",
  "kit.schedule.day": "Day",
  "kit.schedule.agenda": "Agenda",
  "kit.schedule.previous": "Previous period",
  "kit.schedule.next": "Next period",
  "kit.schedule.today": "Today",
  "kit.schedule.view": "View",
  "kit.schedule.allDay": "All day",
  "kit.schedule.nScheduled": "{count} scheduled",
  "kit.schedule.nothingScheduled": "nothing scheduled",
  "kit.schedule.more": "+{count} more",
  "kit.stepper.label": "Progress",
  "kit.stepper.complete": "Completed",
  "kit.stepper.current": "Current step",
  "kit.stepper.upcoming": "Not started",
  "kit.stepper.blocked": "Blocked",
  "kit.timeline.label": "Timeline",
  "kit.timeline.empty": "No events",
  "kit.map.unavailable": "The map is not available right now. The places it shows:",
}

const PLACEHOLDER = /\{(\w+)\}/g

export type ChromeDictionary = Readonly<Record<string, string>>
export type ChromeVars = Readonly<Record<string, unknown>>
export type ChromeTranslator = (key: string, vars?: ChromeVars) => string

function fill(msg: string, vars?: ChromeVars): string {
  if (!vars) return msg
  return msg.replace(PLACEHOLDER, (m: string, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) && vars[name] != null ? String(vars[name]) : m,
  )
}

/** A t(key, vars) over `dict`; a key it lacks falls back to English, then to the key itself (a missing translation never throws or renders blank). */
export function makeChrome(dict: ChromeDictionary | null | undefined): ChromeTranslator {
  return (key, vars) => fill((dict && dict[key]) ?? KIT_EN[key] ?? key, vars)
}

const english = makeChrome(null)
const ChromeContext = createContext<ChromeTranslator | null>(null)

/** `value`: { [key]: string }, the dictionary of the project's language (a subset is fine: the missing keys stay English). */
export function ChromeProvider({ value, children }: { value?: ChromeDictionary | null; children?: ReactNode }) {
  const t = useMemo(() => makeChrome(value), [value])
  return <ChromeContext.Provider value={t}>{children}</ChromeContext.Provider>
}

/** The `t(key, vars)` of the nearest <ChromeProvider>, or the built-in English one when there is none. */
export function useChrome(): ChromeTranslator {
  return useContext(ChromeContext) ?? english
}
