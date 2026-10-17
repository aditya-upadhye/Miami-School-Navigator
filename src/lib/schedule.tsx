import { useMemo, useState, type ComponentPropsWithoutRef, type CSSProperties, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  get, toDate, isDateOnly, DAY, dayKey, startOfDay, addDays, startOfWeek, startOfMonth, addMonths, hoursOf,
  F, toneOf, ItemBox, ChevronIcon, type Accessor,
} from "@/lib/instrument-kit"
import { useChrome } from "@/lib/i18n"
import { HOUR, placeTimed, titleLinesFor, segmentsForDay, continuesOf, isAllDayLike, type Continues } from "@/lib/schedule-layout"

// A calendar of timed things: month grid, week and day time grids, and an agenda.
// Domain-agnostic: the screen passes its rows and says which fields hold what.
//   <Schedule rows={Booking} start="startsAt" end="endsAt" title="title"
//     tone={(r) => statusMap.BookingStatus[r.status]?.tone} href={(r) => href("booking", { id: r.id })}
//     date="2026-10-01" today="2026-10-03" defaultView="week" />
// Deterministic: the visible period comes from `date` (else `today`, else the first
// event); "today" is only marked when the `today` prop is given. All dates are UTC.
// On a phone the week view reads as that week's agenda, and the month grid shows
// dots with the selected day's (or the month's) list beneath.
export type ScheduleView = "month" | "week" | "day" | "agenda"

export interface ScheduleResource {
  id: string | number
  label: string
}
export interface ScheduleSlot {
  resource: string
  start: Date
}

export interface ScheduleProps<Row = unknown> extends Omit<ComponentPropsWithoutRef<"section">, "id" | "title" | "onSelect" | "resource"> {
  rows?: Row[]
  start?: Accessor<Row>
  end?: Accessor<Row>
  title?: Accessor<Row>
  id?: Accessor<Row>
  allDay?: Accessor<Row>
  meta?: Accessor<Row>
  tone?: Accessor<Row>
  href?: Accessor<Row>
  resource?: Accessor<Row>
  resources?: ScheduleResource[]
  resourceLabel?: Accessor<Row>
  onSlotSelect?: (slot: ScheduleSlot) => void
  view?: ScheduleView
  defaultView?: ScheduleView
  views?: ScheduleView[]
  onViewChange?: (view: ScheduleView) => void
  date?: string | number | Date | null
  onDateChange?: (day: string) => void
  today?: string | number | Date | null
  selectedId?: string | number | null
  onSelect?: (row: Row) => void
  weekStartsOn?: number
  dayStartHour?: number
  dayEndHour?: number
  agendaDays?: number
  label?: string
  emptyLabel?: string
}

export interface ScheduleEvent<Row = unknown> {
  row: Row
  key: string
  start: Date
  end: Date | null
  allDay: boolean
  title: string
  meta: unknown
  tone: unknown
  href: string | undefined
  resourceId: string | undefined
  resourceLabel: string | undefined
}

interface ResourceCol {
  id: string
  label: string
}

interface Ctx<Row> {
  byDay: Map<string, ScheduleEvent<Row>[]>
  todayKey: string | null
  todayD: Date | null
  selectedId?: string | number | null
  onSelect?: (row: Row) => void
  emptyLabel: string
  dayStartHour: number
  dayEndHour: number
}

