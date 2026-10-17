import { useEffect, useId, useRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { get, toDate, TONE, ChevronIcon, type Accessor, type ToneClasses, type ToneName } from "@/lib/instrument-kit"
import { formatDate } from "@/lib/format"
import { navigateTo } from "@/lib/host-navigation"

// A work queue: the records that wait for a person, in the order they are worked, with
// the open one beside the list. For rows with a lifecycle that people triage one at a
// time (claims, tickets, approvals, an inbox of requests). A Board is for MOVING records
// between stages; a Queue is for WORKING them. Domain-agnostic: the screen passes its
// rows, says which fields hold what and draws the detail.
//   <Queue rows={Claim} title="claimNumber" subtitle="payer" stage="status" at="receivedAt" now="2026-10-01T09:00:00Z" sla={48}
//     stages={[{ value: "Received", label: "Received" }, { value: "Denied", label: "Denied", exception: true }]}
//     assignee="owner.name" search={["claimNumber", "payer"]}
//     renderDetail={(c) => <ClaimDetail claim={c} />} detailActions={(c) => <Button>Approve</Button>}
//     onTakeNext={(c) => …} />
// List: one two-line row per record, no column headings: the title (with `identifier`)
// and the age over the stage chip and the subtitle (with `assignee`). Order: `priority`
// (descending), then the oldest `at` first. The filter tabs ("All" and one per stage)
// carry the counts. The chip is neutral unless its stage is an `exception` (its `tone`,
// danger by default) or the `tone` accessor gives a status token; a stage's own `tone`
// does not colour the chip of an ordinary stage. A row past its `sla` (hours, measured
// to `now`) says "Overdue" in words and with a mark, not by colour alone.
// Time: the age is relative to `now` (an ISO date from the data, never the clock): "3 h",
// "2 d". Without `now` the row shows the date the item entered the queue.
// Keyboard: with the list focused, Up/Down or k/j move the selection, Home/End jump, Enter
// opens. Below lg only the list shows; a row opens its `rowHref`, or swaps the list for
// the detail with a Back button. First paint is fixed (first tab, first page, first row of
// the tab selected, list showing on a phone), so the server render equals the first client render.
export interface QueueStage {
  value: unknown
  label?: string
  /** An `exception` stage colours its chip with `tone` (danger by default). */
  exception?: boolean
  tone?: string
}
export type QueueStageInput = QueueStage | string | number

export interface QueueProps<Row = unknown> extends Omit<ComponentPropsWithoutRef<"section">, "onSelect" | "title" | "id"> {
  rows?: Row[]
  id?: Accessor<Row>
  title?: Accessor<Row>
  identifier?: Accessor<Row>
  subtitle?: Accessor<Row>
  stage?: Accessor<Row>
  stages?: QueueStageInput[]
  tone?: Accessor<Row>
  at?: Accessor<Row>
  /** ISO date (or Date / epoch ms) the ages and the SLA are measured to. */
  now?: string | number | Date | null
  /** Hours after which a row is Overdue. */
  sla?: number | null
  assignee?: Accessor<Row>
  priority?: Accessor<Row>
  search?: Accessor<Row>[]
  selectedId?: string | number | null
  defaultSelectedId?: string | number | null
  onSelect?: (row: Row) => void
  renderDetail?: (row: Row) => ReactNode
  detailActions?: (row: Row) => ReactNode
  rowHref?: Accessor<Row>
  onTakeNext?: (row: Row) => void
  pageSize?: number
  label?: string
  emptyLabel?: string
  filteredEmptyLabel?: string
}

interface QueueItem<Row> {
  row: Row
  i: number
  key: string
  stage: unknown
  prio: number
  at: Date | null
}
interface QueueTab extends QueueStage {
  key: string
}

const toneLookup = (t: unknown): ToneClasses | undefined => (typeof t === "string" && Object.prototype.hasOwnProperty.call(TONE, t) ? TONE[t as ToneName] : undefined)

// The row is a link when it has an href, a plain box otherwise.
function RowTag({ href, children, ...props }: Omit<ComponentPropsWithoutRef<"div">, "onClick"> & { href?: string; onClick: (e: MouseEvent<HTMLElement>) => void }) {
  return href ? <a href={href} {...(props as ComponentPropsWithoutRef<"a">)}>{children}</a> : <div {...props}>{children}</div>
}

const nowMs = (now: unknown): number | null => { const d = toDate(now); return d ? d.getTime() : null }
const HOUR = 3600000
const ALL = "\u0000all" // the "All" tab: an internal sentinel no stage value can collide with
const stageKey = (v: unknown): string => (v == null ? "" : String(v))

function ageText(at: Date | null, now: number | null): string {
  if (!at) return ""
  if (now == null) return formatDate(at)
  const h = (now - at.getTime()) / HOUR
  if (h < 0) return formatDate(at)
  if (h < 1) return "<1 h"
  if (h < 48) return `${Math.floor(h)} h`
  return `${Math.floor(h / 24)} d`
}

export function Queue<Row = unknown>({
  rows = [],
  id = "id",
  title = "title",
  identifier,
  subtitle,
  stage = "status",
  stages,
  tone,
  at,
  now,
  sla,
  assignee,
  priority,
  search,
  selectedId,
  defaultSelectedId,
  onSelect,
  renderDetail,
  detailActions,
  rowHref,
  onTakeNext,
  pageSize = 25,
  label = "Queue",
  emptyLabel = "Nothing in the queue",
  filteredEmptyLabel = "Nothing matches",
  className,
  ...rest
}: QueueProps<Row>) {
  const uid = useId()
  const [tab, setTab] = useState(ALL)
  const [query, setQuery] = useState("")
  const [sel, setSel] = useState<string | number | null>(defaultSelectedId ?? null)
  const [phoneDetail, setPhoneDetail] = useState(false)
  const scrollTo = useRef(false)
  const focusAfter = useRef<"detail" | "list" | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const detailRef = useRef<HTMLDivElement | null>(null)
  const now_ = nowMs(now)
  const controlled = selectedId !== undefined

  const items: QueueItem<Row>[] = rows
    .map((row, i): QueueItem<Row> => {
      const atDate = toDate(get(row, at))
      return { row, i, key: String(get(row, id) ?? i), stage: get(row, stage), prio: priority ? Number(get(row, priority)) || 0 : 0, at: atDate }
    })
    .sort((a, b) => b.prio - a.prio || (a.at && b.at ? a.at.getTime() - b.at.getTime() : a.at ? -1 : b.at ? 1 : 0) || a.i - b.i)

  const given: QueueStage[] = (stages ?? []).map((s) => (typeof s === "object" && s !== null ? { ...s, label: s.label ?? String(s.value) } : { value: s, label: String(s) }))
  const tabs: QueueTab[] = (() => {
    if (given.length) return given.map((s) => ({ ...s, key: stageKey(s.value) }))
    const seen: string[] = []
    for (const it of items) if (it.stage != null && !seen.includes(stageKey(it.stage))) seen.push(stageKey(it.stage))
    return seen.map((v) => ({ value: v, key: v, label: v }))
  })()
  // With `stages` given, those are the queue's stages: a row in any other stage is not in the queue (not in All, not counted, never Overdue).
  const scoped = given.length ? items.filter((it) => tabs.some((s) => s.key === stageKey(it.stage))) : items
  // First paint: the page that holds the wanted row (defaultSelectedId, or the controlled selectedId), else the first. Deterministic, so SSR equals the first client render.
  const [page, setPage] = useState(() => {
    const w = defaultSelectedId ?? selectedId
    const i = w == null ? -1 : scoped.findIndex((it) => it.key === String(w))
    return i < 0 ? 0 : Math.floor(i / pageSize)
  })
  const stageOf = (v: unknown): QueueTab | undefined => tabs.find((s) => s.key === stageKey(v))
  const countOf = (k: string): number => scoped.filter((it) => stageKey(it.stage) === k).length
  const filterItems = (t: string, qq: string): QueueItem<Row>[] => {
    const inTab = t === ALL ? scoped : scoped.filter((it) => stageKey(it.stage) === t)
    return qq && search?.length ? inTab.filter((it) => search.some((a) => String(get(it.row, a) ?? "").toLowerCase().includes(qq))) : inTab
  }

  const q = query.trim().toLowerCase()
  const visible = filterItems(tab, q)

  const pages = Math.max(1, Math.ceil(visible.length / pageSize))
  const pageAt = Math.min(page, pages - 1)
  const shown = visible.slice(pageAt * pageSize, (pageAt + 1) * pageSize)

  const wanted = controlled ? selectedId : sel
  // The selection lives on the page that is showing: a wanted row that is not on it falls back to the page's first row.
  const current = shown.find((it) => it.key === (wanted == null ? wanted : String(wanted))) ?? shown[0] ?? null
  const strayed = controlled && current != null && wanted != null && current.key !== String(wanted)
  const currentIndex = current ? visible.indexOf(current) : -1
  const optionId = (it: QueueItem<Row>): string => `${uid}-${it.key}`.replace(/\s/g, "_")

  const choose = (it: QueueItem<Row>, open = false) => {
    if (!controlled) setSel(it.key)
    if (open) setPhoneDetail(true)
    onSelect?.(it.row)
  }
  const goTo = (index: number) => {
    const it = visible[Math.max(0, Math.min(visible.length - 1, index))]
    if (!it) return
    scrollTo.current = true
    setPage(Math.floor(visible.indexOf(it) / pageSize))
    choose(it)
  }
  const changeTab = (v: string) => { setTab(v); setPage(0); const first = filterItems(v, q)[0]; if (first) choose(first) }
  const changeQuery = (v: string) => { setQuery(v); setPage(0); const first = filterItems(tab, v.trim().toLowerCase())[0]; if (first) choose(first) }
  const pageTo = (p: number) => {
    const n = Math.max(0, Math.min(pages - 1, p))
    setPage(n)
    const first = visible[n * pageSize]
    if (first) choose(first)
  }
  const wide = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches
  const hrefOf = (it: QueueItem<Row>): string | undefined => {
    const h = rowHref ? get(it.row, rowHref) : undefined
    return h == null || h === "" ? undefined : String(h)
  }

  useEffect(() => {
    if (!scrollTo.current || !current) return
    scrollTo.current = false
    document.getElementById(optionId(current))?.scrollIntoView?.({ block: "nearest" })
  })
  // Controlled and the wanted row is not on the page that shows: the fallback row is what the person sees, so the parent is told.
  const notified = useRef<string | null>(null)
  useEffect(() => {
    if (!strayed) { notified.current = null; return }
    if (!current || notified.current === current.key) return
    notified.current = current.key
    onSelect?.(current.row)
  })
  // Focus follows the user's own action only (never on first paint): a phone row opens the detail region, Back returns to the list.
  useEffect(() => {
    const target = focusAfter.current
    if (!target) return
    focusAfter.current = null
    ;(target === "detail" ? detailRef.current : listRef.current)?.focus({ preventScroll: true })
  })

  const open = (it: QueueItem<Row>) => {
    const href = hrefOf(it)
    choose(it, true)
    if (!wide()) focusAfter.current = "detail"
    else listRef.current?.focus({ preventScroll: true })
    if (href && (!renderDetail || !wide()) && typeof window !== "undefined") navigateTo(href)
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!visible.length) return
    const k = e.key
    if (k === "ArrowDown" || k === "j") { e.preventDefault(); goTo(currentIndex + 1) }
    else if (k === "ArrowUp" || k === "k") { e.preventDefault(); goTo(currentIndex - 1) }
    else if (k === "Home") { e.preventDefault(); goTo(0) }
    else if (k === "End") { e.preventDefault(); goTo(visible.length - 1) }
    else if (k === "Enter" && current) { e.preventDefault(); open(current) }
  }

  const unassigned = (it: QueueItem<Row>): boolean => !assignee || get(it.row, assignee) == null || get(it.row, assignee) === ""
  // The next oldest unassigned row AFTER the current one in the list as it is filtered and searched, wrapping around: repeated
  // presses walk the queue instead of flipping between the top two.
  const next = (() => {
    for (let n = 1; n <= visible.length; n++) {
      const it = visible[(currentIndex + n + visible.length) % visible.length]
      if (it !== current && unassigned(it)) return it
    }
    return undefined
  })()
  const takeNext = () => {
    if (!next) return
    goTo(visible.indexOf(next))
    onTakeNext?.(next.row)
  }

  const split = Boolean(renderDetail)
  const chip = (it: QueueItem<Row>) => {
    const s = stageOf(it.stage)
    const given = tone ? toneLookup(get(it.row, tone)) : undefined
    const t = s?.exception ? toneLookup(s.tone) ?? TONE.danger : given
    return { text: s?.label ?? (it.stage == null ? "" : String(it.stage)), cls: t ? t.soft : "bg-muted text-text-muted" }
  }
  const overdue = (it: QueueItem<Row>): boolean => sla != null && now_ != null && it.at != null && (now_ - it.at.getTime()) / HOUR > Number(sla)

  const list = !rows.length || !visible.length ? (
    <p className="rounded-md border border-dashed border-border-strong px-3 py-6 text-center type-caption text-text-muted">{rows.length ? filteredEmptyLabel : emptyLabel}</p>
  ) : (
    <div ref={listRef} role="listbox" tabIndex={0} aria-label={label} aria-activedescendant={current ? optionId(current) : undefined} onKeyDown={onKey}
      className="min-w-0 overflow-hidden rounded-md border border-border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {shown.map((it) => {
        const href = hrefOf(it)
        const c = chip(it)
        const selected = current?.key === it.key
        const late = overdue(it)
        const ident = identifier ? get(it.row, identifier) : null
        const sub = subtitle ? get(it.row, subtitle) : null
        const who = assignee ? get(it.row, assignee) : null
        return (
          <RowTag key={it.key} href={href} id={optionId(it)} role="option" aria-selected={selected} tabIndex={-1} data-element="queue-row" data-queue-key={it.key}
            onClick={(e: MouseEvent<HTMLElement>) => {
              if (href && (!renderDetail || !wide() || e.metaKey || e.ctrlKey || e.shiftKey)) { choose(it); return }
              if (href) e.preventDefault()
              if (!href && !wide() && renderDetail) focusAfter.current = "detail"
              else listRef.current?.focus({ preventScroll: true })
              choose(it, !href)
            }}
            className="relative flex min-w-0 cursor-pointer flex-col gap-1 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/60 aria-selected:bg-muted aria-selected:shadow-[inset_2px_0_0_var(--color-primary)] max-md:min-h-[44px]">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 truncate type-row-title text-foreground">{String(get(it.row, title) ?? "")}</span>
              {ident != null && ident !== "" ? <span className="shrink-0 type-mono-id tabular-nums text-text-muted">{String(ident)}</span> : null}
              {it.at ? <span className="ml-auto shrink-0 type-caption tabular-nums text-text-muted">{ageText(it.at, now_)}</span> : null}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span className={cn("inline-flex h-5 shrink-0 items-center rounded-4xl px-2 type-caption", c.cls)}>{c.text}</span>
              {late ? (
                <span className="inline-flex shrink-0 items-center gap-1 type-caption text-status-danger-ink">
                  <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6" /><path d="M8 4.75v3.75M8 11v.01" /></svg>
                  Overdue
                </span>
              ) : null}
              {sub != null && sub !== "" ? <span className="min-w-0 truncate type-meta text-text-muted">{String(sub)}</span> : null}
              {who != null && who !== "" ? <span className="ml-auto max-w-[40%] shrink-0 truncate type-caption text-text-muted">{String(who)}</span> : null}
            </span>
          </RowTag>
        )
      })}
    </div>
  )

  return (
    <section data-slot="queue" aria-label={label} className={cn("grid min-w-0 gap-(--component-gap)", className)} {...rest}>
      <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap">
        {search?.length ? (
          <Input type="search" aria-label={`Search ${label}`} placeholder="Search" value={query} onChange={(e) => changeQuery(e.target.value)} className="w-full sm:w-72 lg:shrink-0" />
        ) : null}
        {tabs.length ? (
          <div className="min-w-0 max-w-full overflow-x-auto">
            <ToggleGroup type="single" variant="outline" spacing={0} value={tab} onValueChange={(v) => { if (v) changeTab(v) }} aria-label="Stage">
              <ToggleGroupItem value={ALL} className="max-md:min-h-[44px]">All <span className="tabular-nums text-text-muted">{scoped.length}</span></ToggleGroupItem>
              {tabs.map((s) => (
                <ToggleGroupItem key={s.key} value={s.key} className="max-md:min-h-[44px]">{s.label} <span className="tabular-nums text-text-muted">{countOf(s.key)}</span></ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        ) : null}
        {onTakeNext ? <Button type="button" className="lg:ml-auto" disabled={!next} onClick={takeNext}>Take next</Button> : null}
      </div>
      <div className={cn("grid min-w-0 items-start gap-(--component-gap)", split && "lg:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)]")}>
        <div className={cn("grid min-w-0 gap-2", split && phoneDetail && "max-lg:hidden")}>
          {list}
          {pages > 1 ? (
            <nav aria-label={`${label} pages`} className="flex items-center justify-center gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={pageAt === 0} onClick={() => pageTo(pageAt - 1)}><ChevronIcon dir="left" className="size-4" />Previous</Button>
              <span className="type-caption tabular-nums text-text-muted">{pageAt + 1} of {pages}</span>
              <Button type="button" variant="ghost" size="sm" disabled={pageAt >= pages - 1} onClick={() => pageTo(pageAt + 1)}>Next<ChevronIcon className="size-4" /></Button>
            </nav>
          ) : null}
        </div>
        {split ? (
          <div ref={detailRef} tabIndex={-1} data-slot="queue-detail" role="region" aria-label={`${label} detail`}
            className={cn("flex min-w-0 flex-col gap-3 outline-none lg:sticky lg:top-[var(--shell-header-h,var(--topbar-h,0px))] lg:max-h-[calc(100dvh-var(--shell-header-h,var(--topbar-h,0px)))]", !phoneDetail && "max-lg:hidden")}>
            <div className="lg:hidden">
              <Button type="button" variant="ghost" size="sm" onClick={() => { focusAfter.current = "list"; setPhoneDetail(false) }}><ChevronIcon dir="left" className="size-4" />Back</Button>
            </div>
            {current ? (
              <>
                <div tabIndex={0} className="min-h-0 flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring">{renderDetail?.(current.row)}</div>
                {detailActions ? <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">{detailActions(current.row)}</div> : null}
              </>
            ) : (
              <p className="rounded-md border border-dashed border-border-strong px-3 py-6 text-center type-caption text-text-muted">{rows.length ? filteredEmptyLabel : emptyLabel}</p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
