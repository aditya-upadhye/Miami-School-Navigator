import { useMemo, type ComponentPropsWithoutRef, type CSSProperties, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useChrome } from "@/lib/i18n"
import { get, toDate, DAY, startOfDay, startOfWeek, startOfMonth, addMonths, startOfYear, addDays, F, toneOf, ItemBox, type Accessor } from "@/lib/instrument-kit"

// Events and spans in time, optionally in lanes (one per person, asset, stage…).
// Domain-agnostic: the screen passes rows and says which fields hold the dates,
// the label and the lane.
//   <Timeline rows={Milestone} start="dueOn" end="doneOn" title="name" lane="ownerName"
//     tone={(r) => statusMap.MilestoneStatus[r.status]?.tone} today="2026-10-03" />
// A row with an `end` after its `start` is a span (a bar); otherwise a point (a dot).
// `orientation`: "auto" (default: horizontal from md, a vertical list on a phone) ·
// "horizontal" · "vertical". Deterministic: the span comes from the rows (or
// `range`), "today" is marked only when the `today` prop is given. UTC throughout.
// `axis`: "auto" (default) · "number" · "time". Auto picks "number" when every row's
// `start` (after the accessor) is a finite number or a numeric string ("17") — plain
// counts/steps/sequence numbers, not dates — otherwise "time". In number mode there is
// no calendar: ticks are nice integer steps, `length` gives a span's duration when no
// `end` accessor is passed, and `unitLabel` (e.g. "counts") captions the axis once.
// The "today" marker and month grouping (vertical view) are time-mode only.
export type TimelineOrientation = "auto" | "horizontal" | "vertical"
export type TimelineAxis = "auto" | "number" | "time"
export type TimelineUnit = "day" | "week" | "month" | "quarter" | "year"
export type TimelineTicks = "auto" | TimelineUnit
type AxisMode = "number" | "time"

export interface TimelineProps<Row = unknown> extends Omit<ComponentPropsWithoutRef<"figure">, "id" | "title" | "onSelect"> {
  rows?: Row[]
  start?: Accessor<Row>
  end?: Accessor<Row>
  length?: Accessor<Row>
  title?: Accessor<Row>
  lane?: Accessor<Row>
  id?: Accessor<Row>
  meta?: Accessor<Row>
  tone?: Accessor<Row>
  href?: Accessor<Row>
  orientation?: TimelineOrientation
  axis?: TimelineAxis
  /** [from, to]: dates in time mode, numbers in number mode. */
  range?: [unknown, unknown]
  ticks?: TimelineTicks
  today?: string | number | Date | null
  unitLabel?: string
  selectedId?: string | number | null
  onSelect?: (row: Row) => void
  label?: string
  emptyLabel?: string
}

export interface TimelineEvent<Row = unknown> {
  row: Row
  key: string
  start: number | Date
  end: number | Date | null
  title: string
  lane: unknown
  meta: unknown
  tone: unknown
  href: string | undefined
}

interface UnitDef {
  floor: (d: Date) => Date
  next: (d: Date) => Date
  fmt: (d: Date) => string
}

// Numbers and Dates both appear as event positions (number mode / time mode).
const tv = (v: number | Date): number => (typeof v === "number" ? v : v.getTime())
const dv = (v: number | Date): Date => (typeof v === "number" ? new Date(v) : v)

