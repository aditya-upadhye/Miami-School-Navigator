import { useState } from 'react';
import { api } from '../../api/client';
import { isMissing, KIND_LABEL, miles, provenance } from '../../api/fields';
import { useApi } from '../../hooks/useApi';
import { useI18n } from '../../i18n';
import { useProfile } from '../../profile/ProfileProvider';
import { childName } from '../../utils/stages';

const FIGURE_HEIGHT = { infant_toddler: 44, pre_k: 58, elementary: 78, middle: 96, high: 112 };

/** Meta line under an option: its kind plus how far it is, or how much of the earlier zone it overlaps. `t` is the translator. */
export function describe(o, t) {
  const kind = KIND_LABEL[o.kind] ?? o.kind;
  const v = o.label.value;
  if (typeof v === 'number') return t('pathway.meta.miles', { kind, n: v });
  if (v && typeof v === 'object' && 'overlap_pct' in v)
    return t('pathway.meta.overlap', { kind, pct: v.overlap_pct });
  return kind ?? '';
}

/** Pathway from infant care to 12th grade for each child (POST /api/pathway). Elementary is the official zone; middle and high
 *  school are estimates from overlapping attendance zones, and are labelled as such. */
export function usePathway() {
  const { profile } = useProfile();
  const { t, tp, date } = useI18n();
  const children = profile.children ?? [];
  const [childIdx, setChildIdx] = useState(0);
  const [picked, setPicked] = useState(null);

  const body = {
    lat: profile.lat,
    lon: profile.lon,
    children: children.map((c) => ({ age: c.age, name: c.name || undefined })),
    free_only: !!profile.freeOnly,
  };
  const { data, error, loading } = useApi((signal) => api.pathway(body, { signal }), [JSON.stringify(body)], {
    enabled: children.length > 0 && profile.hasLocation,
  });

  const idx = Math.min(childIdx, Math.max(children.length - 1, 0));
  const kid = data?.children?.[idx];
  const currentIdx = kid
    ? Math.max(
        kid.stages.findIndex((s) => s.status === 'current'),
        0,
      )
    : 0;
  const stageIdx = picked ?? currentIdx;
  const sel = kid?.stages?.[stageIdx];

  const stages = (kid?.stages ?? []).map((st, i) => {
    const current = st.status === 'current';
    const past = st.status === 'past';
    const selected = i === stageIdx;
    const first = st.options[0];
    return {
      name: st.label,
      ages: st.ages,
      figH: `${FIGURE_HEIGHT[st.stage]}px`,
      fig: current ? '#F6C343' : past ? '#9A8FCC' : 'var(--accent)',
      bagOp: i >= 2 ? 1 : 0,
      capOp: 0,
      briefOp: 0,
      current,
      selected,
      border: selected ? 'var(--ink)' : 'transparent',
      cardBg: selected ? 'var(--glass3)' : 'var(--glass2)',
      chipBg: past ? 'var(--glass3)' : current ? '#FFF0C2' : 'var(--accent-tint)',
      chipFg: past ? 'var(--ink3)' : current ? '#1B1830' : 'var(--accent-ink)',
      pick_name: past ? t('pathway.past') : first ? first.name : t('pathway.askProviders'),
      aria: past
        ? t('pathway.aria.past', { label: st.label })
        : first
          ? t('pathway.aria.option', { label: st.label, option: first.name })
          : t('pathway.aria.none', { label: st.label }),
      pick: () => setPicked(i),
    };
  });

  const panel = sel && {
    kicker: `${sel.label} · ${sel.ages}`,
    headline:
      sel.status === 'past'
        ? t('pathway.headline.past')
        : sel.estimate_note
          ? t('pathway.headline.estimated')
          : t('pathway.headline.near'),
    note: sel.estimate_note,
    empty:
      sel.status === 'past'
        ? ''
        : sel.options.length === 0
          ? profile.freeOnly && sel.stage === 'infant_toddler'
            ? t('pathway.empty.freeInfant')
            : t('pathway.empty.none')
          : '',
    options: sel.options.map((o) => ({
      name: o.name,
      picked: o.label.status === 'official',
      tag: t('pathway.zoned'),
      meta: describe(o, t),
      why: provenance(o.label),
      cta: t('pathway.details'),
      href: o.place_id ? `/school/${o.place_id}` : null,
      border: o.label.status === 'official' ? 'var(--accent)' : 'var(--line)',
      bg: o.label.status === 'official' ? 'var(--accent-tint)' : 'var(--glass2)',
    })),
    dates: sel.key_dates.map((d) => ({
      label: d.label,
      line: t('pathway.dateLine', {
        label: d.label,
        when: d.approximate ? t('pathway.dateApprox', { date: date(d.date) }) : date(d.date),
        rel: d.days_until >= 0 ? tp('pathway.inDays', d.days_until) : tp('pathway.daysAgo', -d.days_until),
      }),
    })),
  };

  return {
    loading,
    error,
    hasChildren: children.length > 0,
    title: kid ? t('pathway.title', { name: childName(children[idx], idx) }) : t('pathway.titleDefault'),
    intro: t('pathway.intro'),
    hereLabel: kid ? t('pathway.here', { name: childName(children[idx], idx) }) : '',
    kids: children.map((c, i) => ({
      label: `${childName(c, i)} · ${c.age}`,
      on: i === idx,
      bg: i === idx ? 'var(--seg-on)' : 'transparent',
      weight: i === idx ? '700' : '600',
      shadow: i === idx ? '0 1px 3px rgba(16,35,46,0.2)' : 'none',
      pick: () => {
        setChildIdx(i);
        setPicked(null);
      },
    })),
    stages,
    panel,
    notes: data?.notes ?? [],
    zoneNote: data?.zones?.note,
  };
}
