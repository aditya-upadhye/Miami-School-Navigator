import Card, { h2 } from '../../components/Card';
import { isMissing, percent, text, tuition } from '../../api/fields';
import { useI18n } from '../../i18n';
import { levelLabel } from './useSchool';

function value(key, f, { t, nf }) {
  if (key === 'tuition') return tuition(f);
  if (key === 'gains_ela' || key === 'gains_math') return percent(f);
  if (key === 'enrollment') return nf(f.value);
  if (key === 'license') {
    const number = f.value.number ?? t('school.glance.noNumber');
    if (!f.value.expires) return number;
    return t(
      f.value.expired_per_county_record ? 'school.glance.licenseExpired' : 'school.glance.licenseExpires',
      {
        number,
        date: f.value.expires,
      },
    );
  }
  if (key === 'zoned')
    return f.value.zoned
      ? t('school.glance.zonedYes', { level: levelLabel(t, f.value.level) })
      : t('shared.no');
  return text(f);
}

const ROWS = [
  'state_grade',
  'gains_ela',
  'gains_math',
  'enrollment',
  'tuition',
  'aftercare',
  'is_magnet',
  'specialties',
  'ese',
  'scholarship',
  'license',
];

// Hide rows that make no sense for this kind of school (e.g. state grades for a private school, scholarships for a public one).
const applies = (key, kind) => {
  if (['state_grade', 'gains_ela', 'gains_math'].includes(key))
    return kind === 'public' || kind === 'charter';
  if (key === 'is_magnet') return kind === 'public';
  if (key === 'scholarship') return kind === 'private';
  return true;
};

/** The rows to show: only those that apply to this kind of school and have a value. A missing value is left out, never shown as "not available". */
export function glanceRows(school, ctx) {
  return ROWS.filter((k) => school[k] && applies(k, school.kind) && !isMissing(school[k]))
    .map((key) => ({ key, text: value(key, school[key], ctx) }))
    .filter((row) => row.text);
}

export default function AtAGlance({ school }) {
  const { t, nf } = useI18n();
  const rows = glanceRows(school, { t, nf });
  if (!rows.length) return null;
  return (
    <Card id="glance" aria-labelledby="glance-title">
      <h2 id="glance-title" style={h2}>
        {t('school.glance.title')}
      </h2>
      <p style={{ margin: 0, color: 'var(--ink2)' }}>{t('school.glance.intro')}</p>
      <dl
        style={{
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 14,
        }}
      >
        {rows.map(({ key, text: shown }) => {
          const f = school[key];
          return (
            <div
              key={key}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '14px 16px',
                borderRadius: 14,
                background: 'var(--glass3)',
              }}
            >
              <dt
                style={{
                  fontSize: 13,
                  color: 'var(--ink3)',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                {t(`school.glance.row.${key}`)}
              </dt>
              <dd style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>{shown}</dd>
              {key === 'state_grade' && school.flags?.includes('grade_match_unverified') && (
                <dd style={{ margin: 0, fontSize: 13.5, color: 'var(--ink2)' }}>
                  {t('school.glance.check', { note: f.method.split('Check:')[1]?.trim() })}
                </dd>
              )}
            </div>
          );
        })}
      </dl>
    </Card>
  );
}
