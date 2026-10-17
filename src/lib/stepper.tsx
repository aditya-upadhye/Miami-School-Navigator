import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { cn } from "@/lib/utils"
import { CheckIcon } from "@/lib/instrument-kit"
import { useChrome } from "@/lib/i18n"

// An ordered process: where a record, an application or a flow stands. Steps are
// strings or { id, label, description?, meta?, state?, href? }; `current` is the
// current step's id or index. States not given are derived from `current`: before
// it complete, at it current, after it upcoming. A step may say `state: "blocked"`.
//   <Stepper steps={[{ id: "draft", label: "Draft" }, { id: "review", label: "In review" }, …]} current={row.stage} />
// `orientation`: "auto" (default: horizontal from md, vertical on a phone) ·
// "horizontal" · "vertical". State reads without colour: a check, a number with a
// ring, a plain number, an exclamation mark, and a hidden label for each.
export type StepState = "complete" | "current" | "upcoming" | "blocked"
export type StepId = string | number

export interface StepInput {
  id?: StepId
  label?: string
  description?: ReactNode
  meta?: ReactNode
  state?: StepState
  href?: string
}
export type StepperStep = string | StepInput

export interface ResolvedStep extends Omit<StepInput, "id" | "label"> {
  id: StepId
  label: string
  index: number
  state: StepState
}

export type StepperOrientation = "auto" | "horizontal" | "vertical"

export interface StepperProps extends Omit<ComponentPropsWithoutRef<"nav">, "onSelect"> {
  steps?: StepperStep[]
  current?: StepId | null
  orientation?: StepperOrientation
  onSelect?: (step: ResolvedStep) => void
  label?: string
}

const STATE_KEY: Record<StepState, string> = {
  complete: "kit.stepper.complete",
  current: "kit.stepper.current",
  upcoming: "kit.stepper.upcoming",
  blocked: "kit.stepper.blocked",
}

export function Stepper({ steps = [], current, orientation = "auto", onSelect, label: labelProp, className, ...rest }: StepperProps) {
  const chrome = useChrome()
  const label = labelProp ?? chrome("kit.stepper.label")
  const norm = steps.map((s, i): Omit<ResolvedStep, "index" | "state"> & { state?: StepState } =>
    typeof s === "object" && s !== null
      ? { ...s, id: s.id ?? i, label: s.label ?? String(s.id ?? i + 1) }
      : { id: s, label: String(s) },
  )
  const at = typeof current === "number" && !norm.some((s) => s.id === current) ? current : norm.findIndex((s) => s.id === current)
  const items: ResolvedStep[] = norm.map((s, i) => ({
    ...s,
    index: i,
    state: s.state ?? (at < 0 ? "upcoming" : i < at ? "complete" : i === at ? "current" : "upcoming"),
  }))
  const shared = { items, onSelect }
  return (
    <nav data-slot="stepper" aria-label={label} className={cn("min-w-0", className)} {...rest}>
      {orientation !== "vertical" ? <div className={cn(orientation === "auto" && "hidden md:block")}><Horizontal {...shared} /></div> : null}
      {orientation !== "horizontal" ? <div className={cn(orientation === "auto" && "md:hidden")}><Vertical {...shared} /></div> : null}
    </nav>
  )
}

function Marker({ step }: { step: ResolvedStep }) {
  const s = step.state
  return (
    <span aria-hidden="true" className={cn(
      "relative z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-full type-mono-id tabular-nums",
      s === "complete" && "bg-primary text-primary-foreground",
      s === "current" && "border-2 border-primary bg-card text-foreground",
      s === "upcoming" && "border border-border-strong bg-card text-text-muted",
      s === "blocked" && "border border-status-danger bg-status-danger-bg text-status-danger-ink",
    )}>
      {s === "complete" ? <CheckIcon className="size-4" /> : s === "blocked" ? "!" : step.index + 1}
    </span>
  )
}

function StepText({ step, align }: { step: ResolvedStep; align?: "center" }) {
  const chrome = useChrome()
  return (
    <span className={cn("grid min-w-0 gap-0.5", align === "center" && "justify-items-center text-center")}>
      <span className={cn("type-meta", step.state === "upcoming" ? "text-text-muted" : "text-foreground")}>{step.label}</span>
      <span className="sr-only">, {STATE_KEY[step.state] ? chrome(STATE_KEY[step.state]) : step.state}</span>
      {step.description ? <span className="type-caption text-text-muted">{step.description}</span> : null}
      {step.meta ? <span className="type-mono-id tabular-nums text-text-muted">{step.meta}</span> : null}
    </span>
  )
}

interface WrapProps {
  step: ResolvedStep
  onSelect?: (step: ResolvedStep) => void
  className?: string
  children: ReactNode
}

function Wrap({ step, onSelect, className, children }: WrapProps) {
  const cls = cn("rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring", (step.href || onSelect) && "hover:bg-muted", className)
  if (step.href) return <a href={step.href} className={cls}>{children}</a>
  if (onSelect) return <button type="button" onClick={() => onSelect(step)} className={cls}>{children}</button>
  return <div className={cls}>{children}</div>
}

interface ListProps {
  items: ResolvedStep[]
  onSelect?: (step: ResolvedStep) => void
}

function Horizontal({ items, onSelect }: ListProps) {
  return (
    <ol className="flex min-w-0 items-start">
      {items.map((step, i) => (
        <li key={String(step.id)} aria-current={step.state === "current" ? "step" : undefined} className="relative flex min-w-0 flex-1 flex-col items-center gap-2 px-1">
          {i > 0 ? <span aria-hidden="true" className={cn("absolute right-1/2 top-4 h-px w-full", items[i - 1].state === "complete" ? "bg-primary" : "bg-border-strong")} /> : null}
          <Wrap step={step} onSelect={onSelect} className="relative flex min-w-0 flex-col items-center gap-2 p-1">
            <Marker step={step} />
            <StepText step={step} align="center" />
          </Wrap>
        </li>
      ))}
    </ol>
  )
}

function Vertical({ items, onSelect }: ListProps) {
  return (
    <ol className="grid min-w-0">
      {items.map((step, i) => (
        <li key={String(step.id)} aria-current={step.state === "current" ? "step" : undefined} className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-x-3">
          <span className="flex flex-col items-center">
            <Marker step={step} />
            {i < items.length - 1 ? <span aria-hidden="true" className={cn("my-1 w-px flex-1", step.state === "complete" ? "bg-primary" : "bg-border-strong")} /> : null}
          </span>
          <Wrap step={step} onSelect={onSelect} className="min-w-0 pb-4 pt-1">
            <StepText step={step} />
          </Wrap>
        </li>
      ))}
    </ol>
  )
}
