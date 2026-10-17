"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
} from "react-day-picker"

import { Button, buttonVariants } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon } from "lucide-react"
import { monthName } from "@/lib/format"

// The calendar never reads the clock during render. `month` (the month shown) and `today` (the day that gets the "today" style) are
// REQUIRED in the types, so the server render and the browser's first render show the same grid. Generated JSX is untyped though, so at
// runtime a missing `month` falls back, in order, to: the first selected date (single, multiple or range), `defaultMonth`, `today`,
// `startMonth`, and finally a FIXED anchor month (January 2000) that is swapped for the real current month right after hydration (useSyncExternalStore's client snapshot).
// A missing `today` is the fixed anchor on the first pass and the real date after mount.
//
// DATES ARE UTC CALENDAR DAYS. The calendar runs in UTC (`timeZone="UTC"`, overridable), like format.ts, so the grid is the same on
// every machine. A `new Date(2025, 2, 1)` is local midnight, which east of UTC is the previous UTC day, so every incoming date is
// normalized first: a Date whose LOCAL time is exactly 00:00:00.000 but whose UTC time is not is read as a local calendar date and
// becomes Date.UTC(its local year, month, day). Dates already at UTC midnight, or at any other time, are left alone. Covered props:
// `month`, `defaultMonth`, `today`, `startMonth`, `endMonth`, `selected` (single, multiple, range), `disabled`, `hidden` and `modifiers`
// (Date, Date[], and the {from,to,before,after} matcher shapes). `onSelect` hands back UTC-midnight Dates: read them with the UTC
// getters or the format.ts helpers, never with getDate()/toLocale*.
//
// The normalization runs ONLY while the effective `timeZone` is "UTC" (the default). A consumer who passes another zone gets their dates
// untouched, exactly as react-day-picker reads them in that zone.
//
// KNOWN EDGES (rare; pass calendar dates as UTC-midnight, e.g. new Date(Date.UTC(y, m, d)), or build them with the local constructor on
// BOTH the server and the client):
//   - SSR/client split: a fixed INSTANT that happens to be exactly local midnight on one side only (2025-03-11T15:00Z is midnight in Tokyo)
//     is normalized there and not on the other, so the two renders differ (hydration mismatch).
//   - DST gap at midnight: where local midnight does not exist (Cairo 2025-04-25) `new Date(y, m, d)` lands at 01:00 local. That exact
//     top-of-the-hour 01:00 whose local calendar day differs from its UTC day is normalized too, which can misread a genuine
//     instant at that wall time as a calendar date.
const ANCHOR = new Date(Date.UTC(2000, 0, 1, 12))
let clockCache: Date | null = null
const subscribeNever = () => () => {}
const noClock = (): Date | null => null
const clientClock = (): Date => (clockCache ??= new Date())

type DayPickerProps = React.ComponentProps<typeof DayPicker>

const isLocalMidnight = (d: Date): boolean => d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0
const isUtcMidnight = (d: Date): boolean => d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0
// 01:00:00.000 local on a day whose local calendar date is not its UTC date: where DST skips midnight, new Date(y, m, d) lands there.
const isDstGapMidnight = (d: Date): boolean =>
  d.getHours() === 1 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0 && d.getDate() !== d.getUTCDate()
/** A local calendar date (local midnight, not UTC midnight) as the UTC midnight of the same calendar day; anything else unchanged. */
export function normalizeCalendarDate(d: Date): Date {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return d
  return (isLocalMidnight(d) && !isUtcMidnight(d)) || isDstGapMidnight(d) ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : d
}
const DATE_KEYS = ["from", "to", "before", "after"] as const
const normalizeMatcher = (m: unknown): unknown => {
  if (m instanceof Date) return normalizeCalendarDate(m)
  if (Array.isArray(m)) return m.map(normalizeMatcher)
  if (m && typeof m === "object") {
    const out: Record<string, unknown> = { ...(m as Record<string, unknown>) }
    for (const k of DATE_KEYS) if (out[k] instanceof Date) out[k] = normalizeCalendarDate(out[k] as Date)
    return out
  }
  return m
}
const normalizeModifiers = (mods: unknown): unknown =>
  mods && typeof mods === "object" ? Object.fromEntries(Object.entries(mods).map(([k, v]) => [k, normalizeMatcher(v)])) : mods

