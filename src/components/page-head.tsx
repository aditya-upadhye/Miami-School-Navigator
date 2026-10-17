import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

export interface PageHeadBack {
  /** Visible text: the collection's name ("Clients"). Translate it at the call site. */
  label: string
  /** Where the collection lives. */
  href: string
}

export interface PageHeadProps {
  /**
   * The page title, rendered as the page's only <h1> (HEAD.3). A top-level page: its navigation label.
   * A record page: the record's own name or number.
   */
  title: ReactNode
  /** One short line of support (HEAD.4). Never instructions, never a repeat of the title. */
  description?: ReactNode
  /** Record pages: the way back to the collection (HEAD.5), shown above the title. */
  back?: PageHeadBack
  /** Free wayfinding (e.g. a Breadcrumb) for deep hierarchies; shown above the title, after `back`. */
  breadcrumb?: ReactNode
  /** Record pages: the record's status next to the title (HEAD.6), typically a <StatusChip />. */
  status?: ReactNode
  /** Record pages: at most one line of key facts (ID, dates, owner), already formatted (HEAD.6). */
  meta?: ReactNode
  /**
   * The page's actions, end-aligned (HEAD.9-11): at most one filled primary, the few secondary ones,
   * then one "More actions" menu. Pass the buttons; this component only places them.
   */
  actions?: ReactNode
  /** Tabs of the record or settings area, full width under the head (HEAD.7, HEAD.8). */
  tabs?: ReactNode
  className?: string
}

/**
 * The page head every signed-in page starts with (HEAD.1): wayfinding, title (+status), support line,
 * actions. Same structure and position everywhere. It spans the full width of its container (HEAD.8):
 * do not put it inside a `max-w-*` wrapper narrower than the content below it.
 *
 * @example
 * <PageHead
 *   title="Invoice 1042"
 *   back={{ label: t('invoices.title'), href: '/invoices' }}
 *   status={<StatusChip tone="pending" label={t('invoices.status.sent')} />}
 *   actions={<Button>{t('invoices.approve')}</Button>}
 * />
 */
export function PageHead({
  title,
  description,
  back,
  breadcrumb,
  status,
  meta,
  actions,
  tabs,
  className,
}: PageHeadProps) {
  return (
    <header data-slot="page-head" className={cn('w-full space-y-4', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-1.5">
          {back && (
            <Link
              to={back.href}
              className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
            >
              <ArrowLeft aria-hidden className="size-3.5" />
              {back.label}
            </Link>
          )}
          {breadcrumb}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 text-balance text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            {status}
          </div>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
        </div>
        {actions && (
          <div data-slot="page-head-actions" className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        )}
      </div>
      {tabs}
    </header>
  )
}
