import type { ComponentProps } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { StatusTone } from './status-chip.policy'

export type { StatusTone } from './status-chip.policy'

// ok maps to the token family called "success"; kept explicit so the class names stay statically visible to Tailwind.
const TONE_CLASS: Record<StatusTone, string> = {
  ok: 'bg-[var(--status-success-bg)] text-[var(--status-success-ink)] [--dot:var(--status-success)]',
  info: 'bg-[var(--status-info-bg)] text-[var(--status-info-ink)] [--dot:var(--status-info)]',
  pending: 'bg-[var(--status-pending-bg)] text-[var(--status-pending-ink)] [--dot:var(--status-pending)]',
  warn: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-ink)] [--dot:var(--status-warning)]',
  danger: 'bg-[var(--status-danger-bg)] text-[var(--status-danger-ink)] [--dot:var(--status-danger)]',
  neutral: 'bg-[var(--status-neutral-bg)] text-[var(--status-neutral-ink)] [--dot:var(--status-neutral)]',
}

export interface StatusChipProps extends Omit<ComponentProps<'span'>, 'children'> {
  /**
   * The state's name, from the blueprint, already translated. The text always says the state: color is
   * never the only signal (TBL.10). Use the same label and tone for a state on every list, filter, card
   * and record page.
   */
  label: string
  /** Tone of the state; default `neutral`. */
  tone?: StatusTone
}

/**
 * One status chip per record (TBL.10). Not interactive: a chip is not a button, changing the state is
 * an action. It is a plain <span>; do not pass `onClick`.
 *
 * @example
 * <StatusChip tone="ok" label={t('orders.status.delivered')} />
 */
export function StatusChip({ label, tone = 'neutral', className, ...props }: StatusChipProps) {
  return (
    <Badge
      variant="secondary"
      data-slot="status-chip"
      data-tone={tone}
      className={cn(TONE_CLASS[tone], className)}
      {...props}
    >
      {/* Decorative dot reinforces the tone; the text carries the meaning. */}
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--dot)]" />
      {label}
    </Badge>
  )
}