const UNIT: Record<TimelineUnit, UnitDef> = {
  day: { floor: startOfDay, next: (d: Date) => addDays(d, 1), fmt: (d: Date) => F.dateShort.format(d) },
  week: { floor: (d: Date) => startOfWeek(d, 1), next: (d: Date) => addDays(d, 7), fmt: (d: Date) => F.dateShort.format(d) },
  month: { floor: startOfMonth, next: (d: Date) => addMonths(d, 1), fmt: (d: Date) => (d.getUTCMonth() === 0 ? F.monthShortYear.format(d) : F.monthShort.format(d)) },
  quarter: { floor: (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1)), next: (d: Date) => addMonths(d, 3), fmt: (d: Date) => (d.getUTCMonth() === 0 ? F.monthShortYear.format(d) : F.monthShort.format(d)) },
  year: { floor: startOfYear, next: (d: Date) => new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1)), fmt: (d: Date) => F.year.format(d) },
}
const pickUnit = (ms: number): TimelineUnit => (ms <= 16 * DAY ? "day" : ms <= 120 * DAY ? "week" : ms <= 800 * DAY ? "month" : ms <= 2200 * DAY ? "quarter" : "year")
const ROW = 2 // rem per packed row in a lane

// Numeric axis: counts, steps, sequence numbers — no calendar involved.
const toNum = (v: unknown): number | null => {
  if (v == null || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).trim())
  return Number.isFinite(n) ? n : null
}
// A plain number, or a numeric string with no date-like punctuation ("17", not
// "2026-10-03"), is numeric; anything else (including unparsed strings) is not.
const isNumericLike = (v: unknown): boolean => {
  if (typeof v === "number") return Number.isFinite(v)
  if (typeof v !== "string") return false
  const s = v.trim()
  return s !== "" && /^-?\d+(\.\d+)?$/.test(s)
}
function detectAxis<Row>(rows: Row[], start: Accessor<Row>): "number" | "time" {
  let any = false
  for (const row of rows) {
    const v = get(row, start)
    if (v == null || v === "") continue
    any = true
    if (!isNumericLike(v)) return "time"
  }
  return any ? "number" : "time"
}
// "Nice" integer step (1,2,5,10,20,50…) so a range gets roughly `target` ticks.
function niceStep(range: number, target = 9): number {
  const raw = Math.max(1, range / target)
  let mag = 1
  while (mag * 10 <= raw) mag *= 10
  const norm = raw / mag
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
}

export function Timeline<Row = unknown>({
  rows = [],
  start = "start",
  end,
  length,
  title = "title",
  lane,
  id = "id",
  meta,
  tone,
  href,
  orientation = "auto",
  axis = "auto",
  range,
  ticks = "auto",
  today,
  unitLabel,
  selectedId,
  onSelect,
  label: labelProp,
  emptyLabel: emptyLabelProp,
  className,
  ...rest
}: TimelineProps<Row>) {
  const chrome = useChrome()
  const label = labelProp ?? chrome("kit.timeline.label")
  const emptyLabel = emptyLabelProp ?? chrome("kit.timeline.empty")
  const axisMode = useMemo(() => (axis === "number" || axis === "time" ? axis : detectAxis(rows, start)), [rows, start, axis])
  const isNum = axisMode === "number"

  const events = useMemo<TimelineEvent<Row>[]>(() => rows.map((row, i): TimelineEvent<Row> | null => {
    let s: number | Date | null, e: number | Date | null
    if (isNum) {
      s = toNum(get(row, start))
      if (s == null) return null
      if (end) e = toNum(get(row, end))
      else if (length) { const len = toNum(get(row, length)); e = len != null ? s + len : null }
      else e = null
    } else {
      s = toDate(get(row, start))
      if (!s) return null
      e = end ? toDate(get(row, end)) : null
    }
    return {
      row, key: String(get(row, id) ?? i), start: s, end: e != null && tv(e) > tv(s) ? e : null,
      title: String(get(row, title) ?? ""), lane: lane ? (get(row, lane) ?? "—") : null,
      meta: meta ? get(row, meta) : undefined, tone: tone ? get(row, tone) : undefined, href: href ? (get(row, href) as string | undefined) : undefined,
    }
  }).filter((ev): ev is TimelineEvent<Row> => ev !== null).sort((a, b) => tv(a.start) - tv(b.start)), [rows, start, end, length, title, lane, id, meta, tone, href, isNum])

  const todayD = isNum ? null : toDate(today)
  const shared = { events, todayD, selectedId, onSelect, emptyLabel, axisMode, unitLabel }
  return (
    <figure data-slot="timeline" aria-label={label} className={cn("m-0 min-w-0", className)} {...rest}>
      {events.length === 0 ? <p className="type-body text-text-muted">{emptyLabel}</p> : (
        <>
          {orientation !== "vertical" ? (
            <div className={cn(orientation === "auto" && "hidden md:block")}>
              <Horizontal {...shared} range={range} ticks={ticks} hasLanes={Boolean(lane)} />
            </div>
          ) : null}
          {orientation !== "horizontal" ? (
            <div className={cn(orientation === "auto" && "md:hidden")}>
              <Vertical {...shared} />
            </div>
          ) : null}
        </>
      )}
    </figure>
  )
}

