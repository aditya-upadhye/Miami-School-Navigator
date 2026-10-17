import Card, { h2 } from '../../components/Card';
import { isMissing, nextStep, percent, text, tuition } from '../../api/fields';
import { useI18n } from '../../i18n';
import { levelLabel } from './useSchool';

function value(key, f, { t, nf }) {
  if (isMissing(f)) return t('shared.notAvailable');
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

export default function AtAGlance({ school }) {
  const { t, nf } = useI18n();
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
        {ROWS.filter((k) => school[k] && applies(k, school.kind)).map((key) => {
          const f = school[key];
          const missing = isMissing(f);
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
              <dd
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 700,
                  color: missing ? 'var(--ink3)' : 'var(--ink)',
                  fontStyle: missing ? 'italic' : 'normal',
                }}
              >
                {value(key, f, { t, nf })}
              </dd>
              {missing && key !== 'aftercare' && <dd style={{ margin: 0, fontSize: 13.5, color: 'var(--ink2)' }}>{nextStep(f)}</dd>}
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
