// Dates, times, numbers and money, printed one way on the server and in the browser. A server render that differs from the browser's
// first render is a React hydration error (#418), so nothing here depends on the machine: no Date.now(), no `new Date()` without
// arguments, and for the languages below no Intl and no toLocale* either (src/lib/format.ssr.test.ts enforces it). Everything is
// built by hand from
//   - the UTC parts of the date (all date math is UTC, never the machine's time zone),
//   - built-in month/weekday tables (ICU data differs per engine and version),
//   - built-in grouping/decimal separators and currency layouts.
//
// BUILT-IN LANGUAGES: en, es, pt, fr, de (any region: pt-BR, fr-CA... uses its language's conventions). This is a deterministic
// LANGUAGE-LEVEL APPROXIMATION of CLDR, not a copy of it; the only regional overrides are the Spanish ones listed below.
//   en-US: "Mar 3, 2025"   "3:45 PM" (12 h)  "Mar 3, 2025, 3:45 PM"   "Mon, Mar 3"   1,234.56   $1,234.56
//   es-CO: "3 mar 2025"    "15:45" (24 h)    "3 mar 2025, 15:45"      "lun, 3 mar"   1.234,56   $ 1.234,56 (NBSP after the symbol)
//          months ene feb mar abr may jun jul ago sept oct nov dic ("sept" not "sep"); weekdays lun mar mié jue vie sáb dom
//          (ICU writes es-CO times as "3:45 p. m."; this file deliberately uses the 24-hour "15:45" for es and es-CO)
//   es REGIONAL OVERRIDES (verified against ICU 76 NumberFormat): es-MX, es-US, es-PR, es-DO, es-GT, es-HN, es-NI, es-PA, es-SV, es-PE
//          and also es-419, es-CU, es-BZ and es-BR use "," for grouping and "." for decimals (1,234.56), and a tight symbol ($1,234.56). es-MX also
//          uses a 12-hour clock, "3:45 p.m.". Every other es region (es, es-CO, es-AR, es-CL, es-ES, ...) keeps 1.234,56.
//   pt-BR: "3 mar 2025"    "15:45"           1.234,56   R$ 1.234,56
//   fr:    "3 mars 2025"   "15:45"           1 234,56 (U+202F between groups)   1 234,56 €
//   de:    "3. Mär 2025"   "15:45"           1.234,56   1.234,56 €
//
// ANY OTHER LOCALE (ja-JP, ...) falls back to Intl with that EXPLICIT locale and timeZone "UTC", inside try/catch. That is
// deterministic only within one runtime/ICU build: it holds when the same engine renders both passes and NOT across engines (the
// built-in languages above are the ones guaranteed identical everywhere). A locale string Intl rejects or does not support falls
// back to the English tables, never to the runtime's own default locale.
//
// LOCALE. Every formatter takes an optional trailing `locale`. When omitted it uses the module default, "en-US" (lib/i18n exposes no
// locale usable outside a hook, so the default is a constant), changeable once at startup with setDefaultLocale(). Pass `locale`
// explicitly wherever server and client could otherwise disagree about the default.
//
// Dates accept a Date, an ISO string (a string with a time but no zone is read as UTC) or epoch milliseconds. A missing or invalid value
// is an em dash.

const DASH = "—"
const NBSP = "\u00A0"

export type DateInput = Date | string | number | null | undefined
export type FormatLocale = string
export type NameWidth = "short" | "long" | "narrow"

let defaultLocale: FormatLocale = "en-US"
/** The locale used when a formatter is called without one. Set it once at startup, the same on server and client. */
export function setDefaultLocale(locale: FormatLocale): void {
  // FormatLocale is string only for TypeScript: authored .jsx can pass anything, and a non-string must not poison the default.
  if (typeof locale !== "string" || !locale.trim()) return
  defaultLocale = locale.trim()
}
export function getDefaultLocale(): FormatLocale {
  return defaultLocale
}

