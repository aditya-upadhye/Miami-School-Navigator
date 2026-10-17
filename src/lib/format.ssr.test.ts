import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  formatDate, formatDateTime, formatMoney, formatNumber, formatRelative, formatTime, formatWeekdayDate, formatWeekdayDateTime,
  formatHour, getDefaultLocale, monthName, setDefaultLocale, weekdayName,
} from "@/lib/format"

import { F } from "@/lib/instrument-kit"

const NBSP = "\u00A0"
const D = "2025-03-03T15:45:00Z" // a Monday

// ---- Cross-process SSR: same tree, different TZ and default locale, a client 3 days later ------------------------------------------

const FIXTURE = join(import.meta.dir, "format.ssr.fixture.tsx")
function render(kase: string, env: Record<string, string>): string {
  const p = Bun.spawnSync([process.execPath, FIXTURE], {
    env: { ...process.env, CASE: kase, ...env },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (p.exitCode !== 0) throw new Error(`fixture ${kase} failed: ${p.stderr.toString()}`)
  return p.stdout.toString()
}
// EXPECT_OFFSET is getTimezoneOffset() at the epoch: the child aborts if it did not really get the TZ.
const SERVER = { TZ: "UTC", EXPECT_OFFSET: "0" }
const CLIENT = { TZ: "America/Bogota", EXPECT_OFFSET: "300", DEFAULT_LOCALE: "es-CO", SIM_DAYS_LATER: "3" }
// Same default on both sides, only TZ and the clock differ.
const CLIENT_SAME_LOCALE = { TZ: "America/Bogota", EXPECT_OFFSET: "300", SIM_DAYS_LATER: "3" }
const BERLIN = { TZ: "Europe/Berlin", EXPECT_OFFSET: "-60" }
const cell = (html: string, iso: string): string => new RegExp(`<td[^>]*data-day="${iso}"[^>]*>`).exec(html)?.[0] ?? ""
const text = (html: string): string => html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|")

describe("Calendar with LOCAL-midnight dates (new Date(y, m, d)) in a UTC calendar", () => {
  const utc = () => render("local", SERVER)
  for (const [name, env] of [["Europe/Berlin", BERLIN], ["America/Bogota", { TZ: "America/Bogota", EXPECT_OFFSET: "300" }]] as const) {
    test(`${name}: month, selected, today and disabled land on the same calendar days as in UTC`, () => {
      const html = render("local", env)
      expect(html).toContain("March 2025")
      expect(cell(html, "2025-03-12")).toContain('data-selected="true"')
      expect(cell(html, "2025-03-10")).toContain('data-today="true"')
      expect(cell(html, "2025-03-04")).toContain('data-disabled="true"')
      expect(cell(html, "2025-03-05")).not.toContain("data-disabled")
      expect(html).toBe(utc())
    })
  }
})

describe("Calendar timeZone", () => {
  const BOGOTA = { TZ: "America/Bogota", EXPECT_OFFSET: "300" }
  test("a consumer-supplied non-UTC zone gets the raw dates: Bogota process + timeZone=America/Bogota renders March", () => {
    const html = render("localInZone", { ...BOGOTA, CAL_TZ: "America/Bogota" })
    expect(html).toContain("March 2025")
    expect(cell(html, "2025-03-12")).toContain('data-selected="true"')
    expect(cell(html, "2025-03-10")).toContain('data-today="true"')
    expect(cell(html, "2025-03-04")).toContain('data-disabled="true"')
  })
  test("Berlin process + timeZone=Europe/Berlin renders March too", () => {
    const html = render("localInZone", { ...BERLIN, CAL_TZ: "Europe/Berlin" })
    expect(html).toContain("March 2025")
    expect(cell(html, "2025-03-12")).toContain('data-selected="true"')
  })
  test("DST gap at local midnight (Cairo 2025-04-25 is 01:00 local) is still the 25th", () => {
    const html = render("cairo", { TZ: "Africa/Cairo", EXPECT_OFFSET: "-120" })
    expect(html).toContain("April 2025")
    expect(cell(html, "2025-04-25")).toContain('data-selected="true"')
    expect(cell(html, "2025-04-25")).toContain('data-today="true"')
    expect(html).toBe(render("cairo", SERVER))
  })
})

describe("SSR: server (TZ=UTC) vs client (TZ=America/Bogota, es-CO default, 3 days later)", () => {
  test("formatters + Calendar with an explicit month/today and a pinned locale render identical HTML", () => {
    const server = render("pinned", SERVER)
    const client = render("pinned", CLIENT)
    expect(client).toBe(server)
    expect(text(server)).toContain("3 mar 2025 | 15:45 | 3 mar 2025, 15:45 | lun, 3 mar | lun, 3 mar, 15:45 | hace 7 días | 1.234.567,891 | -US$" + NBSP + "1.234,50")
    expect(server).toContain("March 2025")
    // the real `today` is inside the grid: the modifier lands on the same cell in both processes
    expect(cell(server, "2025-03-10")).toContain('data-today="true"')
    expect(cell(client, "2025-03-10")).toContain('data-today="true"')
    expect(cell(server, "2025-03-12")).toContain('data-selected="true"')
  })
  test("a today at 23:30 UTC on the last day of the month stays on that day in Berlin and Bogota", () => {
    const server = render("todayEdge", SERVER)
    expect(cell(server, "2025-03-31")).toContain('data-today="true"')
    expect(render("todayEdge", BERLIN)).toBe(server)
    expect(render("todayEdge", CLIENT)).toBe(server)
  })
  test("dropdown caption without `today`: the first paint lists the year of the month shown, not the 2000 anchor", () => {
    const html = render("dropdown", SERVER)
    expect(html).toContain('<option value="2025"')
    expect(html).toMatch(/<option value="2"[^>]*selected|value="2"[^>]*>March/)
    expect(render("dropdown", CLIENT_SAME_LOCALE)).toBe(html)
  })
  test("with no locale argument the output follows the default, and only the default", () => {
    expect(text(render("default", SERVER))).toContain("Mar 3, 2025 | 3:45 PM | Mar 3, 2025, 3:45 PM | Mon, Mar 3 | Mon, Mar 3, 3:45 PM | 7 days ago | 1,234,567.891 | -$1,234.50")
    expect(text(render("default", CLIENT))).toContain("3 mar 2025 | 15:45 | 3 mar 2025, 15:45 | lun, 3 mar | lun, 3 mar, 15:45 | hace 7 días | 1.234.567,891 | -US$" + NBSP + "1.234,50")
    expect(render("default", CLIENT_SAME_LOCALE)).toBe(render("default", SERVER))
  })
  test("an unknown but valid locale (ja-JP) renders the same in both processes and does not crash", () => {
    const server = render("ja", SERVER)
    expect(render("ja", CLIENT)).toBe(server)
    expect(text(server)).toContain("2025年3月3日")
  })
  test("an invalid locale string falls back to the English tables", () => {
    const server = render("invalid", SERVER)
    expect(render("invalid", CLIENT)).toBe(server)
    expect(text(server)).toContain("Mar 3, 2025 | 3:45 PM")
  })
  test("untyped JSX without `month`: the first selected date decides the month, identically in both processes", () => {
    const server = render("selectedOnly", SERVER)
    expect(render("selectedOnly", CLIENT)).toBe(server)
    expect(server).toContain("July 2031")
  })
  test("untyped JSX with nothing: no crash, a fixed anchor month, identical in both processes (never today's month)", () => {
    const server = render("nothing", SERVER)
    expect(render("nothing", CLIENT)).toBe(server)
    expect(server).toContain("January 2000")
  })
})

// ---- Unit tests ---------------------------------------------------------------------------------------------------------------

describe("dates", () => {
  test("en", () => {
    expect(formatDate(D, "en-US")).toBe("Mar 3, 2025")
    expect(formatTime(D, "en-US")).toBe("3:45 PM")
    expect(formatTime("2025-03-03T00:05:00Z", "en-US")).toBe("12:05 AM")
    expect(formatDateTime(D, "en-US")).toBe("Mar 3, 2025, 3:45 PM")
    expect(formatWeekdayDate(D, "en-US")).toBe("Mon, Mar 3")
    expect(formatWeekdayDateTime(D, "en-US")).toBe("Mon, Mar 3, 3:45 PM")
  })
  test("es-CO", () => {
    expect(formatDate(D, "es-CO")).toBe("3 mar 2025")
    expect(formatTime(D, "es-CO")).toBe("15:45")
    expect(formatTime("2025-03-03T00:05:00Z", "es-CO")).toBe("00:05")
    expect(formatDateTime(D, "es-CO")).toBe("3 mar 2025, 15:45")
    expect(formatWeekdayDate(D, "es-CO")).toBe("lun, 3 mar")
    expect(formatWeekdayDateTime(D, "es-CO")).toBe("lun, 3 mar, 15:45")
    expect(formatDate("2025-09-02T00:00:00Z", "es")).toBe("2 sept 2025")
  })
  test("name tables", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((m) => monthName(m, "es"))).toEqual(["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"])
    expect([0, 1, 2, 3, 4, 5, 6].map((w) => weekdayName(w, "es"))).toEqual(["dom", "lun", "mar", "mié", "jue", "vie", "sáb"])
    expect(monthName(8, "es", "long")).toBe("septiembre")
    expect(weekdayName(3, "en", "long")).toBe("Wednesday")
    expect(monthName(12, "en")).toBe("—")
  })
  test("pt, fr, de have built-in tables", () => {
    expect(formatDate(D, "pt-BR")).toBe("3 mar 2025")
    expect(formatDate(D, "fr-FR")).toBe("3 mars 2025")
    expect(formatDate(D, "de-DE")).toBe("3. Mär 2025")
    expect(formatWeekdayDate(D, "de")).toBe("Mo, 3. Mär")
    expect(formatTime(D, "fr")).toBe("15:45")
    expect(formatHour(D, "en-US")).toBe("3 PM")
    expect(formatHour("2025-03-03T00:00:00Z", "en-US")).toBe("12 AM")
    expect(formatHour(D, "es-CO")).toBe("15:00")
    expect(formatHour(null)).toBe("—")
  })
  test("date math is UTC: the same instant prints the same in any TZ (see the cross-process tests) and strings without a zone are UTC", () => {
    expect(formatDateTime("2025-03-03 23:30:00", "en-US")).toBe("Mar 3, 2025, 11:30 PM")
    expect(formatDate(Date.UTC(2025, 11, 31, 23, 59), "en-US")).toBe("Dec 31, 2025")
    expect(formatDate(new Date("2025-03-03T23:30:00-05:00"), "en-US")).toBe("Mar 4, 2025")
  })
  test("invalid input is an em dash, in every formatter and locale", () => {
    for (const bad of [null, undefined, "", "nope", NaN, new Date("x")]) {
      for (const loc of ["en-US", "es-CO", "ja-JP"]) {
        expect(formatDate(bad, loc)).toBe("—")
        expect(formatTime(bad, loc)).toBe("—")
        expect(formatDateTime(bad, loc)).toBe("—")
        expect(formatWeekdayDate(bad, loc)).toBe("—")
        expect(formatWeekdayDateTime(bad, loc)).toBe("—")
        expect(formatRelative(bad, D, loc)).toBe("—")
        expect(formatRelative(D, bad, loc)).toBe("—")
      }
    }
    for (const bad of [null, undefined, "", "abc", NaN, Infinity]) {
      expect(formatNumber(bad)).toBe("—")
      expect(formatMoney(bad)).toBe("—")
    }
  })
  test("es regions: the decimal-point ones (es-MX, es-US, es-PR, ...) and the rest", () => {
    for (const r of ["MX", "US", "PR", "DO", "GT", "HN", "NI", "PA", "SV", "PE", "419", "CU"]) expect(formatNumber(1234567.5, `es-${r}`)).toBe("1,234,567.5")
    for (const r of ["CO", "AR", "CL", "ES", "CR", "VE", "EC", "BO", "UY", "PY"]) expect(formatNumber(1234567.5, `es-${r}`)).toBe("1.234.567,5")
    expect(formatNumber(1234567.5, "es")).toBe("1.234.567,5")
    expect(formatNumber(1234.5, "es_MX")).toBe("1,234.5")
  })
  test("es-MX numbers, money and 12-hour clock", () => {
    expect(formatNumber(1234567.891, "es-MX")).toBe("1,234,567.891")
    expect(formatMoney(1234.5, "MXN", "es-MX")).toBe("$1,234.50")
    expect(formatMoney(-1234.5, "USD", "es-MX")).toBe(`-USD${NBSP}1,234.50`)
    expect(formatTime(D, "es-MX")).toBe("3:45 p.m.")
    expect(formatDateTime(D, "es-MX")).toBe("3 mar 2025, 3:45 p.m.")
    expect(formatDate(D, "es-MX")).toBe("3 mar 2025")
    expect(formatTime(D, "es-CO")).toBe("15:45")
  })
  test("the default locale is en-US and setDefaultLocale changes it", () => {
    expect(getDefaultLocale()).toBe("en-US")
    expect(formatDate(D)).toBe("Mar 3, 2025")
    setDefaultLocale("es-CO")
    try {
      expect(formatDate(D)).toBe("3 mar 2025")
      expect(formatDate(D, "en-US")).toBe("Mar 3, 2025")
    } finally {
      setDefaultLocale("en-US")
    }
  })
  test("an unknown valid locale uses Intl with UTC; an invalid one the English tables", () => {
    expect(formatDate(D, "ja-JP")).toBe("2025年3月3日")
    expect(formatDate("2025-03-03T23:30:00Z", "ja-JP")).toBe("2025年3月3日")
    expect(formatDate(D, "not a locale!!")).toBe("Mar 3, 2025")
    expect(formatNumber(1234.5, "!!")).toBe("1,234.5")
    expect(formatRelative("2025-03-13T00:00:00Z", "2025-03-10T00:00:00Z", "ja-JP")).toContain("3")
  })
})

