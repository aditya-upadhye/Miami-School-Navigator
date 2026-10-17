import { DAY, addDays, startOfDay } from "@/lib/instrument-kit"

export const HOUR = 3 // rem per hour in the time grids

/** Rendered boxes are never shorter than this (30 min), so lanes must be computed over that extent. */
export const MIN_EVENT_MS = 30 * 60000

/**
 * Overlap lanes per CLUSTER. Events that chain together by time overlap (A–B, B–C) form one cluster;
 * each cluster gets its own lane count, so an event overlapping nothing spans the full column even when
 * other events that day overlap each other. Within a cluster an event takes the first lane free at its
 * start. Touching intervals (end == start) do not overlap. Returns, per input item and in input order,
 * its lane and its cluster's lane count.
 */
export function assignClusterLanes(items: ReadonlyArray<{ start: number; end: number }>): Array<{ lane: number; lanes: number }> {
  const out: Array<{ lane: number; lanes: number }> = items.map(() => ({ lane: 0, lanes: 1 }))
  const order = items.map((_, i) => i).sort((a, b) => items[a].start - items[b].start || items[a].end - items[b].end || a - b)
  let cluster: number[] = []
  let clusterEnd = -Infinity
  let laneEnds: number[] = []
  const flush = () => { for (const i of cluster) out[i].lanes = Math.max(1, laneEnds.length); cluster = []; laneEnds = [] }
  for (const i of order) {
    const { start, end } = items[i]
    if (cluster.length && start >= clusterEnd) { flush(); clusterEnd = -Infinity }
    let lane = laneEnds.findIndex((t) => t <= start)
    if (lane < 0) { laneEnds.push(end); lane = laneEnds.length - 1 } else laneEnds[lane] = end
    out[i].lane = lane
    cluster.push(i)
    clusterEnd = Math.max(clusterEnd, end)
  }
  flush()
  return out
}

// Rem a timed event box spends on chrome around its title: py-1 (0.5) + the time row (~1) + gap (0.125).
const EVENT_CHROME_REM = 1.625
// Upper bound for one title line. apg's theme sets type-caption to a 1.125rem line height (a plain
// 1rem would let the last line fill the box exactly and be clipped mid-line with no ellipsis); 1.25 stays
// conservative so a taller theme line-height still ellipsizes instead of clipping.
export const EVENT_TITLE_LINE_REM = 1.25
/** Title lines that fit in an event box of `heightHours`; the clamp ellipsizes instead of clipping. */
export function titleLinesFor(heightHours: number): number {
  return Math.max(1, Math.floor((heightHours * HOUR - EVENT_CHROME_REM) / EVENT_TITLE_LINE_REM))
}

export type Continues = "before" | "after" | "both"
export function continuesOf(before: boolean, after: boolean): Continues | undefined {
  return before && after ? "both" : before ? "before" : after ? "after" : undefined
}

/**
 * Day boundaries: UTC, exactly like the rest of the schedule (instrument-kit's `dayKey`/`startOfDay`/`hoursOf`
 * are UTC; format.ts formats in UTC). A "day" is [00:00Z, next 00:00Z).
 */
export interface DaySegment<E> {
  ev: E
  /** UTC midnight of the day this segment belongs to. */
  day: Date
  /** Clipped bounds, inside [day, day + 24h]. */
  start: Date
  end: Date
  continuesBefore: boolean
  continuesAfter: boolean
}

/**
 * The part of a timed event that falls on the day [dayStart, dayEnd), or null. Uses the event's REAL extent
 * (a missing end is a zero-length event; the 30-minute minimum is a rendering concern, not a day-crossing
 * one). An event ending exactly at dayStart has no segment on that day; a zero-length event at t belongs
 * to the day containing t.
 */