type Lang = "en" | "es" | "pt" | "fr" | "de"
type ProfileId = Lang | "esPoint" | "esMX"
type Rel = {
  now: string; today: string; yesterday: string; tomorrow: string
  unit: Record<"minute" | "hour" | "day" | "month" | "year", readonly [string, string]>
  future: (n: number, u: string) => string
  past: (n: number, u: string) => string
}
type Profile = {
  months: { short: readonly string[]; long: readonly string[] }
  weekdays: { short: readonly string[]; long: readonly string[] }
  day: (d: number, mon: string) => string // "Mar 3" / "3 mar"
  year: (day: string, y: number) => string // "Mar 3, 2025" / "3 mar 2025"
  h24: boolean
  meridiem: readonly [string, string]
  tightSymbol: boolean // one-character symbols touch the number ($1,234.56)
  group: string
  decimal: string
  symbolAfter: boolean // 1.234,56 € instead of € 1.234,56
  symbols: Record<string, string>
  rel: Rel
}

const BASE_SYMBOLS = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", BRL: "R$", MXN: "MX$", CAD: "CA$", AUD: "A$" }
const dayFirst = (d: number, mon: string): string => `${d} ${mon}`
const dayFirstYear = (day: string, y: number): string => `${day} ${y}`

const BASE_PROFILES: Record<Lang, Profile> = {
  en: {
    months: {
      short: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      long: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    },
    weekdays: {
      short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      long: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    },
    day: (d, mon) => `${mon} ${d}`,
    year: (day, y) => `${day}, ${y}`,
    h24: false, meridiem: ["AM", "PM"], tightSymbol: true, group: ",", decimal: ".", symbolAfter: false,
    symbols: { ...BASE_SYMBOLS, COP: "COP" },
    rel: {
      now: "now", today: "today", yesterday: "yesterday", tomorrow: "tomorrow",
      unit: { minute: ["minute", "minutes"], hour: ["hour", "hours"], day: ["day", "days"], month: ["month", "months"], year: ["year", "years"] },
      future: (n, u) => `in ${n} ${u}`,
      past: (n, u) => `${n} ${u} ago`,
    },
  },
  es: {
    months: {
      short: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"],
      long: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    },
    weekdays: {
      short: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
      long: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
    },
    day: dayFirst, year: dayFirstYear,
    h24: true, meridiem: ["AM", "PM"], tightSymbol: false, group: ".", decimal: ",", symbolAfter: false,
    symbols: { ...BASE_SYMBOLS, USD: "US$", JPY: "JP¥", COP: "$", AUD: "AU$" },
    rel: {
      now: "ahora", today: "hoy", yesterday: "ayer", tomorrow: "mañana",
      unit: { minute: ["minuto", "minutos"], hour: ["hora", "horas"], day: ["día", "días"], month: ["mes", "meses"], year: ["año", "años"] },
      future: (n, u) => `en ${n} ${u}`,
      past: (n, u) => `hace ${n} ${u}`,
    },
  },
  pt: {
    months: {
      short: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
      long: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
    },
    weekdays: {
      short: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
      long: ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"],
    },
    day: dayFirst, year: dayFirstYear,
    h24: true, meridiem: ["AM", "PM"], tightSymbol: false, group: ".", decimal: ",", symbolAfter: false,
    symbols: { ...BASE_SYMBOLS, USD: "US$" },
    rel: {
      now: "agora", today: "hoje", yesterday: "ontem", tomorrow: "amanhã",
      unit: { minute: ["minuto", "minutos"], hour: ["hora", "horas"], day: ["dia", "dias"], month: ["mês", "meses"], year: ["ano", "anos"] },
      future: (n, u) => `em ${n} ${u}`,
      past: (n, u) => `há ${n} ${u}`,
    },
  },
  fr: {
    months: {
      short: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
      long: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    },
    weekdays: {
      short: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."],
      long: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
    },
    day: dayFirst, year: dayFirstYear,
    h24: true, meridiem: ["AM", "PM"], tightSymbol: false, group: "\u202F", decimal: ",", symbolAfter: true,
    symbols: { ...BASE_SYMBOLS, USD: "$US" },
    rel: {
      now: "maintenant", today: "aujourd’hui", yesterday: "hier", tomorrow: "demain",
      unit: { minute: ["minute", "minutes"], hour: ["heure", "heures"], day: ["jour", "jours"], month: ["mois", "mois"], year: ["an", "ans"] },
      future: (n, u) => `dans ${n} ${u}`,
      past: (n, u) => `il y a ${n} ${u}`,
    },
  },
  de: {
    months: {
      short: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
      long: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    },
    weekdays: {
      short: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
      long: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
    },
    day: (d, mon) => `${d}. ${mon}`, year: dayFirstYear,
    h24: true, meridiem: ["AM", "PM"], tightSymbol: false, group: ".", decimal: ",", symbolAfter: true,
    symbols: { ...BASE_SYMBOLS },
    rel: {
      now: "jetzt", today: "heute", yesterday: "gestern", tomorrow: "morgen",
      unit: { minute: ["Minute", "Minuten"], hour: ["Stunde", "Stunden"], day: ["Tag", "Tagen"], month: ["Monat", "Monaten"], year: ["Jahr", "Jahren"] },
      future: (n, u) => `in ${n} ${u}`,
      past: (n, u) => `vor ${n} ${u}`,
    },
  },
}