describe("instrument-kit F", () => {
  // The Intl formatters F used to be, verbatim (en-US, UTC). The only deliberate difference is ICU 76's U+202F before AM/PM.
  const ref = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o })
  const REF = {
    monthYear: ref({ month: "long", year: "numeric" }),
    monthShortYear: ref({ month: "short", year: "numeric" }),
    monthShort: ref({ month: "short" }),
    year: ref({ year: "numeric" }),
    weekday: ref({ weekday: "short" }),
    weekdayNarrow: ref({ weekday: "narrow" }),
    day: ref({ weekday: "short", month: "short", day: "numeric" }),
    dayLong: ref({ weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    date: ref({ month: "short", day: "numeric", year: "numeric" }),
    dateShort: ref({ month: "short", day: "numeric" }),
    time: ref({ hour: "numeric", minute: "2-digit" }),
    hour: ref({ hour: "numeric" }),
  }
  test("en-US output is identical to the old Intl output over 3 years of dates and every hour", () => {
    let checked = 0
    for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2027, 0, 1); t += 6 * 3_600_000 + 17 * 60_000) {
      const d = new Date(t)
      for (const k of Object.keys(REF) as (keyof typeof REF)[]) {
        expect(F[k].format(d)).toBe(REF[k].format(d).replace(/\u202F/g, " "))
        checked++
      }
    }
    expect(checked).toBeGreaterThan(10000)
  })
  test("with an es default every entry is Spanish (no 'Mon, Mar 3' beside 'lun')", () => {
    setDefaultLocale("es-CO")
    try {
      const d = new Date(D)
      expect(F.day.format(d)).toBe("lun, 3 mar")
      expect(F.dayLong.format(d)).toBe("lunes, 3 de marzo de 2025")
      expect(F.monthYear.format(d)).toBe("marzo de 2025")
      expect(F.monthShortYear.format(d)).toBe("mar 2025")
      expect(F.date.format(d)).toBe("3 mar 2025")
      expect(F.dateShort.format(d)).toBe("3 mar")
      expect(F.weekday.format(d)).toBe("lun")
      expect(F.time.format(d)).toBe("15:45")
    } finally {
      setDefaultLocale("en-US")
    }
  })
  test("an undefined date is an em dash, not 'now'", () => expect(F.date.format(undefined)).toBe("—"))
})