function whenOf<Row>(ev: TimelineEvent<Row>, axisMode: AxisMode, unitLabel?: string): string {
  if (axisMode === "number") {
    if (ev.end != null) return `${String(ev.start)}–${String(ev.end)}`
    return unitLabel ? `${unitLabel} ${String(ev.start)}` : String(ev.start)
  }
  return ev.end ? `${F.date.format(dv(ev.start))} – ${F.date.format(dv(ev.end))}` : F.date.format(dv(ev.start))
}

interface MarkProps<Row> {
  ev: TimelineEvent<Row>
  onSelect?: (row: Row) => void
  selectedId?: string | number | null
  axisMode: AxisMode
  unitLabel?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}

function Mark<Row>({ ev, onSelect, selectedId, axisMode, unitLabel, className, style, children }: MarkProps<Row>) {
  const selected = selectedId != null && String(selectedId) === ev.key
  return (
    <ItemBox href={ev.href} onSelect={onSelect} row={ev.row} data-event-id={ev.key} aria-current={selected ? "true" : undefined}
      aria-label={`${ev.title}, ${whenOf(ev, axisMode, unitLabel)}${ev.lane != null ? `, ${ev.lane}` : ""}`}
      className={cn("outline-none focus-visible:ring-2 focus-visible:ring-ring", selected && "ring-2 ring-ring", className)} style={style}>
      {children}
    </ItemBox>
  )
}

interface PaneProps<Row> {
  events: TimelineEvent<Row>[]
  todayD: Date | null
  selectedId?: string | number | null
  onSelect?: (row: Row) => void
  axisMode: AxisMode
  unitLabel?: string
}

