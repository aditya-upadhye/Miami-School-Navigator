import { useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef, type CSSProperties, type DragEvent, type KeyboardEvent, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { get, toneOf, type Accessor } from "@/lib/instrument-kit"
import { useChrome } from "@/lib/i18n"

// A board of records in columns keyed by one enum field (a lifecycle, a stage, an
// owner). Domain-agnostic: the screen passes its rows, the field to group by, the
// columns in order and how a card looks.
//   <Board rows={Task} groupBy="status"
//     columns={Object.keys(statusMap.TaskStatus).map((v) => ({ value: v, label: schema.enums?.TaskStatus?.[v] ?? v, tone: statusMap.TaskStatus[v].tone }))}
//     renderCard={(t) => <TaskCard task={t} />} movable onMove={(t, to, from) => …} />
// Moving (when `movable`): drag a card to another column, or focus its handle,
// press Space to lift it, Left/Right to carry it, Space or Enter to drop, Escape
// to put it back. Moves are kept in the board's own state and reported by `onMove`.
// On a phone the columns scroll sideways, one column per view.
export interface BoardColumn {
  value: unknown
  label?: string
  tone?: string
  limit?: number | null
}
export type BoardColumnInput = BoardColumn | string | number | boolean

export interface BoardProps<Row = unknown> extends Omit<ComponentPropsWithoutRef<"section">, "onChange" | "id"> {
  rows?: Row[]
  groupBy?: Accessor<Row>
  columns?: BoardColumnInput[]
  id?: Accessor<Row>
  cardTitle?: Accessor<Row>
  renderCard?: (row: Row) => ReactNode
  movable?: boolean
  onMove?: (row: Row, to: unknown, from: unknown) => void
  label?: string
  emptyLabel?: string
  columnWidth?: string | number
}

interface BoardItem<Row> {
  row: Row
  key: string
  title: string
}
interface Lifted {
  key: string
  origin: unknown
}

export function Board<Row = unknown>({
  rows = [],
  groupBy = "status",
  columns,
  id = "id",
  cardTitle = "title",
  renderCard,
  movable = false,
  onMove,
  label: labelProp,
  emptyLabel: emptyLabelProp,
  columnWidth = "18rem",
  className,
  style,
  ...rest
}: BoardProps<Row>) {
  const chrome = useChrome()
  const label = labelProp ?? chrome("kit.board.label")
  const emptyLabel = emptyLabelProp ?? chrome("kit.board.empty")
  const [moves, setMoves] = useState<Record<string, unknown>>({})
  const [lifted, setLifted] = useState<Lifted | null>(null) // { key, origin }
  const [announce, setAnnounce] = useState("")
  const focusKey = useRef<string | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)

  const items = useMemo<BoardItem<Row>[]>(() => rows.map((row, i) => ({ row, key: String(get(row, id) ?? i), title: String(get(row, cardTitle) ?? "") })), [rows, id, cardTitle])
  const valueOf = (it: BoardItem<Row>): unknown => (it.key in moves ? moves[it.key] : get(it.row, groupBy))

  const cols = useMemo<BoardColumn[]>(() => {
    const given: BoardColumn[] = (columns ?? []).map((c) => (typeof c === "object" && c !== null ? { ...c, value: c.value, label: c.label ?? String(c.value) } : { value: c, label: String(c) }))
    if (given.length) return given
    const seen: unknown[] = []
    for (const it of items) { const v = get(it.row, groupBy); if (v != null && !seen.includes(v)) seen.push(v) }
    return seen.map((v) => ({ value: v, label: String(v) }))
  }, [columns, items, groupBy])

  const labelOf = (v: unknown): string => cols.find((c) => c.value === v)?.label ?? String(v)

  const move = (it: BoardItem<Row>, to: unknown) => {
    const from = valueOf(it)
    if (to === from) return
    setMoves((m) => ({ ...m, [it.key]: to }))
    setAnnounce(chrome("kit.board.moved", { title: it.title || chrome("kit.board.card"), column: labelOf(to) }))
    focusKey.current = it.key
    onMove?.(it.row, to, from)
  }

  useEffect(() => {
    if (!focusKey.current || !rootRef.current) return
    const el = rootRef.current.querySelector<HTMLElement>(`[data-card-key="${CSS.escape(focusKey.current)}"] [data-slot="board-handle"]`)
    el?.focus()
    focusKey.current = null
  })

  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>, it: BoardItem<Row>) => {
    const idx = cols.findIndex((c) => c.value === valueOf(it))
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault()
      if (lifted?.key === it.key) { setLifted(null); setAnnounce(chrome("kit.board.dropped", { title: it.title || chrome("kit.board.card"), column: labelOf(valueOf(it)) })) }
      else { setLifted({ key: it.key, origin: valueOf(it) }); setAnnounce(chrome("kit.board.lifted", { title: it.title || chrome("kit.board.card"), column: labelOf(valueOf(it)) })) }
    } else if (lifted?.key === it.key && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault()
      const next = cols[idx + (e.key === "ArrowRight" ? 1 : -1)]
      if (next) move(it, next.value)
    } else if (lifted?.key === it.key && e.key === "Escape") {
      e.preventDefault()
      move(it, lifted.origin)
      setLifted(null)
      setAnnounce(chrome("kit.board.returned", { title: it.title || chrome("kit.board.card"), column: labelOf(lifted.origin) }))
    }
  }

  return (
    <section data-slot="board" aria-label={label} ref={rootRef} className={cn("min-w-0", className)} style={{ "--board-col": typeof columnWidth === "number" ? `${columnWidth}px` : columnWidth, ...style } as CSSProperties} {...rest}>
      <p className="sr-only" aria-live="assertive">{announce}</p>
      <div className="relative flex min-w-0 items-start snap-x snap-mandatory gap-(--component-gap) overflow-x-auto pb-2 md:snap-none md:items-stretch">
        {cols.map((c) => {
          const here = items.filter((it) => valueOf(it) === c.value)
          const t = toneOf(c.tone)
          const over = c.limit != null && here.length > c.limit
          const headId = `board-col-${String(c.value).replace(/[^\w-]/g, "_")}`
          return (
            <section key={String(c.value)} aria-labelledby={headId} data-column={String(c.value)}
              className="relative flex w-[min(85vw,var(--board-col))] min-w-0 shrink-0 snap-start flex-col gap-2 rounded-md bg-surface-sunken p-2"
              onDragOver={movable ? (e: DragEvent<HTMLElement>) => e.preventDefault() : undefined}
              onDrop={movable ? (e: DragEvent<HTMLElement>) => { e.preventDefault(); const k = e.dataTransfer.getData("text/plain"); const it = items.find((x) => x.key === k); if (it) move(it, c.value) } : undefined}>
              <header className="flex min-w-0 items-center gap-2 px-1">
                <span className={cn("size-2 shrink-0 rounded-full", t.dot)} aria-hidden="true" />
                <h3 id={headId} className="min-w-0 truncate type-eyebrow text-foreground">{c.label}</h3>
                <span className={cn("ml-auto shrink-0 type-mono-id tabular-nums", over ? "text-status-danger-ink" : "text-text-muted")}>
                  {c.limit != null ? `${here.length}/${c.limit}` : here.length}
                  {over ? <span className="sr-only">{` ${chrome("kit.board.overLimit")}`}</span> : null}
                </span>
              </header>
              {here.length ? (
                <ul className="grid min-w-0 gap-2">
                  {here.map((it) => {
                    const up = lifted?.key === it.key
                    return (
                      <li key={it.key} data-card-key={it.key} className={cn("relative min-w-0", up && "ring-2 ring-ring rounded-md")}
                        draggable={movable || undefined}
                        onDragStart={movable ? (e: DragEvent<HTMLElement>) => { e.dataTransfer.setData("text/plain", it.key); e.dataTransfer.effectAllowed = "move" } : undefined}>
                        {renderCard ? renderCard(it.row) : (
                          <div className="rounded-md border border-border bg-card p-3">
                            <span className="line-clamp-2 type-row-title text-foreground">{it.title}</span>
                          </div>
                        )}
                        {movable ? (
                          <button type="button" data-slot="board-handle" aria-pressed={up}
                            aria-label={chrome("kit.board.move", { title: it.title || chrome("kit.board.cardLower"), column: c.label })}
                            onKeyDown={(e) => onHandleKey(e, it)}
                            onClick={() => setLifted(up ? null : { key: it.key, origin: valueOf(it) })}
                            className="absolute right-1.5 top-1.5 inline-flex size-6 cursor-grab items-center justify-center rounded-sm text-text-muted outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="currentColor"><circle cx="6" cy="4" r="1.1" /><circle cx="10" cy="4" r="1.1" /><circle cx="6" cy="8" r="1.1" /><circle cx="10" cy="8" r="1.1" /><circle cx="6" cy="12" r="1.1" /><circle cx="10" cy="12" r="1.1" /></svg>
                          </button>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed border-border-strong px-3 py-4 text-center type-caption text-text-muted">{emptyLabel}</p>
              )}
            </section>
          )
        })}
      </div>
    </section>
  )
}
