import { describe, expect, test } from "bun:test"
import { renderToString } from "react-dom/server"
import { Schedule } from "@/lib/schedule"
import { assignClusterLanes, titleLinesFor, HOUR } from "@/lib/schedule-layout"
import { Board } from "@/lib/board"

// Layout regressions apg found in Chromium: event boxes sized to content, nowrap time pushing out of a
// narrow column, line-clamp-2 clipping 1h events, per-day (not per-cluster) overlap lanes, numeric board width.
interface Ev { id: string; title: string; startsAt: string; endsAt: string; allDay?: boolean }
const H = (h: number, m = 0) => `2026-10-01T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`
const rows: Ev[] = [
  { id: "a", title: "OneHour", startsAt: H(9), endsAt: H(10) },
  { id: "b", title: "Holiday", startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-02T00:00:00Z", allDay: true },
]
const sched = (view: "week" | "month" | "day", extra: Record<string, unknown> = {}, data: Ev[] = rows) =>
  renderToString(<Schedule rows={data} start="startsAt" end="endsAt" allDay="allDay" date="2026-10-01" today="2026-10-01" defaultView={view} {...extra} />)
const eventBoxes = (html: string) => Array.from(html.matchAll(/<(?:button|div|a)\b[^>]*data-event-id="[^"]*"[^>]*>/g), (m) => m[0])

describe("Schedule event boxes", () => {
  for (const view of ["week", "month", "day"] as const) {
    for (const withSelect of [false, true]) {
      test(`${view} ${withSelect ? "with" : "without"} onSelect: every event box is w-full`, () => {
        const html = sched(view, withSelect ? { onSelect: () => {} } : {})
        const boxes = eventBoxes(html)
        expect(boxes.length).toBeGreaterThan(0)
        for (const b of boxes) expect(b).toContain("w-full")
        if (withSelect) expect(boxes.some((b) => b.startsWith("<button"))).toBe(true)
      })
    }
  }
  test("all-day boxes (week time grid, month cell) are w-full", () => {
    for (const view of ["week", "month"] as const) {
      const boxes = eventBoxes(sched(view, { onSelect: () => {} })).filter((x) => x.includes('aria-label="Holiday'))
      expect(boxes.length).toBeGreaterThan(0)
      for (const x of boxes) expect(x).toContain("w-full")
    }
  })
  test("time label truncates instead of shrink-0 nowrap", () => {
    const html = sched("day")
    const m = html.match(/<span class="([^"]*)type-mono-id tabular-nums">\d/)
    expect(m).not.toBeNull()
    expect(m![1]).toContain("truncate")
    expect(m![1]).toContain("max-w-full")
    expect(m![1]).not.toContain("shrink-0")
  })
  test("a 1-hour event title is not line-clamp-2", () => {
    const html = sched("day")
    expect(html).not.toContain("line-clamp-2")
    expect(html).toContain("-webkit-line-clamp:1")
  })
  test("a 2-hour event gets a taller clamp", () => {
    const html = sched("day", {}, [{ id: "x", title: "Long", startsAt: H(9), endsAt: H(11) }])
    expect(html).toContain("-webkit-line-clamp:3")
  })
  test("titleLinesFor: lines at 1.125rem always fit the box, up to 8h", () => {
    for (let h = 0.5; h <= 8; h += 0.25) {
      const lines = titleLinesFor(h)
      expect(lines).toBeGreaterThanOrEqual(1)
      if (h >= 1) expect(lines * 1.125).toBeLessThanOrEqual(h * HOUR - 1.625)
    }
  })
  test("an event after dayEndHour does not halve a visible event", () => {
    const data: Ev[] = [
      { id: "a", title: "AAA", startsAt: H(9), endsAt: H(11) },
      { id: "b", title: "BBB", startsAt: H(20), endsAt: H(21) },
    ]
    const html = sched("day", { dayStartHour: 8, dayEndHour: 18 }, data)
    expect(html).toContain("width:100%")
    expect(html).not.toContain("width:50%")
  })
  test("a non-overlapping event spans full width while others overlap that day", () => {
    const data: Ev[] = [
      { id: "a", title: "AAA", startsAt: H(9), endsAt: H(11) },
      { id: "b", title: "BBB", startsAt: H(10), endsAt: H(12) },
      { id: "c", title: "CCC", startsAt: H(15), endsAt: H(16) },
    ]
    const html = sched("day", {}, data)
    const li = (t: string) => html.match(new RegExp(`<li[^>]*style="([^"]*)"[^>]*><[^>]*>(?:(?!</li>).)*${t}`))![1]
    expect(li("CCC")).toContain("left:0%")
    expect(li("CCC")).toContain("width:100%")
    expect(li("AAA")).toContain("width:50%")
    expect(li("BBB")).toContain("left:50%")
  })
})

describe("assignClusterLanes", () => {
  const iv = (s: number, e: number) => ({ start: s, end: e })
  test("no overlap: 1 lane each", () => {
    expect(assignClusterLanes([iv(0, 1), iv(2, 3), iv(4, 5)])).toEqual([{ lane: 0, lanes: 1 }, { lane: 0, lanes: 1 }, { lane: 0, lanes: 1 }])
  })
  test("A overlaps B, C overlaps neither", () => {
    expect(assignClusterLanes([iv(0, 3), iv(1, 4), iv(6, 7)])).toEqual([{ lane: 0, lanes: 2 }, { lane: 1, lanes: 2 }, { lane: 0, lanes: 1 }])
  })
  test("chain A-B-C (A,C disjoint): one cluster, lanes reused greedily", () => {
    expect(assignClusterLanes([iv(0, 3), iv(2, 5), iv(4, 7)])).toEqual([{ lane: 0, lanes: 2 }, { lane: 1, lanes: 2 }, { lane: 0, lanes: 2 }])
  })
  test("touching end == start does not overlap", () => {
    expect(assignClusterLanes([iv(0, 2), iv(2, 4)])).toEqual([{ lane: 0, lanes: 1 }, { lane: 0, lanes: 1 }])
  })
  test("two identical zero-duration events (rendered extent 30min) get 2 lanes", () => {
    const html = sched("day", {}, [
      { id: "a", title: "ZZA", startsAt: H(9), endsAt: H(9) },
      { id: "b", title: "ZZB", startsAt: H(9), endsAt: H(9) },
    ])
    expect(html.match(/width:50%/g)?.length).toBe(2)
  })
  test("a 10-minute event and one starting 10 minutes later share a cluster with 2 lanes", () => {
    const html = sched("day", {}, [
      { id: "a", title: "TTA", startsAt: H(9), endsAt: H(9, 10) },
      { id: "b", title: "TTB", startsAt: H(9, 10), endsAt: H(9, 20) },
    ])
    expect(html.match(/width:50%/g)?.length).toBe(2)
  })
  test("input order is preserved for unsorted input", () => {
    expect(assignClusterLanes([iv(6, 7), iv(1, 4), iv(0, 3)])).toEqual([{ lane: 0, lanes: 1 }, { lane: 1, lanes: 2 }, { lane: 0, lanes: 2 }])
  })
})

describe("Board layout", () => {
  const data = [{ id: "1", title: "Card", status: "Open" }]
  test("numeric columnWidth writes px", () => {
    expect(renderToString(<Board rows={data} columns={["Open"]} columnWidth={288} />)).toContain("--board-col:288px")
  })
  test("string columnWidth passes through", () => {
    expect(renderToString(<Board rows={data} columns={["Open"]} columnWidth="18rem" />)).toContain("--board-col:18rem")
  })
  test("row of columns is top-aligned on mobile, stretched on desktop", () => {
    const html = renderToString(<Board rows={data} columns={["Open"]} />)
    expect(html).toContain("items-start")
    expect(html).toContain("md:items-stretch")
  })
})
