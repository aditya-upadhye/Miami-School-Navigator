import { describe, expect, test } from "bun:test"
import { renderToString } from "react-dom/server"
import { Schedule } from "@/lib/schedule"
import { segmentsForDay, splitByDay } from "@/lib/schedule-layout"

// Day boundaries are UTC, the same convention as instrument-kit (dayKey/startOfDay/hoursOf) and format.ts.
const D = (day: number, h = 0, m = 0) => new Date(Date.UTC(2026, 9, day, h, m))
const iso = (day: number, h = 0, m = 0) => D(day, h, m).toISOString()
const day = (n: number) => D(n)
const next = (n: number) => D(n + 1)

describe("segmentsForDay / splitByDay", () => {
  test("22:00 → 02:00 next day yields exactly two segments with the right bounds", () => {
    const ev = { start: D(1, 22), end: D(2, 2) }
    const segs = splitByDay(ev)
    expect(segs).toHaveLength(2)
    expect([segs[0].start, segs[0].end]).toEqual([D(1, 22), D(2, 0)])
    expect([segs[0].continuesBefore, segs[0].continuesAfter]).toEqual([false, true])
    expect([segs[1].start, segs[1].end]).toEqual([D(2, 0), D(2, 2)])
    expect([segs[1].continuesBefore, segs[1].continuesAfter]).toEqual([true, false])
  })
  test("a 3-day event yields three segments (tail, full day, head)", () => {
    const segs = splitByDay({ start: D(1, 22), end: D(4, 6) })
    expect(segs).toHaveLength(4) // 22:00–24:00, two full days, 00:00–06:00
    const three = splitByDay({ start: D(1, 22), end: D(3, 6) })
    expect(three).toHaveLength(3)
    expect([three[1].start, three[1].end]).toEqual([D(2), D(3)])
    expect([three[1].continuesBefore, three[1].continuesAfter]).toEqual([true, true])
  })
  test("an event ending exactly at 00:00 yields ONE segment", () => {
    const segs = splitByDay({ start: D(1, 22), end: D(2) })
    expect(segs).toHaveLength(1)
    expect(segs[0].continuesAfter).toBe(false)
    expect(segmentsForDay({ start: D(1, 22), end: D(2) }, day(2), next(2))).toBeNull()
  })
  test("an event starting at 00:00 yields one segment", () => {
    const segs = splitByDay({ start: D(1), end: D(1, 5) })
    expect(segs).toHaveLength(1)
    expect([segs[0].continuesBefore, segs[0].continuesAfter]).toEqual([false, false])
  })
  test("zero-length / open-ended events belong to the day containing them; other days get none", () => {
    expect(splitByDay({ start: D(1, 23, 50) })).toHaveLength(1)
    expect(segmentsForDay({ start: D(1, 9), end: null }, day(2), next(2))).toBeNull()
  })
})

interface Ev { id: string; title: string; startsAt: string; endsAt: string; allDay?: boolean }
const night: Ev = { id: "night", title: "Night shift", startsAt: iso(1, 22), endsAt: iso(2, 2) }
const render = (view: "week" | "month" | "day" | "agenda", data: Ev[], date = "2026-10-01") =>
  renderToString(<Schedule rows={data} start="startsAt" end="endsAt" allDay="allDay" date={date} today="2026-10-01" defaultView={view} dayStartHour={0} dayEndHour={24} />)
const weekGrid = (html: string) => html.slice(html.indexOf("hidden md:block"), html.indexOf('<div class="md:hidden">'))
/** Day columns of a time grid (Sunday-first week: Oct 1 is index 4). */
const columns = (html: string) => html.split('class="relative min-w-0 border-l border-border"').slice(1)
const idCount = (html: string, id: string) => (html.match(new RegExp(`data-event-id="${id}"`, "g")) ?? []).length
const boxStyle = (col: string, id: string) => {
  const m = col.match(new RegExp(`<li class="absolute px-0\\.5" style="([^"]*)"><[^>]*data-event-id="${id}"[^>]*>`))
  return m ? m[1] : null
}