const VIEW_KEY: Record<string, string> = { month: "kit.schedule.month", week: "kit.schedule.week", day: "kit.schedule.day", agenda: "kit.schedule.agenda" }
export function Schedule<Row = unknown>({
  rows = [],
  start = "start",
  end = "end",
  title = "title",
  id = "id",
  allDay = "allDay",
  meta,
  tone,
  href,
  resource,
  resources,
  resourceLabel,
  onSlotSelect,
  view: viewProp,
  defaultView = "month",
  views = ["month", "week", "day", "agenda"],
  onViewChange,
  date,
  onDateChange,
  today,
  selectedId,
  onSelect,
  weekStartsOn = 0,
  dayStartHour = 7,
  dayEndHour = 21,
  agendaDays = 14,
  label: labelProp,
  emptyLabel: emptyLabelProp,
  className,
  ...rest
}: ScheduleProps<Row>) {
  const chrome = useChrome()
  const label = labelProp ?? chrome("kit.schedule.label")
  const emptyLabel = emptyLabelProp ?? chrome("kit.schedule.empty")
  const events = useMemo<ScheduleEvent<Row>[]>(() => rows.map((row, i): ScheduleEvent<Row> | null => {
    const rawStart = get(row, start)
    const s = toDate(rawStart)
    if (!s) return null
    const e = toDate(get(row, end))
    const whole = Boolean(get(row, allDay)) || isDateOnly(rawStart)
    return {
      row, key: String(get(row, id) ?? i), start: s, end: e && e > s ? e : null, allDay: whole,
      title: String(get(row, title) ?? ""), meta: meta ? get(row, meta) : undefined,
      tone: tone ? get(row, tone) : undefined, href: href ? (get(row, href) as string | undefined) : undefined,
      resourceId: resource ? String(get(row, resource) ?? "") : undefined,
      resourceLabel: resource ? String(get(row, resourceLabel ?? resource) ?? "") : undefined,
    }
  }).filter((ev): ev is ScheduleEvent<Row> => ev !== null).sort((a, b) => a.start.getTime() - b.start.getTime()), [rows, start, end, title, id, allDay, meta, tone, href, resource, resourceLabel])

  // Resource columns for the day view: explicit `resources` gives order + labels,
  // otherwise derive distinct resources from the rows in first-seen order.
  const resourceCols = useMemo<ResourceCol[] | null>(() => {
    if (!resource) return null
    if (resources) return resources.map((r) => ({ id: String(r.id), label: String(r.label) }))
    const seen = new Map<string, string>()
    for (const ev of events) {
      if (ev.resourceId && !seen.has(ev.resourceId)) seen.set(ev.resourceId, ev.resourceLabel ?? "")
    }
    return Array.from(seen, ([rid, rlabel]) => ({ id: rid, label: rlabel }))
  }, [resource, resources, events])

  const todayD = toDate(today)
  const initialAnchor = toDate(date) ?? todayD ?? events[0]?.start ?? new Date(0)
  const [ownView, setOwnView] = useState<ScheduleView>(views.includes(defaultView) ? defaultView : views[0])
  const [ownAnchor, setOwnAnchor] = useState(startOfDay(initialAnchor))
  const [pickedDay, setPickedDay] = useState<string | null>(null)
  const view = viewProp ?? ownView
  const anchor = date !== undefined && onDateChange ? startOfDay(initialAnchor) : ownAnchor
  const setView = (v: ScheduleView) => { setOwnView(v); onViewChange?.(v) }
  const setAnchor = (d: Date) => { setOwnAnchor(d); setPickedDay(null); onDateChange?.(dayKey(d)) }

  const step = (dir: number) => {
    if (view === "month") setAnchor(addMonths(anchor, dir))
    else if (view === "week") setAnchor(addDays(anchor, 7 * dir))
    else if (view === "day") setAnchor(addDays(anchor, dir))
    else setAnchor(addDays(anchor, agendaDays * dir))
  }

  const byDay = useMemo(() => {
    const m = new Map<string, ScheduleEvent<Row>[]>()
    for (const ev of events) {
      const first = startOfDay(ev.start)
      const last = ev.end ? startOfDay(new Date(ev.end.getTime() - 1)) : first
      for (let d = first, n = 0; d <= last && n < 62; d = addDays(d, 1), n++) {
        const k = dayKey(d)
        const list = m.get(k)
        if (list) list.push(ev)
        else m.set(k, [ev])
      }
    }
    return m
  }, [events])

  const todayKey = todayD ? dayKey(todayD) : null
  const ctx: Ctx<Row> = { byDay, todayKey, todayD, selectedId, onSelect, emptyLabel, dayStartHour, dayEndHour }

  let heading: string
  if (view === "month") heading = F.monthYear.format(anchor)
  else if (view === "week") { const ws = startOfWeek(anchor, weekStartsOn); heading = `${F.dateShort.format(ws)} – ${F.date.format(addDays(ws, 6))}` }
  else if (view === "day") heading = F.dayLong.format(anchor)
  else heading = `${F.dateShort.format(anchor)} – ${F.date.format(addDays(anchor, agendaDays - 1))}`

  return (
    <section data-slot="schedule" aria-label={label} className={cn("grid min-w-0 gap-(--component-gap)", className)} {...rest}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" variant="outline" size="icon-sm" aria-label={chrome("kit.schedule.previous")} onClick={() => step(-1)}><ChevronIcon dir="left" className="size-4" /></Button>
          <Button type="button" variant="outline" size="icon-sm" aria-label={chrome("kit.schedule.next")} onClick={() => step(1)}><ChevronIcon className="size-4" /></Button>
          {todayD ? <Button type="button" variant="outline" size="sm" onClick={() => setAnchor(startOfDay(todayD))}>{chrome("kit.schedule.today")}</Button> : null}
          <h3 className="min-w-0 truncate type-card-title" aria-live="polite">{heading}</h3>
        </div>
        {views.length > 1 ? (
          <div role="group" aria-label={chrome("kit.schedule.view")} className="inline-flex shrink-0 rounded-sm border border-border-strong p-0.5">
            {views.map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                className={cn("rounded-sm px-2.5 py-1 type-caption transition-colors", view === v ? "bg-primary text-primary-foreground" : "text-text-muted hover:bg-muted hover:text-foreground")}>
                {VIEW_KEY[v] ? chrome(VIEW_KEY[v]) : v}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {view === "month" ? <MonthGrid anchor={anchor} weekStartsOn={weekStartsOn} pickedDay={pickedDay} onPickDay={setPickedDay} {...ctx} /> : null}
      {view === "week" ? (
        <>
          <div className="hidden md:block"><TimeGrid days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor, weekStartsOn), i))} {...ctx} /></div>
          <div className="md:hidden"><Agenda from={startOfWeek(anchor, weekStartsOn)} days={7} {...ctx} /></div>
        </>
      ) : null}
      {view === "day" ? (
        resourceCols ? (
          <ResourceTimeGrid day={anchor} resourceCols={resourceCols} onSlotSelect={onSlotSelect} {...ctx} />
        ) : <TimeGrid days={[anchor]} {...ctx} />
      ) : null}
      {view === "agenda" ? <Agenda from={anchor} days={agendaDays} {...ctx} /> : null}
    </section>
  )
}

