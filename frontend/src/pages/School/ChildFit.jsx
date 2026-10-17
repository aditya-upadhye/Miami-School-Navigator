import { api } from '../../api/client';
import Card, { h2 } from '../../components/Card';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';
import { childName } from '../../utils/stages';

/** The children whose details are in the profile (an age is the minimum we need). */
export const knownChildren = (profile) => (profile.children ?? []).filter((c) => Number.isInteger(c.age) && c.age >= 0);

/**
 * "Why this school could fit your child", for a signed-in family that has told us about a child. It shows at once with the grade-fit
 * sentence (computed from the child's age and the school's grades), then the language model's friendlier version replaces it if it
 * arrives in time. If anything fails the card keeps what it has, or is not shown. Nothing is stored about the child.
 */
export default function ChildFit({ id, profile }) {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const kids = knownChildren(profile);
  const enabled = !!user && kids.length > 0;
  const body = {
    children: kids.map((c) => ({ age: c.age, name: c.name || undefined })),
    lat: profile.lat ?? undefined,
    lon: profile.lon ?? undefined,
    priorities: profile.priorities ?? [],
    values: profile.values ?? [],
  };
  const key = JSON.stringify(body);
  const quick = useApi((signal) => api.childFit(id, { ...body, ai: false }, { signal }), [id, key], { enabled });
  const smart = useApi((signal) => api.childFit(id, { ...body, ai: true }, { signal }), [id, key], { enabled });
  if (!enabled) return null;
  const mine = (d) => (d?.id === id ? d.summary : '');
  const text = mine(smart.data) || mine(quick.data);
  if (!text && !quick.loading && !smart.loading) return null; // both failed: say nothing rather than something vague
  const names = kids.map((c, i) => childName(c, i, lang)).join(t('explore.and'));
  return (
    <Card aria-labelledby="fit-title">
      <h2 id="fit-title" style={h2}>
        {t('school.fit.title', { names })}
      </h2>
      <p aria-live="polite" style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: text ? 'var(--ink)' : 'var(--ink2)', fontStyle: text ? 'normal' : 'italic' }}>
        {text || t('school.fit.loading')}
      </p>
    </Card>
  );
}