describe("narrow weekdays and extra decimal-point regions", () => {
  const narrow = (l: string) => [0, 1, 2, 3, 4, 5, 6].map((w) => weekdayName(w, l, "narrow")).join(" ")
  test("tables match ICU's weekday:'narrow'", () => {
    expect(narrow("es")).toBe("D L M X J V S")
    expect(narrow("es-MX")).toBe("D L M X J V S")
    expect(narrow("en")).toBe("S M T W T F S")
    expect(narrow("pt-BR")).toBe("D S T Q Q S S")
    expect(narrow("fr")).toBe("D L M M J V S")
    expect(narrow("de")).toBe("S M D M D F S")
    for (const l of ["es", "en-US", "pt-BR", "fr", "de"]) {
      const icu = [0, 1, 2, 3, 4, 5, 6].map((i) => new Intl.DateTimeFormat(l, { timeZone: "UTC", weekday: "narrow" }).format(new Date(Date.UTC(2025, 2, 2 + i)))).join(" ")
      expect(narrow(l)).toBe(icu)
    }
  })
  test("es-BZ and es-BR write 1,234.5", () => {
    expect(formatNumber(1234.5, "es-BZ")).toBe("1,234.5")
    expect(formatNumber(1234.5, "es-BR")).toBe("1,234.5")
  })
})