describe("Schedule: events spanning midnight", () => {
  test("week grid: 22:00–24:00 on day 1, 00:00–02:00 on day 2, once each, with continuation markers", () => {
    const cols = columns(weekGrid(render("week", [night])))
    expect(cols).toHaveLength(7)
    const d1 = boxStyle(cols[4], "night")!
    const d2 = boxStyle(cols[5], "night")!
    expect(d1).toContain("top:66rem") // 22h * 3rem
    expect(d1).toContain("height:6rem") // 2h
    expect(d2).toContain("top:0rem")
    expect(d2).toContain("height:6rem")
    expect(idCount(cols[4], "night")).toBe(1)
    expect(idCount(cols[5], "night")).toBe(1) // not redrawn at 22:00 in day 2
    expect(cols[4]).toContain('data-continues="after"')
    expect(cols[5]).toContain('data-continues="before"')
    expect(cols[3] + cols[6]).not.toContain("data-event-id")
    // continuation segments carry the REAL range, not the clipped one
    expect(cols[5]).toContain("10:00 PM – 2:00 AM")
  })
  test("an event of 24h or more (3-day booking) lands in the all-day row, not the grid", () => {
    const long: Ev = { id: "long", title: "Long", startsAt: iso(1, 14), endsAt: iso(4, 11) }
    const grid = weekGrid(render("week", [long]))
    expect(columns(grid).join("")).not.toContain("data-event-id")
    expect(idCount(grid, "long")).toBe(3) // Oct 1, 2, 3 cells (Oct 4 is past the visible week)
    // cut only where it runs past the visible range: ends after Sat Oct 3
    expect(grid).toContain('data-continues="after"')
    expect(grid).not.toContain('data-continues="before"')
  })
  test("a 23-hour event crossing midnight still splits", () => {
    const e: Ev = { id: "e23", title: "E23", startsAt: iso(1, 14), endsAt: iso(2, 13) }
    const cols = columns(weekGrid(render("week", [e])))
    expect(boxStyle(cols[4], "e23")).toContain("top:42rem")
    expect(boxStyle(cols[5], "e23")).toContain("height:39rem")
  })
  test("no-end / zero-length events at the first visible hour still render", () => {
    const noEnd = renderToString(<Schedule rows={[{ id: "ne", title: "NE", startsAt: iso(1, 7) }]} start="startsAt" end="endsAt" date="2026-10-01" defaultView="day" />)
    expect(idCount(noEnd, "ne")).toBe(1)
    const zero = renderToString(<Schedule rows={[{ id: "z", title: "Z", startsAt: iso(1), endsAt: iso(1) }]} start="startsAt" end="endsAt" date="2026-10-01" defaultView="day" dayStartHour={0} dayEndHour={24} />)
    expect(idCount(zero, "z")).toBe(1)
  })
  test("a 23:50 event's 30-minute floor stays inside the grid", () => {
    const html = render("week", [{ id: "late", title: "Late", startsAt: iso(1, 23, 50), endsAt: iso(2, 0, 10) }])
    const cols = columns(weekGrid(html))
    expect(boxStyle(cols[4], "late")).toContain("top:70.5rem") // 23.5h, bottom edge at 24h
    expect(boxStyle(cols[4], "late")).toContain("height:1.5rem")
  })
  test("22:00–24:00 is one day: no +1 in the agenda", () => {
    const html = render("agenda", [{ id: "e", title: "E", startsAt: iso(1, 22), endsAt: iso(2) }])
    expect(html).not.toContain("data-end-offset")
  })
  test("hidden hours: a segment wholly outside the visible hours is dropped", () => {
    const html = renderToString(<Schedule rows={[night]} start="startsAt" end="endsAt" date="2026-10-01" defaultView="day" dayStartHour={7} dayEndHour={21} />)
    expect(idCount(html, "night")).toBe(0)
  })
  test("month: once in each of the two cells, never twice in a cell, both marked", () => {
    const html = render("month", [night])
    const cells = html.slice(0, html.indexOf("</table>")).split("<td").slice(1).filter((c) => c.includes('data-event-id="night"'))
    expect(cells).toHaveLength(2)
    for (const c of cells) expect(idCount(c, "night")).toBe(1)
    expect(cells[0]).toContain('data-continues="after"')
    expect(cells[1]).toContain('data-continues="before"')
  })
  test("agenda: listed exactly once, with the real range and +1", () => {
    const html = render("agenda", [night])
    expect(idCount(html, "night")).toBe(1)
    expect(html).toContain("10:00 PM – 2:00 AM")
    expect(html).toContain('data-end-offset="1"')
    expect(html).toContain(">+")
  })
  test("agenda: an event that began before the window is listed once, marked 'before'", () => {
    const html = render("agenda", [night], "2026-10-02")
    expect(idCount(html, "night")).toBe(1)
    expect(html).toContain('data-continues="before"')
    expect(html).toContain("Oct 1, 10:00 PM – 2:00 AM") // carried-in row shows its start date
  })
  test("lanes are per day on the clipped segments", () => {
    const other: Ev = { id: "other", title: "Other", startsAt: iso(2, 1), endsAt: iso(2, 3) }
    const late: Ev = { id: "late", title: "Late", startsAt: iso(2, 23, 30), endsAt: iso(2, 23, 45) }
    const early: Ev = { id: "early", title: "Early", startsAt: iso(1, 20), endsAt: iso(1, 21) }
    const cols = columns(weekGrid(render("week", [night, other, late, early])))
    expect(boxStyle(cols[5], "night")).toContain("width:50%")
    expect(boxStyle(cols[5], "other")).toContain("left:50%")
    // 23:30 on day 2 does not overlap day 2's 00:00–02:00 segment (nor day 1's 22:00 start)
    expect(boxStyle(cols[5], "late")).toContain("width:100%")
    // 20:00–21:00 on day 1 does not overlap the 22:00–24:00 segment
    expect(boxStyle(cols[4], "early")).toContain("width:100%")
    expect(boxStyle(cols[4], "night")).toContain("width:100%")
  })
  test("resource day view clips per day", () => {
    const e = { ...night, room: "A" }
    const html = renderToString(<Schedule rows={[e]} start="startsAt" end="endsAt" resource="room" date="2026-10-02" defaultView="day" dayStartHour={0} dayEndHour={24} />)
    expect(boxStyle(html, "night")).toContain("top:0rem;height:6rem")
  })
  test("all-day events are unaffected (flagged, and whole-UTC-day spans)", () => {
    const flagged: Ev = { id: "hol", title: "Holiday", startsAt: iso(1), endsAt: iso(2), allDay: true }
    const whole: Ev = { id: "whole", title: "Whole", startsAt: iso(1), endsAt: iso(3) }
    const html = render("week", [flagged, whole])
    const grid = weekGrid(html)
    expect(columns(grid).join("")).not.toContain("data-event-id")
    expect(idCount(grid, "hol")).toBe(1)
    expect(idCount(grid, "whole")).toBe(2) // Oct 1 and Oct 2 all-day cells
    expect(html).not.toContain("data-continues")
    expect(render("month", [flagged])).not.toContain("data-continues")
  })
})
