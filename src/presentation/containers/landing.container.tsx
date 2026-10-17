// Container of the `landing` screen: loads the schools and hands the view what it needs.

import * as React from 'react';
import { routes } from '@/presentation/navigation';
import type { RepoError } from '../../domain/shared';
import type { School } from '../../domain/entities/school';
import { useRepositories } from '../app-context';
import { LandingView } from '../views/landing.view';
import { SAMPLE_SCHOOLS } from './landing-sample-schools';
import { ScreenError, ScreenLoading } from '../screen-state';

export default function LandingScreenRoute(): React.ReactElement {
  const repositories = useRepositories();
  const [schools, setSchools] = React.useState<readonly School[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<RepoError | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError(null);
    void repositories.school
      .listAll()
      .then((result) => {
        if (!live) return;
        if (result === null) {
          setSchools([]);
        } else if (result.ok === false) {
          setLoadError(result.error);
        } else {
          setSchools(result.data.items);
        }
        setLoading(false);
      })
      .catch((cause: unknown) => {
        console.error('[archie] landing schools query failed:', cause);
        if (!live) return;
        setLoadError({
          kind: 'transport',
          message: 'The schools query failed.',
          detail: 'rejected promise outside the RepoResult contract',
        });
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [repositories, reloadToken]);

  return (
    <>
      {loading ? (
        <ScreenLoading />
      ) : loadError !== null ? (
        <ScreenError error={loadError} onRetry={() => setReloadToken((n) => n + 1)} />
      ) : (
        <LandingView
          isSample={schools.length === 0}
          schools={schools.length === 0 ? SAMPLE_SCHOOLS : schools}
          selectedId={selectedId}
          onSelect={setSelectedId}
          exploreHref={routes.explore()}
          signupHref={routes.signup()}
          detailHref={(id) => routes['school-detail']({ id })}
        />
      )}
    </>
  );
}