const ES_POINT: Profile = {
  ...BASE_PROFILES.es,
  group: ",", decimal: ".", tightSymbol: true,
  symbols: { ...BASE_PROFILES.es.symbols, USD: "USD", MXN: "$", COP: "COP" },
}
const PROFILES: Record<ProfileId, Profile> = {
  ...BASE_PROFILES,
  esPoint: ES_POINT,
  esMX: { ...ES_POINT, h24: false, meridiem: ["a.m.", "p.m."] },
}
// Spanish regions that write 1,234.56 (verified against ICU 76; see the header).
const ES_POINT_REGIONS = new Set(["US", "PR", "DO", "GT", "HN", "NI", "PA", "SV", "PE", "419", "CU", "BZ", "BR"])

const baseLang = (id: ProfileId): Lang => (id === "esPoint" || id === "esMX" ? "es" : id)
// One-letter weekday names, Sunday first (verified against ICU's weekday:"narrow").
const NARROW_WEEKDAYS: Record<Lang, readonly string[]> = {
  en: ["S", "M", "T", "W", "T", "F", "S"],
  es: ["D", "L", "M", "X", "J", "V", "S"],
  pt: ["D", "S", "T", "Q", "Q", "S", "S"],
  fr: ["D", "L", "M", "M", "J", "V", "S"],
  de: ["S", "M", "D", "M", "D", "F", "S"],
}
// "March 2025" / "marzo de 2025" and "Monday, March 3, 2025" / "lunes, 3 de marzo de 2025", per language.
const LONG_FORMS: Record<Lang, { monthYear: (mon: string, y: number) => string; dayLong: (wd: string, d: number, mon: string, y: number) => string }> = {
  en: { monthYear: (m, y) => `${m} ${y}`, dayLong: (wd, d, m, y) => `${wd}, ${m} ${d}, ${y}` },
  es: { monthYear: (m, y) => `${m} de ${y}`, dayLong: (wd, d, m, y) => `${wd}, ${d} de ${m} de ${y}` },
  pt: { monthYear: (m, y) => `${m} de ${y}`, dayLong: (wd, d, m, y) => `${wd}, ${d} de ${m} de ${y}` },
  fr: { monthYear: (m, y) => `${m} ${y}`, dayLong: (wd, d, m, y) => `${wd} ${d} ${m} ${y}` },
  de: { monthYear: (m, y) => `${m} ${y}`, dayLong: (wd, d, m, y) => `${wd}, ${d}. ${m} ${y}` },
}

type Resolved = { lang: ProfileId; intl: null } | { lang: "en"; intl: string }

