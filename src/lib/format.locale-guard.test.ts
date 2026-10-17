import { afterEach, describe, expect, test } from "bun:test"
import {
  formatDate, formatDateTime, formatMoney, formatNumber, formatRelative, formatTime, getDefaultLocale, monthName, setDefaultLocale, weekdayName,
} from "@/lib/format"

const D = "2025-03-03T15:45:00Z"
// .jsx screens are not type-checked: these are the shapes authored code really passes as `locale`.
const bad = (v: unknown) => v as never

afterEach(() => setDefaultLocale("en-US"))

describe("a non-string locale falls back to the default and never throws", () => {
  test("formatNumber(1, {options}) behaves like the default locale", () => {
    expect(() => formatNumber(1.234, bad({ maximumFractionDigits: 1 }))).not.toThrow()
    expect(formatNumber(1.234, bad({ maximumFractionDigits: 1 }))).toBe(formatNumber(1.234))
  })
  test("formatMoney(1, 'COP', 0): a number in the locale slot", () => {
    expect(() => formatMoney(1, "COP", bad(0))).not.toThrow()
    expect(formatMoney(1, "COP", bad(0))).toBe(formatMoney(1, "COP"))
  })
  test("formatDate(D, new Date()) and formatDate(D, [])", () => {
    expect(formatDate(D, bad(new Date()))).toBe(formatDate(D))
    expect(formatDate(D, bad([]))).toBe(formatDate(D))
    expect(formatDate(D, bad({ month: "short" }))).toBe(formatDate(D))
  })
  test("null, empty and blank strings use the default too", () => {
    for (const v of [null, undefined, "", "   ", 0, true]) {
      expect(formatDate(D, bad(v))).toBe(formatDate(D))
    }
  })
  test("the other formatters funnel through the same guard", () => {
    expect(formatTime(D, bad({}))).toBe(formatTime(D))
    expect(formatDateTime(D, bad(5))).toBe(formatDateTime(D))
    expect(formatRelative(D, D, bad(0))).toBe(formatRelative(D, D))
    expect(monthName(0, bad({}))).toBe(monthName(0))
    expect(weekdayName(1, bad([]))).toBe(weekdayName(1))
  })
  test("the guard uses the CURRENT default, not a hardcoded one", () => {
    setDefaultLocale("es-CO")
    expect(formatDate(D, bad({}))).toBe(formatDate(D, "es-CO"))
  })
})

describe("the same fall-back outside the locale slot", () => {
  test("formatMoney currency that is not a string is USD", () => {
    expect(formatMoney(1, bad(null))).toBe(formatMoney(1))
    expect(formatMoney(1, bad({}))).toBe(formatMoney(1))
  })
  test("formatNumber options that are null or not an object are {}", () => {
    expect(formatNumber(1, "es", bad(null))).toBe(formatNumber(1, "es"))
    expect(formatNumber(1.5, "es", bad("x"))).toBe(formatNumber(1.5, "es"))
  })
})

describe("setDefaultLocale ignores a non-string", () => {
  test("keeps the current default", () => {
    setDefaultLocale("es-CO")
    for (const v of [5, {}, [], null, undefined, "", "  "]) setDefaultLocale(bad(v))
    expect(getDefaultLocale()).toBe("es-CO")
    expect(() => formatDate(D)).not.toThrow()
  })
  test("stores the trimmed value", () => {
    setDefaultLocale(" es-CO ")
    expect(getDefaultLocale()).toBe("es-CO")
    expect(formatDate(D)).toBe(formatDate(D, "es-CO"))
  })
  test("a valid string still applies", () => {
    setDefaultLocale("fr-FR")
    expect(getDefaultLocale()).toBe("fr-FR")
  })
})
