import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BUDGET_OPTIONS, PRIORITY_LABEL_KEYS, PRIORITY_OPTIONS, VALUE_LABEL_KEYS, VALUE_OPTIONS } from '../../data/family';
import { useI18n } from '../../i18n';
import { useSetState } from '../../hooks/useSetState';
import { useProfile } from '../../profile/ProfileProvider';
import { chip, toggleInList } from '../../utils/chip';
import { gradeLabelForAge } from '../../utils/stages';

const MAX_KIDS = 6;

/** Grades a child can enter next. The value is the age that grade corresponds to, which is what the backend and the stage rules use. */
const GRADE_AGES = [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

/** State and derived view values for the "Tell us about your family" screen. Submitting saves the profile for every screen. */
export function useOnboarding() {
  const { profile, setLocation, updateProfile } = useProfile();
  const { t, tp, lang } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [s, setState] = useSetState(() => ({
    where: profile.address ?? '',
    // No default age or grade: families pick them, since a child may have skipped a year or be rejoining school.
    kids: (profile.children.length ? profile.children : [{ name: '' }]).map((c) => ({
      name: c.name ?? '',
      age: c.actualAge ?? '',
      grade: c.age ?? '',
      support: !!c.support,
    })),
    radius: profile.radius ?? 3,
    budget: profile.freeOnly ? 'free' : 'any',
    prio: (profile.priorities ?? []).filter((p) => PRIORITY_OPTIONS.includes(p)),
    values: (profile.values ?? []).filter((v) => VALUE_OPTIONS.includes(v)),
  }));

  const updateKid = (i, patch) =>
    setState((st) => ({ kids: st.kids.map((k, idx) => (idx === i ? { ...k, ...patch } : k)) }));

  // The mode lives in the URL (?mode=chat | form), so the switcher and the browser's Back button agree.
  const formOn = params.get('mode') === 'form';
  const chatOn = !formOn;
  const n = s.kids.length;

  const submit = async () => {
    if (!s.where.trim()) {
      setError(t('onboarding.error.where'));
      return;
    }
    if (s.kids.some((k) => k.grade === '')) {
      setError(t('onboarding.error.grade'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await setLocation(s.where.trim());
      updateProfile({
        children: s.kids.map((k) => ({
          name: k.name.trim() || undefined,
          age: k.grade, // the age that matches the grade entering next: it decides the school stage
          actualAge: k.age === '' ? undefined : k.age,
          support: k.support,
        })),
        freeOnly: s.budget === 'free',
        priorities: s.prio,
        values: s.values,
        radius: s.radius,
      });
      navigate('/explore', { viewTransition: true });
    } catch (e) {
      setError(`${e.message} ${e.suggestedAction ?? ''}`.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return {
    chatOn,
    formOn,
    pickChat: () => setParams({ mode: 'chat' }, { replace: true }),

    where: s.where,
    onWhere: (e) => setState({ where: e.target.value }),
    submit,
    submitting,
    error,

    kidCount: tp('onboarding.kids', n),
    addKid: () =>
      setState((st) =>
        st.kids.length < MAX_KIDS ? { kids: [...st.kids, { name: '', age: '', grade: '', support: false }] } : {},
      ),
    removeKid: () => setState((st) => (st.kids.length > 1 ? { kids: st.kids.slice(0, -1) } : {})),
    kids: s.kids.map((k, i) => ({
      label: t('child', { n: i + 1 }),
      nameId: `kid-name-${i}`,
      ageId: `kid-age-${i}`,
      supId: `kid-sup-${i}`,
      name: k.name,
      age: String(k.age),
      gradeId: `kid-grade-${i}`,
      grade: String(k.grade),
      gradeOptions: GRADE_AGES.map((a) => ({ value: String(a), label: gradeLabelForAge(a, lang) })),
      support: k.support,
      onName: (e) => updateKid(i, { name: e.target.value }),
      onAge: (e) => updateKid(i, { age: e.target.value === '' ? '' : Number(e.target.value) }),
      onGrade: (e) => updateKid(i, { grade: e.target.value === '' ? '' : Number(e.target.value) }),
      onSupport: (e) => updateKid(i, { support: e.target.checked }),
    })),
    kidsSummary: s.kids
      .map((k, i) => `${k.name || t('child', { n: i + 1 })} (${k.grade === '' ? t('onboarding.form.selectGrade') : gradeLabelForAge(k.grade, lang)})`)
      .join(', '),

    radius: s.radius,
    radiusLabel: tp('onboarding.radius', s.radius),
    onRadius: (e) => setState({ radius: Number(e.target.value) }),

    budgets: BUDGET_OPTIONS.map((b) => ({
      label: t(b.labelKey),
      on: s.budget === b.id,
      pick: () => setState({ budget: b.id }),
      ...chip(s.budget === b.id),
    })),
    budgetLabel: t(BUDGET_OPTIONS.find((b) => b.id === s.budget).labelKey),

    prios: PRIORITY_OPTIONS.map((p) => {
      const on = s.prio.includes(p);
      return {
        label: t(PRIORITY_LABEL_KEYS[p]),
        on,
        pick: () => setState((st) => ({ prio: toggleInList(st.prio, p) })),
        ...chip(on),
      };
    }),
    valueChips: VALUE_OPTIONS.map((v) => {
      const on = s.values.includes(v);
      return { label: t(VALUE_LABEL_KEYS[v]), tip: t(`${VALUE_LABEL_KEYS[v]}.tip`), on, pick: () => setState((st) => ({ values: toggleInList(st.values, v) })), ...chip(on) };
    }),
    prioSummary: s.prio.length
      ? s.prio.map((p) => t(PRIORITY_LABEL_KEYS[p])).join(', ')
      : t('onboarding.summary.none'),
  };
}