describe("numbers and money", () => {
  test("en", () => {
    expect(formatNumber(1234567.891, "en-US")).toBe("1,234,567.891")
    expect(formatNumber(1234.5, "en-US", { minimumFractionDigits: 2 })).toBe("1,234.50")
    expect(formatNumber(0.12345, "en-US", { maximumFractionDigits: 2 })).toBe("0.12")
    expect(formatNumber(-999, "en-US")).toBe("-999")
    expect(formatNumber("1500", "en-US")).toBe("1,500")
    expect(formatNumber(-0.0001, "en-US")).toBe("0")
    expect(formatMoney(1234.5, "USD", "en-US")).toBe("$1,234.50")
    expect(formatMoney(-1234.5, "EUR", "en-US")).toBe("-€1,234.50")
    expect(formatMoney(5000, "JPY", "en-US")).toBe("¥5,000")
    expect(formatMoney(12, "CHF", "en-US")).toBe(`CHF${NBSP}12.00`)
  })
  test("es-CO", () => {
    expect(formatNumber(1234567.891, "es-CO")).toBe("1.234.567,891")
    expect(formatNumber(1234.5, "es-CO", { minimumFractionDigits: 2 })).toBe("1.234,50")
    expect(formatNumber(-1234.5, "es")).toBe("-1.234,5")
    expect(formatMoney(1234.56, "COP", "es-CO")).toBe(`$${NBSP}1.234,56`)
    expect(formatMoney(1234.56, "USD", "es-CO")).toBe(`US$${NBSP}1.234,56`)
    expect(formatMoney(-1234.56, "COP", "es-CO")).toBe(`-$${NBSP}1.234,56`)
    expect(formatMoney(5000000, "COP", "es-CO", 0)).toBe(`$${NBSP}5.000.000`)
    expect(formatMoney(99, "EUR", "es-CO")).toBe(`€${NBSP}99,00`)
  })
  test("ISO minor units: zero- and three-decimal currencies", () => {
    for (const c of ["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "UYI", "VND", "VUV", "XAF", "XOF", "XPF"]) {
      expect(formatMoney(1234, c, "en-US")).toMatch(/1,234$/)
    }
    for (const c of ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]) expect(formatMoney(1.5, c, "en-US")).toBe(`${c}${NBSP}1.500`)
  })
  test("rounding is exact decimal, half away from zero (like ICU), not binary toFixed", () => {
    expect(formatNumber(1.005, "en-US", { maximumFractionDigits: 2 })).toBe("1.01")
    expect(formatNumber(1.45, "en-US", { maximumFractionDigits: 1 })).toBe("1.5")
    expect(formatNumber(-1.005, "en-US", { maximumFractionDigits: 2 })).toBe("-1.01")
    expect(formatNumber(2.5, "en-US", { maximumFractionDigits: 0 })).toBe("3")
    expect(formatNumber(0.999, "en-US", { maximumFractionDigits: 2 })).toBe("1")
    expect(formatNumber(1e-7, "en-US", { maximumFractionDigits: 8 })).toBe("0.0000001")
    expect(formatNumber(1.5e21, "en-US")).toBe("1,500,000,000,000,000,000,000")
    expect(formatMoney(1.005, "USD", "en-US")).toBe("$1.01")
    expect(formatMoney(0.004, "USD", "en-US")).toBe("$0.00")
    expect(formatMoney(-0.004, "USD", "en-US")).toBe("$0.00")
  })
  test("pt, fr, de", () => {
    expect(formatMoney(1234.56, "BRL", "pt-BR")).toBe(`R$${NBSP}1.234,56`)
    expect(formatMoney(1234.56, "EUR", "fr-FR")).toBe(`1\u202F234,56${NBSP}€`)
    expect(formatMoney(1234.56, "EUR", "de-DE")).toBe(`1.234,56${NBSP}€`)
  })
})

