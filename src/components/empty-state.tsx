import type { ReactNode } from 'react'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  /** One sentence on what will appear here ("No clients yet."). Translate it at the call site. */
  title: string
  /**
   * Supporting line. When the user CANNOT add, this is where it says what will fill the area
   * ("Invoices appear here when a client pays.") (STATE.6).
   */
  description?: ReactNode
  /** Optional lucide icon element, decorative (hidden from assistive tech). */
  icon?: ReactNode
  /**
   * The add action when this user can add ("Add client"). Pass it here, not in the page head, so the
   * action appears once (HEAD.16). Omit when the user cannot add.
   */
  action?: ReactNode
  className?: string
}

/**
 * Empty state for a collection with no records yet (STATE.6). Presentational: it renders the copy and
 * action it is given and ships no built-in text.
 *
 * @example
 * <EmptyState
 *   icon={<Users />}
 *   title={t('clients.empty')}
 *   action={<Button onClick={openCreate}>{t('clients.add')}</Button>}
 * />
 */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <Empty data-slot="empty-state" className={cn('border', className)}>
      <EmptyHeader>
        {icon && (
          <EmptyMedia variant="icon" aria-hidden>
            {icon}
          </EmptyMedia>
        )}
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