interface EventItemProps<Row> {
  ev: ScheduleEvent<Row>
  onSelect?: (row: Row) => void
  selectedId?: string | number | null
  compact?: boolean
  showTime?: boolean
  className?: string
  style?: CSSProperties
  /** Clamp the title to this many lines (stacked timed layout); omitted = single truncated line. */
  titleLines?: number
  /** This is one day's slice of an event that crosses midnight: which side(s) were cut. */
  continues?: Continues
  /** Direction the cut edge faces: the time grids stack vertically, month chips run horizontally. */
  axis?: "v" | "h"
}

/** Cut edges are square so a continuation reads as "the same event goes on". */
const CUT: Record<Continues, Record<"v" | "h", string>> = {
  before: { v: "rounded-t-none", h: "rounded-l-none border-l-0" },
  after: { v: "rounded-b-none", h: "rounded-r-none" },
  both: { v: "rounded-t-none rounded-b-none", h: "rounded-none border-l-0" },
}

/** Which side(s) of an event are cut on the UTC day starting at `dayStart` (undefined = whole or all-day). */
function continuesOn<Row>(ev: ScheduleEvent<Row>, dayStart: Date): Continues | undefined {
  if (ev.allDay) return undefined
  const seg = segmentsForDay(ev, dayStart, addDays(dayStart, 1))
  return seg ? continuesOf(seg.continuesBefore, seg.continuesAfter) : undefined
}