function Horizontal<Row>({ events, todayD, selectedId, onSelect, range, ticks, hasLanes, axisMode, unitLabel }: PaneProps<Row> & { range?: [unknown, unknown]; ticks: TimelineTicks; hasLanes: boolean }) {
  const isNum = axisMode === "number"
  let lo: number, hi: number, unit: UnitDef | undefined
  const tickValues: (number | Date)[] = []
  if (isNum) {
    const rangeLo = range && isNumericLike(range[0]) ? Number(range[0]) : tv(events[0].start)
    const rangeHi = range && isNumericLike(range[1]) ? Number(range[1]) : events.reduce((m, e) => Math.max(m, tv(e.end ?? e.start)), -Infinity)
    const spanRaw = Math.max(1, rangeHi - rangeLo)
    lo = rangeLo - spanRaw * 0.03
    hi = rangeHi + spanRaw * 0.06
    const step = niceStep(hi - lo)
    for (let v = Math.ceil(lo / step) * step; v < hi && tickValues.length < 400; v += step) tickValues.push(v)
  } else {
    const lo0 = toDate(range?.[0]) ?? dv(events[0].start)
    const hiRange = toDate(range?.[1])
    const hiT = hiRange ? hiRange.getTime() : events.reduce((m, e) => Math.max(m, dv(e.end ?? e.start).getTime()), 0)
    const spanRaw = Math.max(DAY, hiT - lo0.getTime())
    lo = lo0.getTime() - spanRaw * 0.03
    hi = hiT + spanRaw * 0.06
    const u: UnitDef = UNIT[ticks !== "auto" && UNIT[ticks] ? ticks : pickUnit(hi - lo)]
    unit = u
    for (let d = u.next(u.floor(new Date(lo))); d.getTime() < hi && tickValues.length < 400; d = u.next(d)) tickValues.push(d)
  }
  const pct = (v: number | Date): number => ((tv(v) - lo) / (hi - lo)) * 100
  const fmtTick = (v: number | Date): string => (isNum || !unit ? String(v) : unit.fmt(dv(v)))
  const tickKey = (v: number | Date): number => tv(v)
  const every = isNum ? 1 : Math.max(1, Math.ceil(tickValues.length / 10))

  const laneNames = hasLanes ? [...new Set(events.map((e) => String(e.lane)))] : [""]
  const LABEL_PCT = 16 // room a point's label is assumed to take, for packing
  const lanes = laneNames.map((name) => {
    const evs = events.filter((e) => !hasLanes || String(e.lane) === name)
    const rowsEnd: number[] = []
    const placed = evs.map((ev) => {
      const x = pct(ev.start)
      const w = ev.end ? Math.max(0.8, pct(ev.end) - x) : 0
      const flip = !ev.end && x > 100 - LABEL_PCT
      const occL = flip ? x - LABEL_PCT : x
      const occR = ev.end ? Math.max(x + w, x + 6) : flip ? x + 1 : x + LABEL_PCT
      let r = rowsEnd.findIndex((endX) => endX <= occL)
      if (r < 0) { rowsEnd.push(occR); r = rowsEnd.length - 1 } else rowsEnd[r] = occR
      return { ev, x, w, r, flip }
    })
    return { name, placed, rows: Math.max(1, rowsEnd.length) }
  })
  const todayX = todayD ? pct(todayD) : null

  return (
    <div className="min-w-0 overflow-x-auto">
      <div className={cn("grid min-w-[40rem]", hasLanes ? "grid-cols-[minmax(6rem,10rem)_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)]")}>
        {hasLanes ? <span /> : null}
        <div className="relative h-6 border-b border-border-strong" aria-hidden="true">
          {tickValues.map((d, i) => (
            <span key={tickKey(d)} className="absolute bottom-0 h-2 border-l border-border-strong" style={{ left: `${pct(d)}%` }}>
              {i % every === 0 ? <span className="absolute bottom-2.5 left-1 whitespace-nowrap type-caption tabular-nums text-text-muted">{fmtTick(d)}</span> : null}
            </span>
          ))}
        </div>
        {lanes.map((ln) => (
          <div key={ln.name} className="contents">
            {hasLanes ? <div className="flex min-w-0 items-start border-b border-border py-2 pr-3"><span className="truncate type-row-title text-foreground">{ln.name}</span></div> : null}
            <div className="relative border-b border-border" style={{ height: `${ln.rows * ROW + 1}rem` }}>
              {tickValues.map((d) => <span key={tickKey(d)} aria-hidden="true" className="absolute inset-y-0 border-l border-border" style={{ left: `${pct(d)}%` }} />)}
              {todayX != null && todayX >= 0 && todayX <= 100 ? <span aria-hidden="true" className="absolute inset-y-0 z-10 border-l-2 border-primary" style={{ left: `${todayX}%` }} /> : null}
              <ol>
                {ln.placed.map(({ ev, x, w, r, flip }) => {
                  const t = toneOf(ev.tone)
                  const top = `${0.5 + r * ROW}rem`
                  return (
                    <li key={ev.key}>
                      {ev.end ? (
                        <Mark ev={ev} onSelect={onSelect} selectedId={selectedId} axisMode={axisMode} unitLabel={unitLabel}
                          className={cn("absolute flex h-6 min-w-0 items-center overflow-hidden rounded-sm border-l-2 px-1.5 text-left", t.soft, t.edge)}
                          style={{ top, left: `${x}%`, width: `${w}%` }}>
                          <span className="truncate type-caption">{ev.title}</span>
                        </Mark>
                      ) : (
                        <Mark ev={ev} onSelect={onSelect} selectedId={selectedId} axisMode={axisMode} unitLabel={unitLabel}
                          className={cn("absolute flex h-6 max-w-[16%] min-w-0 items-center gap-1.5 rounded-sm text-left", flip && "flex-row-reverse")}
                          style={flip ? { top, right: `${100 - x}%`, transform: "translateX(0.375rem)" } : { top, left: `${x}%`, transform: "translateX(-0.375rem)" }}>
                          <span className={cn("size-3 shrink-0 rounded-full border-2 border-card", t.dot)} aria-hidden="true" />
                          <span className="min-w-0 truncate type-caption text-foreground">{ev.title}</span>
                        </Mark>
                      )}
                    </li>
                  )
                })}
              </ol>
            </div>
          </div>
        ))}
      </div>
      {todayX != null && todayX >= 0 && todayX <= 100 ? <p className="mt-1 type-caption text-text-muted"><span className="mr-1.5 inline-block h-3 border-l-2 border-primary align-middle" aria-hidden="true" />Today, {F.date.format(todayD ?? undefined)}</p> : null}
      {isNum && unitLabel ? <p className="mt-1 type-caption text-text-muted">{unitLabel}</p> : null}
    </div>
  )
}

