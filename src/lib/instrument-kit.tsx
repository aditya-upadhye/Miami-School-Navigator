import type { ComponentPropsWithoutRef } from "react"
import { formatDate, formatDateLong, formatHour, formatMonthDay, formatMonthYear, formatTime, formatWeekdayDate, formatYear, monthName, weekdayName } from "@/lib/format"

// Shared by the instrument primitives (schedule, board, timeline, stepper). Not an
// entry of its own: the library build code-splits it into a chunk.
//
// Every date is read and formatted in UTC so the server render and the browser
// render agree byte for byte (no local time zone, no "now" read during render).

/** A field name ("startsAt"), a dotted path ("slot.startsAt") or a function of the row. */
export type Accessor<Row = unknown, Value = unknown> = string | ((row: Row) => Value) | null | undefined

export function get<Row = unknown>(row: Row, accessor: Accessor<Row>): unknown {
  if (typeof accessor === "function") return accessor(row)
  if (!accessor || row == null) return undefined
  return String(accessor)
    .split(".")
    .reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), row)
}

// ISO strings without an offset are read as UTC, date-only strings as midnight UTC.
export function toDate(v: unknown): Date | null {
  if (v == null || v === "") return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  if (typeof v === "number") return new Date(v)
  let s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00Z"
  else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = s.replace(" ", "T") + "Z"
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}
export const isDateOnly = (v: unknown): boolean => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())

export const DAY = 86400000
export const dayKey = (d: Date): string => d.toISOString().slice(0, 10)
export const startOfDay = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
export const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY)
export const startOfWeek = (d: Date, weekStartsOn = 0): Date => {
  const s = startOfDay(d)
  return addDays(s, -((s.getUTCDay() - weekStartsOn + 7) % 7))
}
export const startOfMonth = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
export const addMonths = (d: Date, n: number): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
export const startOfYear = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
export const hoursOf = (d: Date): number => d.getUTCHours() + d.getUTCMinutes() / 60

// Every date label comes from lib/format's built-in tables and default locale (setDefaultLocale), so a schedule or timeline reads in ONE
// language and the AM/PM spacing never drifts with ICU. `.format(undefined)` is an em dash, never "now".
type Fmt = { format: (d?: Date) => string }
const custom = (f: (d: Date) => string): Fmt => ({ format: (d) => (d ? f(d) : "—") })
export const F = {
  monthYear: custom((d) => formatMonthYear(d, undefined, "long")),
  monthShortYear: custom((d) => formatMonthYear(d, undefined, "short")),
  monthShort: custom((d) => monthName(d.getUTCMonth())),
  year: custom((d) => formatYear(d)),
  weekday: custom((d) => weekdayName(d.getUTCDay())),
  weekdayNarrow: custom((d) => weekdayName(d.getUTCDay(), undefined, "narrow")),
  day: custom((d) => formatWeekdayDate(d)),
  dayLong: custom((d) => formatDateLong(d)),
  date: custom((d) => formatDate(d)),
  dateShort: custom((d) => formatMonthDay(d)),
  time: custom((d) => formatTime(d)),
  hour: custom((d) => formatHour(d)),
}

export interface ToneClasses {
  dot: string
  soft: string
  edge: string
  ink: string
}
export type ToneName = "success" | "warning" | "danger" | "info" | "pending" | "neutral" | "chart-1" | "chart-2" | "primary"

// A tone is a status token name (success, warning, danger, info, pending, neutral:
// what `statusMap.<Enum>[value].tone` holds), a chart series (chart-1, chart-2) or
// primary. Class strings are literal so Tailwind generates them.
export const TONE: Record<ToneName, ToneClasses> = {
  success: { dot: "bg-status-success", soft: "bg-status-success-bg text-status-success-ink", edge: "border-status-success", ink: "text-status-success-ink" },
  warning: { dot: "bg-status-warning", soft: "bg-status-warning-bg text-status-warning-ink", edge: "border-status-warning", ink: "text-status-warning-ink" },
  danger: { dot: "bg-status-danger", soft: "bg-status-danger-bg text-status-danger-ink", edge: "border-status-danger", ink: "text-status-danger-ink" },
  info: { dot: "bg-status-info", soft: "bg-status-info-bg text-status-info-ink", edge: "border-status-info", ink: "text-status-info-ink" },
  pending: { dot: "bg-status-pending", soft: "bg-status-pending-bg text-status-pending-ink", edge: "border-status-pending", ink: "text-status-pending-ink" },
  neutral: { dot: "bg-status-neutral", soft: "bg-status-neutral-bg text-status-neutral-ink", edge: "border-status-neutral", ink: "text-status-neutral-ink" },
  "chart-1": { dot: "bg-chart-1", soft: "bg-surface-sunken text-foreground", edge: "border-chart-1", ink: "text-foreground" },
  "chart-2": { dot: "bg-chart-2", soft: "bg-surface-sunken text-foreground", edge: "border-chart-2", ink: "text-foreground" },
  primary: { dot: "bg-primary", soft: "bg-muted text-foreground", edge: "border-primary", ink: "text-foreground" },
}
export const toneOf = (t: unknown): ToneClasses => (typeof t === "string" && Object.prototype.hasOwnProperty.call(TONE, t) ? TONE[t as ToneName] : TONE.primary)

// The element an item renders as: a link when it has an href, a button when the
// instrument is selectable, otherwise a plain box.
export function itemTag(href: string | null | undefined, onSelect: unknown): "a" | "button" | "div" {
  return href ? "a" : onSelect ? "button" : "div"
}
export interface ItemProps {
  href?: string
  type?: "button"
  onClick?: () => void
}
export function itemProps<Row>(href: string | null | undefined, onSelect: ((row: Row) => void) | null | undefined, row: Row): ItemProps {
  if (href) return { href }
  if (onSelect) return { type: "button", onClick: () => onSelect(row) }
  return {}
}

/** Renders `children` as the element `itemTag` picks (link / button / box), carrying the props `itemProps` builds. */
export function ItemBox<Row>({ href, onSelect, row, children, ...rest }: Omit<ComponentPropsWithoutRef<"div">, "onSelect"> & { href?: string | null; onSelect?: ((row: Row) => void) | null; row: Row }) {
  const tag = itemTag(href, onSelect)
  const props = itemProps(href, onSelect, row)
  if (tag === "a") return <a href={props.href} {...(rest as ComponentPropsWithoutRef<"a">)}>{children}</a>
  if (tag === "button") return <button type="button" onClick={props.onClick} {...(rest as ComponentPropsWithoutRef<"button">)}>{children}</button>
  return <div {...rest}>{children}</div>
}

export function ChevronIcon({ dir = "right", className }: { dir?: "left" | "right"; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"} />
    </svg>
  )
}
export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  )
}
