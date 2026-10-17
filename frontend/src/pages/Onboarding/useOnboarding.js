import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BUDGET_OPTIONS, PRIORITY_LABEL_KEYS, PRIORITY_OPTIONS } from '../../data/family';
import { useI18n } from '../../i18n';
import { useSetState } from '../../hooks/useSetState';
import { useProfile } from '../../profile/ProfileProvider';
import { chip, toggleInList } from '../../utils/chip';
import { gradeLabelForAge } from '../../utils/stages';

const MAX_KIDS = 6;

/** State and derived view values for the "Tell us about your family" screen. Submitting saves the profile for every screen. */
export function useOnboarding() {
  const { profile, setLocation, updateProfile } = useProfile();
  const { t, tp, lang } = useI18n();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [s, setState] = useSetState(() => ({
    mode: 'chat',
    where: profile.isDemo ? '' : profile.address,
    kids: (profile.isDemo ? [{ name: '', age: 5 }] : profile.children).map((c) => ({
      name: c.name ?? '',
      age: c.age,
      support: !!c.support,
    })),
    radius: profile.radius ?? 3,
    budget: profile.freeOnly ? 'free' : 'any',
    prio: profile.isDemo ? [] : (profile.priorities ?? []).filter((p) => PRIORITY_OPTIONS.includes(p)),
  }));

  const updateKid = (i, patch) =>
    setState((st) => ({ kids: st.kids.map((k, idx) => (idx === i ? { ...k, ...patch } : k)) }));

  const chatOn = s.mode === 'chat';
  const formOn = s.mode === 'form';
  const n = s.kids.length;

  const submit = async () => {
    if (!s.where.trim()) {
      setError(t('onboarding.error.where'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await setLocation(s.where.trim());
      updateProfile({
        children: s.kids.map((k) => ({ name: k.name.trim() || undefined, age: k.age, support: k.support })),
        freeOnly: s.budget === 'free',
        priorities: s.prio,
        radius: s.radius,
      });
      navigate('/explore', { state: { onboarded: true } });
    } catch (e) {
      setError(`${e.message} ${e.suggestedAction ?? ''}`.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return {
    chatOn,
    formOn,
    chatBorder: chatOn ? 'var(--accent)' : 'var(--line)',
    chatBg: chatOn ? 'var(--accent-tint)' : 'var(--glass2)',
    formBorder: formOn ? 'var(--accent)' : 'var(--line)',
    formBg: formOn ? 'var(--accent-tint)' : 'var(--glass2)',
    pickChat: () => setState({ mode: 'chat' }),
    pickForm: () => setState({ mode: 'form' }),

    where: s.where,
    onWhere: (e) => setState({ where: e.target.value }),
    submit,
    submitting,
    error,

    kidCount: tp('onboarding.kids', n),
    addKid: () =>
      setState((st) =>
        st.kids.length < MAX_KIDS ? { kids: [...st.kids, { name: '', age: 5, support: false }] } : {},
      ),
    removeKid: () => setState((st) => (st.kids.length > 1 ? { kids: st.kids.slice(0, -1) } : {})),
    kids: s.kids.map((k, i) => ({
      label: t('child', { n: i + 1 }),
      nameId: `kid-name-${i}`,
      ageId: `kid-age-${i}`,
      supId: `kid-sup-${i}`,
      name: k.name,
      age: String(k.age),
      support: k.support,
      grade: gradeLabelForAge(k.age, lang),
      onName: (e) => updateKid(i, { name: e.target.value }),
      onAge: (e) => updateKid(i, { age: Number(e.target.value) }),
      onSupport: (e) => updateKid(i, { support: e.target.checked }),
    })),
    kidsSummary: s.kids
      .map((k, i) => `${k.name || t('child', { n: i + 1 })} (${gradeLabelForAge(k.age, lang)})`)
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
    prioSummary: s.prio.length
      ? s.prio.map((p) => t(PRIORITY_LABEL_KEYS[p])).join(', ')
      : t('onboarding.summary.none'),
  };
}