// A built-in language, else an explicit locale Intl really supports, else English. Never the runtime's own default locale.
function resolve(locale?: FormatLocale): Resolved {
  // Authored .jsx can pass a non-string (formatNumber(v, {maximumFractionDigits: 1}), formatMoney(v, "COP", 0)): fall back to the
  // default instead of throwing during SSR. Never reinterpret such a value as options here.
  const raw = typeof locale === "string" && locale.trim() ? locale.trim() : defaultLocale
  const lang = raw.split(/[-_]/)[0].toLowerCase()
  if (lang in BASE_PROFILES) {
    if (lang === "es") {
      const region = raw.split(/[-_]/).slice(1).find((x) => /^([A-Za-z]{2}|\d{3})$/.test(x))?.toUpperCase()
      if (region === "MX") return { lang: "esMX", intl: null }
      if (region && ES_POINT_REGIONS.has(region)) return { lang: "esPoint", intl: null }
    }
    return { lang: lang as Lang, intl: null }
  }
  try {
    const canonical = Intl.getCanonicalLocales(raw.replace(/_/g, "-"))[0]
    if (canonical && Intl.DateTimeFormat.supportedLocalesOf([canonical]).length > 0) return { lang: "en", intl: canonical }
  } catch {
    /* an invalid tag: English */
  }
  return { lang: "en", intl: null }
}
const tryIntl = <T,>(fn: () => T): T | null => {
  try {
    return fn()
  } catch {
    return null
  }
}
const utcFmt = (locale: string, o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...o })

/** Month name from the built-in table (en/es/pt/fr/de; anything else English). `month` is 0-11. */
export function monthName(month: number, locale?: FormatLocale, width: NameWidth = "short"): string {
  return PROFILES[resolve(locale).lang].months[width === "long" ? "long" : "short"][month] ?? DASH
}
/** Weekday name from the built-in table (en/es/pt/fr/de; anything else English). `weekday` is 0 (Sunday) to 6. */
export function weekdayName(weekday: number, locale?: FormatLocale, width: NameWidth = "short"): string {
  const id = resolve(locale).lang
  if (width === "narrow") return NARROW_WEEKDAYS[baseLang(id)][weekday] ?? DASH
  return PROFILES[id].weekdays[width][weekday] ?? DASH
}

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null
  let d: Date
  if (value instanceof Date) d = value
  else if (typeof value === "number") d = new Date(value)
  else if (typeof value === "string") d = new Date(/^\d{4}-\d\d-\d\d[T ][\d:.]+$/.test(value.trim()) ? `${value.trim().replace(" ", "T")}Z` : value.trim())
  else return null
  return Number.isNaN(d.getTime()) ? null : d
}

const dayOf = (d: Date, p: Profile): string => p.day(d.getUTCDate(), p.months.short[d.getUTCMonth()])
const dateOf = (d: Date, p: Profile): string => p.year(dayOf(d, p), d.getUTCFullYear())
const timeOf = (d: Date, p: Profile): string => {
  const h = d.getUTCHours()
  const mm = String(d.getUTCMinutes()).padStart(2, "0")
  return p.h24 ? `${String(h).padStart(2, "0")}:${mm}` : `${h % 12 === 0 ? 12 : h % 12}:${mm} ${p.meridiem[h < 12 ? 0 : 1]}`
}

const DATE_OPTS: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }
const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }
const WEEKDAY_OPTS: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }

// One formatter body for all five date shapes: the table path (`table`) or, for a non-built-in locale, the Intl path (`intl`).
function render(value: DateInput, locale: FormatLocale | undefined, table: (d: Date, p: Profile, lang: Lang) => string, intl: (d: Date, loc: string) => string): string {
  const d = toDate(value)
  if (!d) return DASH
  const r = resolve(locale)
  if (r.intl) {
    const out = tryIntl(() => intl(d, r.intl))
    if (out !== null) return out
  }
  return table(d, PROFILES[r.lang], baseLang(r.lang))
}