function Vertical<Row>({ events, todayD, selectedId, onSelect, axisMode, unitLabel }: PaneProps<Row>) {
  const monthly = axisMode !== "number" && events.length > 1 && tv(events[events.length - 1].start) - tv(events[0].start) > 60 * DAY
  const groups: { name: string; evs: TimelineEvent<Row>[] }[] = []
  for (const ev of events) {
    const g = monthly ? F.monthYear.format(dv(ev.start)) : ""
    if (!groups.length || groups[groups.length - 1].name !== g) groups.push({ name: g, evs: [] })
    groups[groups.length - 1].evs.push(ev)
  }
  const todayKey = todayD ? startOfDay(todayD).getTime() : null
  return (
    <div className="grid min-w-0 gap-(--component-gap)">
      {groups.map((g) => (
        <section key={g.name || "all"} className="grid min-w-0 gap-2">
          {g.name ? <h4 className="type-eyebrow text-text-muted">{g.name}</h4> : null}
          <ol className="grid min-w-0">
            {g.evs.map((ev, i) => {
              const t = toneOf(ev.tone)
              const last = i === g.evs.length - 1
              const past = todayKey != null && startOfDay(dv(ev.end ?? ev.start)).getTime() < todayKey
              return (
                <li key={ev.key} className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] gap-x-3">
                  <span className="flex flex-col items-center" aria-hidden="true">
                    <span className={cn("mt-1.5 size-3 shrink-0 rounded-full", t.dot, past && "opacity-60")} />
                    {!last ? <span className="w-px flex-1 bg-border" /> : null}
                  </span>
                  <Mark ev={ev} onSelect={onSelect} selectedId={selectedId} axisMode={axisMode} unitLabel={unitLabel}
                    className={cn("grid min-w-0 gap-0.5 rounded-sm pb-4 text-left", (ev.href || onSelect) && "hover:bg-muted")}>
                    <span className="type-mono-id tabular-nums text-text-muted">{whenOf(ev, axisMode, unitLabel)}</span>
                    <span className="type-row-title text-foreground">{ev.title}</span>
                    {ev.lane != null || (ev.meta != null && ev.meta !== "") ? (
                      <span className="truncate type-meta text-text-muted">{[ev.lane, ev.meta].filter((x) => x != null && x !== "").join(" · ")}</span>
                    ) : null}
                  </Mark>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
