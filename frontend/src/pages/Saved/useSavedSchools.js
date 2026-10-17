import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useI18n } from '../../i18n';
import { useProfile } from '../../profile/ProfileProvider';
import { mapLimit } from '../../saved/savedLogic';
import { useSaved } from '../../saved/SavedProvider';

const CONCURRENCY = 4;

/**
 * Rows for the Saved page: {id, note, status: 'loading' | 'ok' | 'gone' | 'error', school, retry}.
 * Signed in: the list endpoint already carries each school summary (null = no longer in the data).
 * Guest: only ids are stored, so each summary is fetched with GET /schools/{id}, a few at a time; a failure affects only that row.
 */
export function useSavedSchools() {
  const saved = useSaved();
  const { profile } = useProfile();
  const { lang } = useI18n();
  const { lat, lon } = profile;
  const key = `${lang}|${lat}|${lon}`; // summaries depend on language (text) and location (distance)
  const [cache, setCache] = useState({ key, byId: {} });
  const guestIds = saved.signedIn ? [] : saved.items.map((i) => i.place_id);
  const idsKey = guestIds.join(',');

  useEffect(() => {
    if (saved.signedIn) return undefined;
    const known = cache.key === key ? cache.byId : {};
    const missing = guestIds.filter((id) => !known[id]);
    if (missing.length === 0) return undefined;
    const ctrl = new AbortController();
    let cancelled = false;
    mapLimit(missing, CONCURRENCY, (id) => api.school(id, lat, lon, { signal: ctrl.signal })).then(
      (results) => {
        if (cancelled) return;
        const got = {};
        results.forEach((r, i) => {
          got[missing[i]] = r.ok
            ? { status: 'ok', school: r.value.school }
            : r.error?.status === 404 || r.error?.code === 'school_not_found'
              ? { status: 'gone' }
              : { status: 'error' };
        });
        setCache((c) => ({ key, byId: { ...(c.key === key ? c.byId : {}), ...got } }));
      },
    );
    return () => {
      cancelled = true;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.signedIn, idsKey, key, cache]);

  const byId = cache.key === key ? cache.byId : {};
  const rows = saved.items.map((item) => {
    const id = item.place_id;
    if (saved.signedIn) {
      const status = item.school === undefined ? 'loading' : item.school === null ? 'gone' : 'ok';
      return { id, note: item.note, status, school: item.school ?? null, retry: null };
    }
    const entry = byId[id];
    return {
      id,
      note: '',
      status: entry?.status ?? 'loading',
      school: entry?.school ?? null,
      retry: () =>
        setCache((c) => {
          const next = { ...(c.key === key ? c.byId : {}) };
          delete next[id];
          return { key, byId: next };
        }),
    };
  });
  return { rows, saved };
}