/** "March 2025" / es "marzo de 2025"; `width` "short" gives "Mar 2025" / "mar 2025" (short month, no "de"). */
export function formatMonthYear(value: DateInput, locale?: FormatLocale, width: "short" | "long" = "long"): string {
  return render(
    value,
    locale,
    (d, p, l) => (width === "long" ? LONG_FORMS[l].monthYear(p.months.long[d.getUTCMonth()], d.getUTCFullYear()) : `${p.months.short[d.getUTCMonth()]} ${d.getUTCFullYear()}`),
    (d, l) => utcFmt(l, { month: width, year: "numeric" }).format(d),
  )
}

/** "2025" */
export function formatYear(value: DateInput, locale?: FormatLocale): string {
  return render(value, locale, (d) => String(d.getUTCFullYear()), (d, l) => utcFmt(l, { year: "numeric" }).format(d))
}

/** en "Mar 3" / es "3 mar" (no year, no weekday) */
export function formatMonthDay(value: DateInput, locale?: FormatLocale): string {
  return render(value, locale, dayOf, (d, l) => utcFmt(l, { month: "short", day: "numeric" }).format(d))
}

/** en "Monday, March 3, 2025" / es "lunes, 3 de marzo de 2025" */
export function formatDateLong(value: DateInput, locale?: FormatLocale): string {
  return render(
    value,
    locale,
    (d, p, l) => LONG_FORMS[l].dayLong(p.weekdays.long[d.getUTCDay()], d.getUTCDate(), p.months.long[d.getUTCMonth()], d.getUTCFullYear()),
    (d, l) => utcFmt(l, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(d),
  )
}

/** en "3 PM" / es "15:00" / es-MX "3 p.m." (the hour only, for axis labels) */
export function formatHour(value: DateInput, locale?: FormatLocale): string {
  return render(
    value,
    locale,
    (d, p) => {
      const h = d.getUTCHours()
      return p.h24 ? `${String(h).padStart(2, "0")}:00` : `${h % 12 === 0 ? 12 : h % 12} ${p.meridiem[h < 12 ? 0 : 1]}`
    },
    (d, l) => utcFmt(l, { hour: "numeric" }).format(d),
  )
}

/** en "Mar 3, 2025" / es "3 mar 2025" */
export function formatDate(value: DateInput, locale?: FormatLocale): string {
  return render(value, locale, dateOf, (d, l) => utcFmt(l, DATE_OPTS).format(d))
}

/** en "3:45 PM" / es "15:45" */
export function formatTime(value: DateInput, locale?: FormatLocale): string {
  return render(value, locale, timeOf, (d, l) => utcFmt(l, TIME_OPTS).format(d))
}

/** en "Mar 3, 2025, 3:45 PM" / es "3 mar 2025, 15:45" */
export function formatDateTime(value: DateInput, locale?: FormatLocale): string {
  return render(value, locale, (d, p) => `${dateOf(d, p)}, ${timeOf(d, p)}`, (d, l) => `${utcFmt(l, DATE_OPTS).format(d)}, ${utcFmt(l, TIME_OPTS).format(d)}`)
}

/** en "Mon, Mar 3" / es "lun, 3 mar" (no year) */
export function formatWeekdayDate(value: DateInput, locale?: FormatLocale): string {
  return render(value, locale, (d, p) => `${p.weekdays.short[d.getUTCDay()]}, ${dayOf(d, p)}`, (d, l) => utcFmt(l, WEEKDAY_OPTS).format(d))
}

/** en "Mon, Mar 3, 3:45 PM" / es "lun, 3 mar, 15:45" (no year) */
export function formatWeekdayDateTime(value: DateInput, locale?: FormatLocale): string {
  return render(
    value,
    locale,
    (d, p) => `${p.weekdays.short[d.getUTCDay()]}, ${dayOf(d, p)}, ${timeOf(d, p)}`,
    (d, l) => `${utcFmt(l, WEEKDAY_OPTS).format(d)}, ${utcFmt(l, TIME_OPTS).format(d)}`,
  )
}

// ---- Relative time ---------------------------------------------------------------------------------------------------------------

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000
const SAME_DAY_HOURS_BELOW = 6 * HOUR

type RelUnit = "minute" | "hour" | "day" | "month" | "year"
type RelCase = { kind: "now" } | { kind: "today" } | { kind: "near"; sign: -1 | 1 } | { kind: "n"; n: number; unit: RelUnit; sign: -1 | 1 }

/**
 * How far `value` is from `asOf`, in words: en "in 3 days" / "3 days ago" / "today" / "yesterday" / "tomorrow", es "en 3 días" /
 * "hace 3 días" / "hoy" / "ayer" / "mañana". PURE: `asOf` is required and never defaults to the clock, so the server and the first
 * client render print the same text. Coarsening, on the absolute distance:
 *   < 1 min "now"; < 1 h minutes; < 6 h hours; otherwise by UTC calendar day: same day "today", ±1 "yesterday"/"tomorrow",
 *   2-29 days, then months (30 days each, up to 11), then years (365 days each).
 */
export function formatRelative(value: DateInput, asOf: DateInput, locale?: FormatLocale): string {
  const v = toDate(value)
  const a = toDate(asOf)
  if (!v || !a) return DASH
  const ms = v.getTime() - a.getTime()
  const abs = Math.abs(ms)
  const sign: -1 | 1 = ms < 0 ? -1 : 1
  const dayDiff = Math.floor(v.getTime() / DAY) - Math.floor(a.getTime() / DAY)
  const days = Math.abs(dayDiff)
  let c: RelCase
  if (abs < MIN) c = { kind: "now" }
  else if (abs < HOUR) c = { kind: "n", n: Math.floor(abs / MIN), unit: "minute", sign }
  else if (abs < SAME_DAY_HOURS_BELOW) c = { kind: "n", n: Math.floor(abs / HOUR), unit: "hour", sign }
  else if (days === 0) c = { kind: "today" }
  else if (days === 1) c = { kind: "near", sign: dayDiff < 0 ? -1 : 1 }
  else if (days < 30) c = { kind: "n", n: days, unit: "day", sign: dayDiff < 0 ? -1 : 1 }
  else if (days < 365) c = { kind: "n", n: Math.min(11, Math.floor(days / 30)), unit: "month", sign: dayDiff < 0 ? -1 : 1 }
  else c = { kind: "n", n: Math.floor(days / 365), unit: "year", sign: dayDiff < 0 ? -1 : 1 }

  const r = resolve(locale)
  if (r.intl) {
    const out = tryIntl(() => {
      const f = new Intl.RelativeTimeFormat(r.intl, { numeric: "auto" })
      if (c.kind === "now") return f.format(0, "second")
      if (c.kind === "today") return f.format(0, "day")
      if (c.kind === "near") return f.format(c.sign, "day")
      return f.format(c.sign * c.n, c.unit)
    })
    if (out !== null) return out
  }
  const t = PROFILES[r.lang].rel
  if (c.kind === "now") return t.now
  if (c.kind === "today") return t.today
  if (c.kind === "near") return c.sign < 0 ? t.yesterday : t.tomorrow
  return (c.sign < 0 ? t.past : t.future)(c.n, t.unit[c.unit][c.n === 1 ? 0 : 1])
}

// ---- Numbers and money -----------------------------------------------------------------------------------------------------------

export type NumberOptions = { minimumFractionDigits?: number; maximumFractionDigits?: number }

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

// |n| as a plain decimal string ("1e-7" -> "0.0000001"), from the shortest round-trip digits, which is what ICU rounds.
function plainDecimal(abs: number): string {
  const str = String(abs)
  const m = /^(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(str)
  if (!m) return str
  const ds = m[1] + (m[2] ?? "")
  const point = m[1].length + Number(m[3])
  if (point <= 0) return `0.${"0".repeat(-point)}${ds}`
  if (point >= ds.length) return ds + "0".repeat(point - ds.length)
  return `${ds.slice(0, point)}.${ds.slice(point)}`
}

// Exact decimal rounding, half away from zero (ICU's default, halfExpand), on the digit string: 1.005 -> 1.01, 1.45 -> 1.5.
function roundDecimal(plain: string, max: number): [string, string] {
  const [int, frac = ""] = plain.split(".")
  if (frac.length <= max) return [int, frac.padEnd(max, "0")]
  const up = frac.charCodeAt(max) >= 53 // '5'
  let kept = BigInt(int + frac.slice(0, max))
  if (up) kept += 1n
  const all = kept.toString().padStart(max + 1, "0")
  return [all.slice(0, all.length - max), all.slice(all.length - max)]
}

// Digits of |n| rounded to `max` decimals with trailing zeros trimmed down to `min`, grouped and joined per profile.
function digits(n: number, min: number, max: number, p: Profile): { text: string; zero: boolean } {
  const [int, rawFrac] = roundDecimal(plainDecimal(Math.abs(n)), Math.min(100, max))
  let frac = rawFrac
  while (frac.length > min && frac.endsWith("0")) frac = frac.slice(0, -1)
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, p.group)
  return { text: frac ? `${grouped}${p.decimal}${frac}` : grouped, zero: /^0*$/.test(`${int}${frac}`) }
}

/** en "1,234.56" / es "1.234,56". Up to 3 decimals by default (like Intl's default); a missing or non-finite value is an em dash. */
export function formatNumber(value: number | string | null | undefined, locale?: FormatLocale, options: NumberOptions = {}): string {
  const n = toNumber(value)
  if (n === null) return DASH
  // Same rule as the locale slot: a null or non-object options argument from authored .jsx means "no options".
  const opts: NumberOptions = options !== null && typeof options === "object" ? options : {}
  const min = opts.minimumFractionDigits ?? 0
  const max = Math.max(min, opts.maximumFractionDigits ?? 3)
  const r = resolve(locale)
  if (r.intl) {
    const out = tryIntl(() => new Intl.NumberFormat(r.intl, { minimumFractionDigits: min, maximumFractionDigits: max }).format(n))
    if (out !== null) return out
  }
  const { text, zero } = digits(n, min, max, PROFILES[r.lang])
  return n < 0 && !zero ? `-${text}` : text
}

// ISO 4217 minor units that are not 2.
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "UYI", "VND", "VUV", "XAF", "XOF", "XPF"])
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"])

