import { useMemo } from 'react';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useI18n } from '../../i18n';
import { useProfile } from '../../profile/ProfileProvider';
import { ageFromBirth } from '../../utils/stages';

/** Planner data (POST /api/plan) in the family's language, plus the calendar events that go with it. */
export function usePlanner() {
  const { profile, patchProfile } = useProfile();
  const { t, lang } = useI18n();
  const children = profile.children ?? [];
  const body = {
    lat: profile.lat,
    lon: profile.lon,
    free_only: !!profile.freeOnly,
    lang,
    children: children.map((c) => ({
      age: c.age,
      name: c.name || undefined,
      birth_date: c.birthDate || undefined,
    })),
  };
  const { data, error, loading } = useApi((signal) => api.plan(body, { signal }), [JSON.stringify(body)], {
    enabled: children.length > 0 && profile.hasLocation,
    delay: 300,
  });

  /** Set (or clear) a child's birth date. A valid date also keeps the child's age in step for the other screens. */
  const setBirthDate = (i, iso) =>
    patchProfile({
      children: children.map((c, idx) => {
        if (idx !== i) return c;
        const age = ageFromBirth(iso);
        return { ...c, birthDate: age === null ? undefined : iso, age: age ?? c.age };
      }),
    });

  // One calendar event per upcoming date; each says which children it matters for and how sure we are of it.
  const events = useMemo(() => {
    if (!data) return [];
    const by = new Map();
    data.key_dates.filter((k) => k.days_until >= 0).forEach((k) => by.set(k.id, { k, who: new Set() }));
    data.children.forEach((ch, i) =>
      ch.items.forEach((it) => {
        if (it.deadline && by.has(it.deadline.id))
          by.get(it.deadline.id).who.add(ch.name || t('child', { n: i + 1 }));
      }),
    );
    return [...by.values()].map(({ k, who }) => {
      return {
        uid: k.id,
        date: k.date,
        summary: `${k.label}${k.approximate ? ` ${t('ics.approx')}` : ''}`,
        description: [
          who.size ? t('ics.for', { names: [...who].join(', ') }) : '',
          t('ics.source', { source: k.field.source }),
          t('ics.confirm'),
        ]
          .filter(Boolean)
          .join('\n'),
        url: k.field.url || undefined,
        alarmDays: 7,
      };
    });
  }, [data, t]);

  // The soonest firm deadline that any child's plan depends on (approximate dates, such as expected results, are not "deadlines").
  const nextDeadline = useMemo(() => {
    const all = (data?.children ?? []).flatMap((ch) =>
      ch.items.map((it) => it.deadline).filter((d) => d && !d.approximate && d.days_until >= 0),
    );
    return all.sort((a, b) => a.days_until - b.days_until)[0] ?? null;
  }, [data]);

  return { profile, children, data, error, loading, setBirthDate, events, nextDeadline };
}
