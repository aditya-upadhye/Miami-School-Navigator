// Renders one tree with react-dom/server and prints the HTML. format.ssr.test.ts spawns this file in separate processes because TZ must
// be set at process start. Env: SIM_DAYS_LATER (shift the wall clock, simulating a client that renders later), DEFAULT_LOCALE,
// CASE (a name from CASES). It is not a test file: bun test does not pick it up.
import { createElement as h } from "react"
import { renderToString } from "react-dom/server"
import { Calendar } from "@/components/ui/calendar"
import {
  formatDate, formatDateTime, formatMoney, formatNumber, formatRelative, formatTime, formatWeekdayDate, formatWeekdayDateTime, setDefaultLocale,
} from "@/lib/format"

// The parent states the TZ it asked for; a child that did not get it must fail loudly rather than pass for the wrong reason.
if (process.env.EXPECT_OFFSET !== undefined && new Date(0).getTimezoneOffset() !== Number(process.env.EXPECT_OFFSET)) {
  throw new Error(`TZ=${process.env.TZ}: getTimezoneOffset(0) is ${new Date(0).getTimezoneOffset()}, expected ${process.env.EXPECT_OFFSET}`)
}

const laterMs = Number(process.env.SIM_DAYS_LATER ?? 0) * 86_400_000
if (laterMs) {
  const RealDate = Date
  const shifted = () => RealDate.now() + laterMs
  class ShiftedDate extends RealDate {
    constructor(...args: unknown[]) {
      // @ts-expect-error forwarding the variadic constructor
      super(...(args.length === 0 ? [shifted()] : args))
    }
    static now() {
      return shifted()
    }
  }
  globalThis.Date = ShiftedDate as unknown as DateConstructor
}
if (process.env.DEFAULT_LOCALE) setDefaultLocale(process.env.DEFAULT_LOCALE)

const AS_OF = "2025-03-10T15:45:00Z"
const VALUE = "2025-03-03T15:45:00Z"
const MONTH = new Date(Date.UTC(2025, 2, 1, 12))
const TODAY = new Date(Date.UTC(2025, 2, 10, 12))

function Tree({ locale }: { locale?: string }) {
  return h(
    "div",
    null,
    h("p", null, [
      formatDate(VALUE, locale), formatTime(VALUE, locale), formatDateTime(VALUE, locale), formatWeekdayDate(VALUE, locale),
      formatWeekdayDateTime(VALUE, locale), formatRelative(VALUE, AS_OF, locale), formatNumber(1234567.891, locale),
      formatMoney(-1234.5, "USD", locale), formatMoney(1234.5, "COP", locale), formatMoney(99, "EUR", locale),
    ].join(" | ")),
    h(Calendar, { mode: "single", month: MONTH, today: TODAY, selected: new Date(Date.UTC(2025, 2, 12, 12)) }),
  )
}

type Loose = React.ComponentType<Record<string, unknown>>
const CASES: Record<string, () => string> = {
  // the formatters + a Calendar given an explicit month and today; `locale` pinned in the tree
  pinned: () => renderToString(h(Tree, { locale: "es-CO" })),
  // no locale argument anywhere: follows the process default
  default: () => renderToString(h(Tree, {})),
  // an unknown but valid locale (Intl fallback) and an invalid one (English tables)
  ja: () => renderToString(h(Tree, { locale: "ja-JP" })),
  invalid: () => renderToString(h(Tree, { locale: "not a locale!!" })),
  // dates built the way app code builds them: LOCAL midnight in whatever TZ this process has
  local: () =>
    renderToString(
      h(Calendar as unknown as Loose, {
        mode: "single",
        month: new Date(2025, 2, 1),
        today: new Date(2025, 2, 10),
        selected: new Date(2025, 2, 12),
        disabled: { before: new Date(2025, 2, 5) },
      }),
    ),
  // the same local-constructor dates, but the consumer picks the calendar's zone (CAL_TZ): they must be read as that zone's days
  localInZone: () =>
    renderToString(
      h(Calendar as unknown as Loose, {
        mode: "single",
        timeZone: process.env.CAL_TZ,
        month: new Date(2025, 2, 1),
        today: new Date(2025, 2, 10),
        selected: new Date(2025, 2, 12),
        disabled: { before: new Date(2025, 2, 5) },
      }),
    ),
  // a DST gap at midnight (Cairo 2025-04-25): new Date(y, m, d) lands at 01:00 local
  cairo: () =>
    renderToString(h(Calendar as unknown as Loose, { mode: "single", month: new Date(2025, 3, 1), today: new Date(2025, 3, 25), selected: new Date(2025, 3, 25) })),
  // a real "today" inside the grid, late on the last day of the month (a local reading would move it to April in Berlin)
  todayEdge: () => renderToString(h(Calendar, { mode: "single", month: MONTH, today: new Date(Date.UTC(2025, 2, 31, 23, 30)) })),
  // dropdown caption with no `today`: the first paint must still list 2025
  dropdown: () => renderToString(h(Calendar as unknown as Loose, { mode: "single", captionLayout: "dropdown", month: new Date(Date.UTC(2025, 2, 1)) })),
  // untyped JSX: no month, a selected date
  selectedOnly: () => renderToString(h(Calendar as unknown as React.ComponentType<Record<string, unknown>>, { mode: "single", selected: new Date(Date.UTC(2031, 6, 9, 12)) })),
  // untyped JSX: nothing at all
  nothing: () => renderToString(h(Calendar as unknown as React.ComponentType<Record<string, unknown>>, {})),
}

process.stdout.write(CASES[process.env.CASE ?? "pinned"]())