const firstSelected = (selected: unknown): Date | undefined => {
  if (selected instanceof Date) return selected
  if (Array.isArray(selected)) return selected.find((d): d is Date => d instanceof Date)
  if (selected && typeof selected === "object") {
    const { from, to } = selected as { from?: unknown; to?: unknown }
    if (from instanceof Date) return from
    if (to instanceof Date) return to
  }
  return undefined
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  locale,
  formatters,
  components,
  month: monthProp,
  today: todayProp,
  onMonthChange,
  ...rawProps
}: DayPickerProps & {
  /** The month shown. Controlled when `onMonthChange` is also passed; otherwise the starting month, and the arrows still navigate. */
  month: Date
  /** The day styled as "today". Pass it from the same source on the server and the client (e.g. the request time). */
  today: Date
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  // Local calendar dates -> UTC calendar days (see the header), only while the calendar runs in UTC. Everything below reads the result.
  const props = { ...rawProps } as typeof rawProps & Record<string, unknown>
  if ((rawProps.timeZone ?? "UTC") === "UTC") {
    for (const k of ["defaultMonth", "startMonth", "endMonth"] as const) {
      if (props[k] instanceof Date) (props as Record<string, unknown>)[k] = normalizeCalendarDate(props[k] as Date)
    }
    for (const k of ["selected", "disabled", "hidden"] as const) {
      if (props[k] !== undefined) (props as Record<string, unknown>)[k] = normalizeMatcher(props[k])
    }
    if (props.modifiers !== undefined) (props as Record<string, unknown>).modifiers = normalizeModifiers(props.modifiers)
    monthProp = monthProp instanceof Date ? normalizeCalendarDate(monthProp) : monthProp
    todayProp = todayProp instanceof Date ? normalizeCalendarDate(todayProp) : todayProp
  }

  const derived = monthProp ?? firstSelected((props as { selected?: unknown }).selected) ?? props.defaultMonth ?? todayProp ?? props.startMonth
  // Only when something is missing do we need the real clock, and only after mount.
  // useSyncExternalStore: the server snapshot (null) is what hydration renders first, then React re-renders with the client snapshot.
  const needsClock = derived === undefined || todayProp === undefined
  const clock = React.useSyncExternalStore(subscribeNever, needsClock ? clientClock : noClock, noClock)
  const base = derived ?? clock ?? ANCHOR
  const today = todayProp ?? clock ?? ANCHOR
  // Dropdown layouts bound their year list by `today`. While `today` is the fixed anchor, bound it by the month shown instead, or the
  // first paint clamps a 2025 month into 2000.
  const anchoredToday = todayProp === undefined && clock === null
  const dropdown = String(captionLayout).startsWith("dropdown")
  const dropdownBounds =
    dropdown && anchoredToday
      ? {
          ...(props.startMonth === undefined ? { startMonth: new Date(Date.UTC(base.getUTCFullYear() - 100, 0, 1)) } : {}),
          ...(props.endMonth === undefined ? { endMonth: new Date(Date.UTC(base.getUTCFullYear(), 11, 1)) } : {}),
        }
      : {}

  // Uncontrolled navigation, remembered only while `base` is the one it was made from.
  const [nav, setNav] = React.useState<{ from: number; month: Date } | null>(null)
  const controlled = monthProp !== undefined && onMonthChange !== undefined
  const month = controlled ? monthProp : nav && nav.from === base.getTime() ? nav.month : base
  const handleMonthChange = (next: Date) => {
    if (!controlled) setNav({ from: base.getTime(), month: next })
    onMonthChange?.(next)
  }

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar bg-background p-2 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(7)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      locale={locale}
      timeZone="UTC"
      month={month}
      onMonthChange={handleMonthChange}
      today={today}
      {...dropdownBounds}
      formatters={{
        formatMonthDropdown: (date) => monthName(date.getMonth(), locale?.code),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months
        ),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative rounded-(--cell-radius)",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute inset-0 bg-popover opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "font-medium select-none",
          captionLayout === "label"
            ? "text-sm"
            : "flex items-center gap-1 rounded-(--cell-radius) text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
          defaultClassNames.caption_label
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "flex-1 rounded-(--cell-radius) text-[0.8rem] font-normal text-muted-foreground select-none",
          defaultClassNames.weekday
        ),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        week_number_header: cn(
          "w-(--cell-size) select-none",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-[0.8rem] text-muted-foreground select-none",
          defaultClassNames.week_number
        ),
        day: cn(
          "group/day relative aspect-square h-full w-full rounded-(--cell-radius) p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)",
          props.showWeekNumber
            ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)"
            : "[&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)",
          defaultClassNames.day
        ),
        range_start: cn(
          "relative isolate z-0 rounded-l-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-muted",
          defaultClassNames.range_start
        ),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn(
          "relative isolate z-0 rounded-r-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-muted",
          defaultClassNames.range_end
        ),
        today: cn(
          "rounded-(--cell-radius) bg-muted text-foreground data-[selected=true]:rounded-none",
          defaultClassNames.today
        ),
        outside: cn(
          "text-muted-foreground aria-selected:text-muted-foreground",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon className={cn("size-4", className)} {...props} />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          )
        },
        DayButton: ({ ...props }) => (
          <CalendarDayButton {...props} />
        ),
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()
  const pad = (n: number) => String(n).padStart(2, "0")

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={`${day.date.getFullYear()}-${pad(day.date.getMonth() + 1)}-${pad(day.date.getDate())}`}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 border-0 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50 data-[range-end=true]:rounded-(--cell-radius) data-[range-end=true]:rounded-r-(--cell-radius) data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-muted data-[range-middle=true]:text-foreground data-[range-start=true]:rounded-(--cell-radius) data-[range-start=true]:rounded-l-(--cell-radius) data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground dark:hover:text-foreground [&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
