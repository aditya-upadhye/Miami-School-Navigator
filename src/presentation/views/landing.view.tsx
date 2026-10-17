// Map-first landing page: a full-width Miami-Dade map with every school pinned,
// a short welcome panel and three ways to start. Presentational: props in, no data fetching.

import type { ReactElement } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SchoolMapView } from '@/presentation/components/domain/school-map-view';
import type { School } from '@/domain/entities/school';

export interface LandingViewProps {
  readonly schools: readonly School[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly exploreHref: string;
  readonly signupHref: string;
  readonly detailHref: (id: string) => string;
}

export function LandingView(props: LandingViewProps): ReactElement {
  const { schools, selectedId, onSelect, exploreHref, signupHref, detailHref } = props;
  const selected = schools.find((s) => String(s.id) === String(selectedId));

  return (
    <div data-agent-id="screen:landing" className="flex w-full flex-1 flex-col bg-background text-foreground">
      <section className="flex flex-col gap-4 px-4 py-6 md:px-8 md:py-8">
        <p className="type-eyebrow m-0 uppercase text-text-muted">Miami-Dade School Navigator</p>
        <h1 className="type-page-title m-0 max-w-3xl text-foreground">
          Find the right school for your child, from infant care to grade 12
        </h1>
        <p className="type-body m-0 max-w-prose text-text-body">
          Every pin is a public, charter, magnet, private or early-learning option. Tap one to see
          details. No account needed to browse and compare.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href={exploreHref} className={cn(buttonVariants({ size: 'lg' }), 'min-h-11')}>
            Search and filter schools
          </a>
          <a href={signupHref} className={cn(buttonVariants({ size: 'lg', variant: 'outline' }), 'min-h-11')}>
            Create a free account
          </a>
        </div>
      </section>

      <section className="grid min-h-[480px] flex-1 gap-4 px-4 pb-8 md:px-8 lg:grid-cols-[1fr_320px]">
        <SchoolMapView
          schools={schools as School[]}
          selectedId={selectedId}
          onSelect={onSelect}
          className="min-h-[420px] lg:h-[560px]"
        />
        <aside
          aria-live="polite"
          className="flex flex-col gap-3 rounded-card border border-border bg-card p-(--card-padding)"
        >
          {selected ? (
            <>
              <h2 className="type-row-title m-0 text-foreground">{selected.name}</h2>
              <p className="type-body m-0 text-text-body">{selected.address}</p>
              <a href={detailHref(String(selected.id))} className={cn(buttonVariants(), 'min-h-11 w-fit')}>
                View school details
              </a>
            </>
          ) : (
            <p className="type-body m-0 text-text-muted">
              {schools.length} schools on the map. Select a pin to see its name and address.
            </p>
          )}
        </aside>
      </section>
    </div>
  );
}