describe("formatRelative", () => {
  const ASOF = "2025-03-10T12:00:00Z"
  const rel = (v: string, l: string) => formatRelative(v, ASOF, l)
  test("en, every branch", () => {
    expect(rel("2025-03-10T12:00:30Z", "en")).toBe("now")
    expect(rel("2025-03-10T12:05:00Z", "en")).toBe("in 5 minutes")
    expect(rel("2025-03-10T11:59:00Z", "en")).toBe("1 minute ago")
    expect(rel("2025-03-10T15:10:00Z", "en")).toBe("in 3 hours")
    expect(rel("2025-03-10T07:00:00Z", "en")).toBe("5 hours ago")
    expect(rel("2025-03-10T19:00:00Z", "en")).toBe("today")
    expect(rel("2025-03-10T03:00:00Z", "en")).toBe("today")
    expect(rel("2025-03-11T12:00:00Z", "en")).toBe("tomorrow")
    expect(rel("2025-03-09T12:00:00Z", "en")).toBe("yesterday")
    expect(rel("2025-03-13T12:00:00Z", "en")).toBe("in 3 days")
    expect(rel("2025-03-07T12:00:00Z", "en")).toBe("3 days ago")
    expect(rel("2025-05-10T12:00:00Z", "en")).toBe("in 2 months")
    expect(rel("2025-02-05T12:00:00Z", "en")).toBe("1 month ago")
    expect(rel("2027-03-11T12:00:00Z", "en")).toBe("in 2 years")
    expect(rel("2024-03-10T12:00:00Z", "en")).toBe("1 year ago")
  })
  test("es, every branch", () => {
    expect(rel("2025-03-10T12:00:30Z", "es-CO")).toBe("ahora")
    expect(rel("2025-03-10T12:05:00Z", "es-CO")).toBe("en 5 minutos")
    expect(rel("2025-03-10T11:59:00Z", "es-CO")).toBe("hace 1 minuto")
    expect(rel("2025-03-10T15:10:00Z", "es-CO")).toBe("en 3 horas")
    expect(rel("2025-03-10T07:00:00Z", "es-CO")).toBe("hace 5 horas")
    expect(rel("2025-03-10T19:00:00Z", "es-CO")).toBe("hoy")
    expect(rel("2025-03-11T12:00:00Z", "es-CO")).toBe("mañana")
    expect(rel("2025-03-09T12:00:00Z", "es-CO")).toBe("ayer")
    expect(rel("2025-03-13T12:00:00Z", "es-CO")).toBe("en 3 días")
    expect(rel("2025-03-07T12:00:00Z", "es-CO")).toBe("hace 3 días")
    expect(rel("2025-05-10T12:00:00Z", "es-CO")).toBe("en 2 meses")
    expect(rel("2025-02-05T12:00:00Z", "es-CO")).toBe("hace 1 mes")
    expect(rel("2027-03-11T12:00:00Z", "es-CO")).toBe("en 2 años")
    expect(rel("2024-03-10T12:00:00Z", "es-CO")).toBe("hace 1 año")
  })
  test("is pure: depends only on its arguments", () => {
    const a = formatRelative(D, ASOF, "en")
    expect(formatRelative(D, ASOF, "en")).toBe(a)
    expect(formatRelative(new Date(D), new Date(ASOF).getTime(), "en")).toBe(a)
    expect(a).toBe("7 days ago")
  })
  test("pt, fr, de", () => {
    expect(rel("2025-03-13T12:00:00Z", "pt-BR")).toBe("em 3 dias")
    expect(rel("2025-03-07T12:00:00Z", "fr")).toBe("il y a 3 jours")
    expect(rel("2025-03-07T12:00:00Z", "de")).toBe("vor 3 Tagen")
  })
})