/** Whole UTC days between the event's start day and its end ("+1" when it ends the next day). */
function endOffsetDays<Row>(ev: ScheduleEvent<Row>): number {
  if (ev.allDay || !ev.end) return 0
  return Math.round((startOfDay(new Date(ev.end.getTime() - 1)).getTime() - startOfDay(ev.start).getTime()) / DAY)
}

/** For an all-day-row chip: cut only where the event runs past the VISIBLE range (first/last shown day). */
function rangeCut<Row>(ev: ScheduleEvent<Row>, d: Date, days: Date[]): Continues | undefined {
  if (ev.allDay) return undefined
  const before = dayKey(d) === dayKey(days[0]) && ev.start < startOfDay(days[0])
  const after = dayKey(d) === dayKey(days[days.length - 1]) && !!ev.end && ev.end.getTime() > addDays(startOfDay(days[days.length - 1]), 1).getTime()
  return continuesOf(before, after)
}

function EventItem<Row>({ ev, onSelect, selectedId, compact = false, showTime = true, className, style, titleLines, continues, axis = "v" }: EventItemProps<Row>) {
  const chrome = useChrome()
  const t = toneOf(ev.tone)
  const when = ev.allDay ? chrome("kit.schedule.allDay") : `${F.time.format(ev.start)}${ev.end ? ` – ${F.time.format(ev.end)}` : ""}`
  const selected = selectedId != null && String(selectedId) === ev.key
  return (
    <ItemBox href={ev.href} onSelect={onSelect} row={ev.row}
      data-event-id={ev.key}
      data-continues={continues}
      aria-current={selected ? "true" : undefined}
      aria-label={`${ev.title}, ${F.day.format(ev.start)}, ${when}`}
      className={cn(
        "flex w-full min-w-0 items-center gap-1.5 rounded-sm border-l-2 px-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
        t.soft, t.edge, compact ? "py-0.5" : "py-1",
        (ev.href || onSelect) && "transition-colors hover:brightness-95",
        selected && "ring-2 ring-ring",
        continues && CUT[continues][axis],
        className,
      )}
      style={style}
    >
      {showTime && !ev.allDay ? <span className="max-w-full truncate type-mono-id tabular-nums">{continues ? when : F.time.format(ev.start)}</span> : null}
      {titleLines != null ? (
        <span className="min-w-0 max-w-full whitespace-normal break-words type-caption" style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: titleLines, overflow: "hidden" }}>{ev.title}</span>
      ) : <span className="min-w-0 truncate type-caption">{ev.title}</span>}
    </ItemBox>
  )
}

interface MonthGridProps<Row> extends Ctx<Row> {
  anchor: Date
  weekStartsOn: number
  pickedDay: string | null
  onPickDay: (k: string | null) => void
}

