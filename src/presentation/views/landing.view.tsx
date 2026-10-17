// Map-first landing page: a Miami-Dade map with every school pinned, a short welcome
// and two ways to start. Presentational: props in, no data fetching.

import type { ReactElement } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Map } from '@/lib/map';
import type { School } from '@/domain/entities/school';

export interface LandingViewProps {
  readonly schools: readonly School[];
  readonly isSample?: boolean;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly exploreHref: string;
  readonly signupHref: string;
  readonly detailHref: (id: string) => string;
}

const SECTOR_LABEL: Record<School['sector'], string> = {
  PUBLIC: 'Public',
  CHARTER: 'Charter',
  MAGNET: 'Magnet',
  PRIVATE: 'Private',
  EARLY_LEARNING: 'Early learning',
};

const MIAMI_CENTER: [number, number] = [25.76, -80.25];

export function LandingView(props: LandingViewProps): ReactElement {
  const { schools, isSample = false, exploreHref, signupHref, detailHref } = props;

  const markers = schools.flatMap((s) =>
    s.location
      ? [
          {
            id: s.id,
            lat: s.location.lat,
            lng: s.location.lng,
            label: `${s.name} (${SECTOR_LABEL[s.sector]})`,
            ...(isSample ? {} : { href: detailHref(String(s.id)) }),
          },
        ]
      : [],
  );

  return (
    <div data-agent-id="screen:landing" className="flex w-full flex-1 flex-col bg-background text-foreground">
      <section className="flex flex-col gap-3 px-4 py-6 md:px-8">
        <p className="type-eyebrow m-0 uppercase text-text-muted">Miami-Dade School Navigator</p>
        <h1 className="m-0 max-w-3xl text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          Find the right school for your child, from infant care to grade 12
        </h1>
        <p className="type-body m-0 max-w-prose text-text-body">
          Every pin is a public, charter, magnet, private or early-learning option. Tap a pin to see
          the school. No account needed to browse.
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

      {isSample && (
        <p
          role="status"
          className="type-caption m-0 mx-4 rounded-card border border-border bg-muted px-3 py-2 text-text-muted md:mx-8"
        >
          Sample view: these pins are illustrative until real school data is added.
        </p>
      )}

      <section className="grid gap-4 px-4 pb-8 pt-4 md:px-8 lg:grid-cols-[1fr_300px]">
        <Map
          center={MIAMI_CENTER}
          zoom={10}
          markers={markers}
          ratio={16 / 10}
          className="min-h-[360px] rounded-card border border-border"
        />
        <aside className="flex max-h-[560px] flex-col gap-2 overflow-auto rounded-card border border-border bg-card p-(--card-padding)">
          <h2 className="m-0 text-base font-semibold text-foreground">{schools.length} schools on the map</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {schools.map((s) => (
              <li key={s.id} className="type-body text-text-body">
                <span className="font-medium text-foreground">{s.name}</span>
                <span className="block type-caption text-text-muted">{SECTOR_LABEL[s.sector]}</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>
    </div>
  );
}