// ---- Guard: format.ts never reads the clock or the machine's locale -----------------------------------------------------------------

describe("format.ts guard", () => {
  const code = readFileSync(join(import.meta.dir, "format.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s\/\/.*$/gm, "")
  test("no Date.now()", () => expect(code).not.toMatch(/Date\s*\.\s*now\s*\(/))
  test("no `new Date()` without arguments", () => expect(code).not.toMatch(/new\s+Date\s*\(\s*\)/))
  test("no toLocale*", () => expect(code).not.toMatch(/toLocale\w*\s*\(/))
  test("no bare `Date(` call and no `Intl.X(` constructor without `new`", () => {
    expect(code).not.toMatch(/(?<![\w.])(?<!new\s+)Date\s*\(/)
    expect(code).not.toMatch(/(?<!new\s+)Intl\.(DateTimeFormat|NumberFormat|RelativeTimeFormat|ListFormat|PluralRules|Collator|DisplayNames)\s*\(/)
  })
  test("every Intl constructor gets an explicit locale (never the runtime default)", () => {
    for (const m of code.matchAll(/new\s+Intl\.\w+\(\s*([^,)]*)/g)) {
      expect(m[1].trim()).not.toBe("")
      expect(m[1].trim()).not.toBe("undefined")
    }
  })
})