function MonthGrid<Row>({ anchor, weekStartsOn, byDay, todayKey, selectedId, onSelect, emptyLabel, pickedDay, onPickDay }: MonthGridProps<Row>) {
  const chrome = useChrome()
  const first = startOfMonth(anchor)
  const gridStart = startOfWeek(first, weekStartsOn)
  const next = addMonths(first, 1)
  const weeks = Math.ceil((next.getTime() - gridStart.getTime()) / DAY / 7)
  const month = first.getUTCMonth()
  const MAX = 3
  const listDays = pickedDay ? [pickedDay] : Array.from({ length: Math.round((next.getTime() - first.getTime()) / DAY) }, (_, i) => dayKey(addDays(first, i)))
  return (
    <div className="grid min-w-0 gap-(--component-gap)">
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            {Array.from({ length: 7 }, (_, i) => addDays(gridStart, i)).map((d) => (
              <th key={dayKey(d)} scope="col" className="pb-1 text-left type-eyebrow text-text-muted">
                <abbr title={F.weekday.format(d)} className="no-underline"><span className="md:hidden">{F.weekdayNarrow.format(d)}</span><span className="hidden md:inline">{F.weekday.format(d)}</span></abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: weeks }, (_, w) => (
            <tr key={w}>
              {Array.from({ length: 7 }, (_, i) => {
                const d = addDays(gridStart, w * 7 + i)
                const k = dayKey(d)
                const evs = byDay.get(k) ?? []
                const inMonth = d.getUTCMonth() === month
                const isToday = k === todayKey
                const picked = pickedDay === k
                return (
                  <td key={k} className={cn("h-12 border border-border p-1 align-top md:h-28", inMonth ? "bg-card" : "bg-surface-sunken")}>
                    <div className="flex h-full min-w-0 flex-col gap-1">
                      <button type="button" onClick={() => onPickDay(picked ? null : k)} aria-pressed={picked}
                        aria-label={`${F.dayLong.format(d)}, ${evs.length ? chrome("kit.schedule.nScheduled", { count: evs.length }) : chrome("kit.schedule.nothingScheduled")}`}
                        className={cn("inline-flex size-6 items-center justify-center self-start rounded-full type-mono-id tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isToday ? "bg-primary text-primary-foreground" : inMonth ? "text-foreground" : "text-text-subtle",
                          picked && !isToday && "ring-2 ring-ring")}>
                        {d.getUTCDate()}
                      </button>
                      {evs.length ? (
                        <span className="flex flex-wrap gap-0.5 md:hidden" aria-hidden="true">
                          {evs.slice(0, 4).map((ev) => <span key={ev.key} className={cn("size-1.5 rounded-full", toneOf(ev.tone).dot)} />)}
                        </span>
                      ) : null}
                      <ul className="hidden min-w-0 flex-col gap-0.5 md:flex">
                        {evs.slice(0, MAX).map((ev) => <li key={ev.key} className="min-w-0"><EventItem ev={ev} onSelect={onSelect} selectedId={selectedId} compact axis="h" continues={continuesOn(ev, d)} /></li>)}
                        {evs.length > MAX ? (
                          <li><button type="button" onClick={() => onPickDay(k)} className="type-caption text-text-link hover:underline">{chrome("kit.schedule.more", { count: evs.length - MAX })}</button></li>
                        ) : null}
                      </ul>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className={cn(!pickedDay && "md:hidden")}>
        <DayList keys={listDays} byDay={byDay} todayKey={todayKey} selectedId={selectedId} onSelect={onSelect} emptyLabel={emptyLabel} hideEmptyDays={!pickedDay} />
      </div>
    </div>
  )
}

interface DayListProps<Row> {
  keys: string[]
  byDay: Map<string, ScheduleEvent<Row>[]>
  todayKey: string | null
  selectedId?: string | number | null
  onSelect?: (row: Row) => void
  emptyLabel: string
  hideEmptyDays?: boolean
  /** List each event once, under its start day (or the first listed day if it started earlier). */
  startOnly?: boolean
}

function DayList<Row>({ keys, byDay, todayKey, selectedId, onSelect, emptyLabel, hideEmptyDays, startOnly }: DayListProps<Row>) {
  const chrome = useChrome()
  const dayEvents = (k: string) => {
    const all = byDay.get(k) ?? []
    return startOnly ? all.filter((ev) => dayKey(ev.start) === k || (k === keys[0] && dayKey(ev.start) < k)) : all
  }
  const shown = hideEmptyDays ? keys.filter((k) => dayEvents(k).length) : keys
  if (!shown.length) return <p className="type-body text-text-muted">{emptyLabel}</p>
  return (
    <ol className="grid gap-(--component-gap)">
      {shown.map((k) => {
        const d = new Date(`${k}T00:00:00Z`)
        const evs = dayEvents(k)
        return (
          <li key={k} className="grid min-w-0 gap-1.5">
            <h4 className={cn("type-eyebrow", k === todayKey ? "text-foreground" : "text-text-muted")}>{F.day.format(d)}{k === todayKey ? ` · ${chrome("kit.schedule.today")}` : ""}</h4>
            {evs.length ? (
              <ul className="grid min-w-0 gap-1">
                {evs.map((ev) => (
                  <li key={ev.key} className="min-w-0">
                    <AgendaRow ev={ev} onSelect={onSelect} selectedId={selectedId} continues={startOnly ? (dayKey(ev.start) < k ? "before" : undefined) : continuesOn(ev, d)} showStartDate={startOnly && dayKey(ev.start) < k} />
                  </li>
                ))}
              </ul>
            ) : <p className="type-caption text-text-muted">{emptyLabel}</p>}
          </li>
        )
      })}
    </ol>
  )
}

function AgendaRow<Row>({ ev, onSelect, selectedId, continues, showStartDate }: { ev: ScheduleEvent<Row>; onSelect?: (row: Row) => void; selectedId?: string | number | null; continues?: Continues; showStartDate?: boolean }) {
  const chrome = useChrome()
  const t = toneOf(ev.tone)
  const selected = selectedId != null && String(selectedId) === ev.key
  const when = ev.allDay ? chrome("kit.schedule.allDay") : `${F.time.format(ev.start)}${ev.end ? ` – ${F.time.format(ev.end)}` : ""}`
  const label = showStartDate && !ev.allDay ? `${F.dateShort.format(ev.start)}, ${when}` : when
  const endOffset = endOffsetDays(ev)
  return (
    <ItemBox href={ev.href} onSelect={onSelect} row={ev.row} data-event-id={ev.key} data-continues={continues} aria-current={selected ? "true" : undefined}
      className={cn("grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 rounded-sm border border-border bg-card px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
        (ev.href || onSelect) && "transition-colors hover:bg-muted", selected && "ring-2 ring-ring")}>
      <span className="flex items-center gap-2 whitespace-nowrap type-mono-id tabular-nums text-text-muted">
        <span className={cn("size-2 shrink-0 rounded-full", t.dot)} aria-hidden="true" />{label}
        {endOffset > 0 ? <span data-end-offset={endOffset} className="type-caption">+{endOffset}</span> : null}
      </span>
      <span className="grid min-w-0">
        <span className="truncate type-row-title text-foreground">{ev.title}</span>
        {ev.resourceLabel ? <span className="truncate type-caption text-text-muted">{ev.resourceLabel}</span> : null}
        {ev.meta != null && ev.meta !== "" ? <span className="truncate type-meta text-text-muted">{ev.meta as ReactNode}</span> : null}
      </span>
    </ItemBox>
  )
}

function Agenda<Row>({ from, days, byDay, todayKey, selectedId, onSelect, emptyLabel }: Ctx<Row> & { from: Date; days: number }) {
  const keys = Array.from({ length: days }, (_, i) => dayKey(addDays(from, i)))
  return <DayList keys={keys} byDay={byDay} todayKey={todayKey} selectedId={selectedId} onSelect={onSelect} emptyLabel={emptyLabel} hideEmptyDays startOnly />
}

function TimeGrid<Row>({ days, byDay, todayKey, todayD, selectedId, onSelect, dayStartHour, dayEndHour }: Ctx<Row> & { days: Date[] }) {
  const chrome = useChrome()
  const h0 = Math.max(0, Math.min(23, dayStartHour))
  const h1 = Math.max(h0 + 1, Math.min(24, dayEndHour))
  const span = h1 - h0
  const cols: CSSProperties = { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }
  const allDayOf = (k: string) => (byDay.get(k) ?? []).filter(isAllDayLike)
  const hasAllDay = days.some((d) => allDayOf(dayKey(d)).length)
  return (
    <div className="min-w-0 rounded-md border border-border bg-card">
      <div className="grid border-b border-border" style={cols}>
        <span />
        {days.map((d) => {
          const k = dayKey(d)
          return (
            <div key={k} className="min-w-0 border-l border-border px-2 py-1.5">
              <span className={cn("block truncate type-eyebrow", k === todayKey ? "text-foreground" : "text-text-muted")}>{F.weekday.format(d)}</span>
              <span className={cn("inline-flex size-7 items-center justify-center rounded-full type-row-title tabular-nums", k === todayKey ? "bg-primary text-primary-foreground" : "text-foreground")}>{d.getUTCDate()}</span>
            </div>
          )
        })}
      </div>
      {hasAllDay ? (
        <div className="grid border-b border-border" style={cols}>
          <span className="px-1 py-1 type-caption text-text-muted">{chrome("kit.schedule.allDay")}</span>
          {days.map((d) => (
            <ul key={dayKey(d)} className="grid min-w-0 gap-0.5 border-l border-border p-1">
              {allDayOf(dayKey(d)).map((ev) => <li key={ev.key} className="min-w-0"><EventItem ev={ev} onSelect={onSelect} selectedId={selectedId} compact showTime={false} axis="h" continues={rangeCut(ev, d, days)} /></li>)}
            </ul>
          ))}
        </div>
      ) : null}
      <div className="grid" style={cols}>
        <div className="relative" style={{ height: `${span * HOUR}rem` }} aria-hidden="true">
          {Array.from({ length: span }, (_, i) => (
            <span key={i} className="absolute right-2 type-caption tabular-nums text-text-muted" style={{ top: `${i * HOUR}rem` }}>
              {F.hour.format(new Date(Date.UTC(2000, 0, 1, h0 + i)))}
            </span>
          ))}
        </div>
        {days.map((d) => {
          const k = dayKey(d)
          const timed = (byDay.get(k) ?? []).filter((ev) => !isAllDayLike(ev))
          // clipped to this day, then lanes per cluster of overlapping segments (see placeTimed)
          const placed = placeTimed(timed, h0, span, d)
          const nowTop = todayD && k === todayKey ? hoursOf(todayD) - h0 : null
          return (
            <div key={k} className="relative min-w-0 border-l border-border" style={{ height: `${span * HOUR}rem` }}>
              {Array.from({ length: span }, (_, i) => <span key={i} aria-hidden="true" className="absolute inset-x-0 border-t border-border" style={{ top: `${i * HOUR}rem` }} />)}
              {nowTop != null && nowTop > 0 && nowTop < span ? <span aria-hidden="true" className="absolute inset-x-0 z-10 border-t-2 border-primary" style={{ top: `${nowTop * HOUR}rem` }} /> : null}
              <ul>
                {placed.map(({ ev, lane, n, top, height, continuesBefore, continuesAfter }) => (
                  <li key={ev.key} className="absolute px-0.5" style={{ top: `${top * HOUR}rem`, height: `${height * HOUR}rem`, left: `${(lane / n) * 100}%`, width: `${100 / n}%` }}>
                    <EventItem ev={ev} onSelect={onSelect} selectedId={selectedId} continues={continuesOf(continuesBefore, continuesAfter)} compact={height < 1} titleLines={height >= 1 ? titleLinesFor(height) : undefined} className={cn("h-full overflow-hidden", height >= 1 ? "flex-col items-start justify-start gap-0.5" : "items-start")} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Day view with one column per resource (a court, room, machine or person) instead of
// per day: same hour rows and overlap-lane logic as TimeGrid, applied within each column.
// Columns get a min width and scroll horizontally inside the component; the time gutter
// (and header) stay put via `sticky left-0` so it never scrolls out of view.
function ResourceTimeGrid<Row>({ day, resourceCols, byDay, todayKey, todayD, selectedId, onSelect, dayStartHour, dayEndHour, onSlotSelect }: Ctx<Row> & { day: Date; resourceCols: ResourceCol[]; onSlotSelect?: (slot: ScheduleSlot) => void }) {
  const h0 = Math.max(0, Math.min(23, dayStartHour))
  const h1 = Math.max(h0 + 1, Math.min(24, dayEndHour))
  const span = h1 - h0
  const cols: CSSProperties = { gridTemplateColumns: `3.5rem repeat(${resourceCols.length}, minmax(9rem, 1fr))` }
  const k = dayKey(day)
  const dayEvents = (byDay.get(k) ?? []).filter((ev) => !isAllDayLike(ev))
  const nowTop = todayD && k === todayKey ? hoursOf(todayD) - h0 : null
  return (
    <div className="min-w-0 overflow-x-auto rounded-md border border-border bg-card">
      <div className="grid border-b border-border" style={cols}>
        <span className="sticky left-0 z-10 bg-card" />
        {resourceCols.map((r) => (
          <div key={r.id} className="min-w-0 border-l border-border px-2 py-1.5">
            <span className="block truncate type-eyebrow text-foreground">{r.label}</span>
          </div>
        ))}
      </div>
      <div className="grid" style={cols}>
        <div className="sticky left-0 z-10 bg-card" style={{ height: `${span * HOUR}rem` }} aria-hidden="true">
          <div className="relative h-full">
            {Array.from({ length: span }, (_, i) => (
              <span key={i} className="absolute right-2 type-caption tabular-nums text-text-muted" style={{ top: `${i * HOUR}rem` }}>
                {F.hour.format(new Date(Date.UTC(2000, 0, 1, h0 + i)))}
              </span>
            ))}
          </div>
        </div>
        {resourceCols.map((r) => {
          const timed = dayEvents.filter((ev) => ev.resourceId === r.id)
          // clipped to this day, then lanes per cluster of overlapping segments (see placeTimed)
          const placed = placeTimed(timed, h0, span, day)
          return (
            <div key={r.id} className="relative min-w-0 border-l border-border" style={{ height: `${span * HOUR}rem` }}>
              {Array.from({ length: span }, (_, i) => (
                <span key={i} aria-hidden="true" className="absolute inset-x-0 border-t border-border" style={{ top: `${i * HOUR}rem` }} />
              ))}
              {onSlotSelect
                ? Array.from({ length: span }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`${r.label}, ${F.hour.format(new Date(Date.UTC(2000, 0, 1, h0 + i)))}`}
                      onClick={() => onSlotSelect({ resource: r.id, start: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h0 + i)) })}
                      className="absolute inset-x-0 outline-none hover:bg-muted focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      style={{ top: `${i * HOUR}rem`, height: `${HOUR}rem` }}
                    />
                  ))
                : null}
              {nowTop != null && nowTop > 0 && nowTop < span ? <span aria-hidden="true" className="absolute inset-x-0 z-10 border-t-2 border-primary" style={{ top: `${nowTop * HOUR}rem` }} /> : null}
              <ul>
                {placed.map(({ ev, lane, n, top, height, continuesBefore, continuesAfter }) => (
                  <li key={ev.key} className="absolute px-0.5" style={{ top: `${top * HOUR}rem`, height: `${height * HOUR}rem`, left: `${(lane / n) * 100}%`, width: `${100 / n}%` }}>
                    <EventItem ev={ev} onSelect={onSelect} selectedId={selectedId} continues={continuesOf(continuesBefore, continuesAfter)} compact={height < 1} titleLines={height >= 1 ? titleLinesFor(height) : undefined} className={cn("h-full overflow-hidden", height >= 1 ? "flex-col items-start justify-start gap-0.5" : "items-start")} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