export function segmentsForDay<E extends { start: Date; end?: Date | null }>(ev: E, dayStart: Date, dayEnd: Date): DaySegment<E> | null {
  const s = ev.start.getTime()
  const e = Math.max(ev.end ? ev.end.getTime() : s, s)
  const a = dayStart.getTime()
  const b = dayEnd.getTime()
  const overlaps = e > s ? s < b && e > a : s >= a && s < b
  if (!overlaps) return null
  const cs = Math.max(s, a)
  const ce = Math.min(e, b)
  return { ev, day: dayStart, start: new Date(cs), end: new Date(ce), continuesBefore: s < a, continuesAfter: e > b }
}

/** Every per-day segment of an event, first day to last (capped, like the schedule's own day index). */
export function splitByDay<E extends { start: Date; end?: Date | null }>(ev: E, maxDays = 62): DaySegment<E>[] {
  const out: DaySegment<E>[] = []
  const last = ev.end && ev.end > ev.start ? ev.end.getTime() : ev.start.getTime()
  for (let d = startOfDay(ev.start), n = 0; n < maxDays && (d.getTime() < last || n === 0); d = addDays(d, 1), n++) {
    const seg = segmentsForDay(ev, d, addDays(d, 1))
    if (seg) out.push(seg)
  }
  return out
}

/**
 * Events that belong in the all-day row instead of the hour grid: flagged all-day, OR any event of 24h or
 * more (apg's rule, unchanged). Only events SHORTER than 24h that cross midnight (22:00–02:00) are split
 * into per-day grid segments; a multi-day booking stays one chip in the all-day row.
 */
export function isAllDayLike(ev: { allDay: boolean; start: Date; end?: Date | null }): boolean {
  if (ev.allDay) return true
  return !!ev.end && ev.end.getTime() - ev.start.getTime() >= DAY
}

export interface Placed<E> { ev: E; lane: number; n: number; top: number; height: number; continuesBefore: boolean; continuesAfter: boolean }

/**
 * Positions the part of each timed event that falls on `dayStart` in a grid showing hours [h0, h0+span).
 * Events are clipped to the day first (22:00–02:00 is 22:00–24:00 on day 1 and 00:00–02:00 on day 2), then
 * segments entirely outside the visible hours are dropped BEFORE lane assignment (they would otherwise take
 * a lane and shrink visible events); lanes/clusters are computed per day over the clipped segments' rendered
 * extent (at least 30 min), so zero-length events don't stack invisibly.
 */
export function placeTimed<E extends { start: Date; end?: Date | null }>(events: readonly E[], h0: number, span: number, dayStart: Date): Placed<E>[] {
  const ds = startOfDay(dayStart)
  const dayEnd = addDays(ds, 1)
  const hrs = (t: Date) => (t.getTime() - ds.getTime()) / 3600000
  const vis = events
    .flatMap((ev) => { const seg = segmentsForDay(ev, ds, dayEnd); return seg ? [seg] : [] })
    .map((seg) => {
      const endT = Math.max(seg.end.getTime(), seg.start.getTime() + MIN_EVENT_MS)
      return { seg, endT, rawTop: hrs(seg.start) - h0, rawBottom: hrs(seg.end) - h0 }
    })
    // filter on the RENDERED extent (>= 30 min): a no-end/zero-length event starting exactly at h0 has rawBottom == rawTop
    .filter((v) => v.rawTop < span && Math.max(v.rawBottom, v.rawTop + MIN_EVENT_MS / 3600000) > 0)
  const lanes = assignClusterLanes(vis.map((v) => ({ start: v.seg.start.getTime(), end: v.endT })))
  return vis.map((v, i) => {
    // the 30-minute floor must not spill past the grid's end (e.g. a 23:50 event at dayEndHour 24)
    const top = Math.min(Math.max(0, v.rawTop), span - MIN_EVENT_MS / 3600000)
    const bottom = Math.min(span, v.rawBottom)
    return { ev: v.seg.ev, lane: lanes[i].lane, n: lanes[i].lanes, top, height: Math.max(0.5, bottom - top), continuesBefore: v.seg.continuesBefore, continuesAfter: v.seg.continuesAfter }
  })
}