/**
 * en "$1,234.56" / es-CO "$ 1.234,56" / pt-BR "R$ 1.234,56" / fr "1 234,56 €" / de "1.234,56 €" (NBSP between number and symbol, except
 * en with a one-character symbol). A currency with no table entry prints its ISO code. Two decimals, none for the ISO zero-decimal currencies (JPY, KRW, CLP, XOF, ...), three for BHD/KWD/...;
 * `fractionDigits` overrides.
 */
export function formatMoney(value: number | string | null | undefined, currency = "USD", locale?: FormatLocale, fractionDigits?: number): string {
  const n = toNumber(value)
  if (n === null) return DASH
  const code = (typeof currency === "string" && currency.trim() ? currency.trim() : "USD").toUpperCase()
  const fd = fractionDigits ?? (ZERO_DECIMAL.has(code) ? 0 : THREE_DECIMAL.has(code) ? 3 : 2)
  const r = resolve(locale)
  if (r.intl) {
    const out = tryIntl(() => new Intl.NumberFormat(r.intl, { style: "currency", currency: code, minimumFractionDigits: fd, maximumFractionDigits: fd }).format(n))
    if (out !== null) return out
  }
  const p = PROFILES[r.lang]
  const { text, zero } = digits(n, fd, fd, p)
  const symbol = p.symbols[code] ?? code
  const sign = n < 0 && !zero ? "-" : ""
  if (p.symbolAfter) return `${sign}${text}${NBSP}${symbol}`
  const gap = !p.tightSymbol || /^[A-Za-z]+$/.test(symbol) ? NBSP : ""
  return `${sign}${symbol}${gap}${text}`
}
