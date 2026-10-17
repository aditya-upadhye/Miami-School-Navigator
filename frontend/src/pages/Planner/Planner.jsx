import { Link } from 'react-router-dom';
import { verificationInfo } from '../../api/fields';
import AppHeader from '../../components/AppHeader';
import ThemeShell from '../../components/ThemeShell';
import { useI18n } from '../../i18n';
import { buildIcs, downloadFile } from '../../utils/ics';
import { Confidence, Pill } from './Bits';
import ChildPlanCard from './ChildPlanCard';
import ScholarshipGuide from './ScholarshipGuide';
import { usePlanner } from './usePlanner';

export default function Planner() {
  const { t, date, days } = useI18n();
  const { profile, children, data, error, loading, setBirthDate, events, nextDeadline } = usePlanner();
  const nextVerification = nextDeadline ? verificationInfo(nextDeadline.field) : null;
  return (
    <ThemeShell paddingBottom={72}>
      <AppHeader active="planner" />
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '32px clamp(16px, 4vw, 40px) 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: "'Outfit', sans-serif",
              fontSize: 'clamp(32px, 3.8vw, 50px)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
            }}
          >
            {data ? t('planner.title', { year: data.school_year }) : t('planner.titleNoYear')}
          </h1>
          <p style={{ margin: 0, maxWidth: 760, fontSize: 18, lineHeight: 1.5, color: 'var(--ink2)' }}>
            {t('planner.subtitle')}{' '}
            <span style={{ fontSize: 15 }}>{profile.matchedAddress}</span>
          </p>
        </div>

        {children.length === 0 && (
          <p>
            {t('planner.addChildren')}{' '}
            <Link to="/onboarding" style={{ fontWeight: 700 }}>
              {t('planner.tellUs')}
            </Link>
          </p>
        )}
        {loading && !data && <p style={{ color: 'var(--ink2)' }}>{t('planner.building')}</p>}
        {error && (
          <p role="alert">
            {error.message} {error.suggestedAction}
          </p>
        )}

        {data && (
          <>
            <section
              aria-label={t('deadline.label')}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                padding: '20px 24px',
                borderRadius: 22,
                background: 'var(--panel-dark)',
                backdropFilter: 'blur(18px) saturate(150%)',
                WebkitBackdropFilter: 'blur(18px) saturate(150%)',
                boxShadow: '0 14px 40px rgba(43,27,20,0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
                color: '#FFFFFF',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#F6C343',
                  }}
                >
                  {t('deadline.label')}
                </span>
                {nextDeadline ? (
                  <>
                    <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 800 }}>
                      {t('deadline.banner', {
                        days: days(nextDeadline.days_until),
                        label: nextDeadline.label,
                      })}
                    </span>
                    <span style={{ color: '#ECE8FA' }}>
                      {date(nextDeadline.date)}
                      {nextVerification ? ` · ${t(`verify.${nextVerification.key}.note`)}` : ''}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 20, fontWeight: 700 }}>{t('deadline.none')}</span>
                )}
              </div>
              <button
                type="button"
                disabled={!events.length}
                onClick={() =>
                  downloadFile(
                    'school-choice-plan.ics',
                    buildIcs(events, { name: t('calendar.name', { year: data.school_year }) }),
                  )
                }
                style={{
                  minHeight: 48,
                  padding: '0 20px',
                  borderRadius: 12,
                  border: 0,
                  background: '#F6C343',
                  color: '#1B1830',
                  font: "700 16px 'Figtree', sans-serif",
                  cursor: events.length ? 'pointer' : 'not-allowed',
                  opacity: events.length ? 1 : 0.5,
                }}
              >
                {t('calendar.add')}
              </button>
            </section>

            {data.children.map((plan, i) => (
              <ChildPlanCard
                key={i}
                index={i}
                plan={plan}
                schoolYear={data.school_year}
                cutoffDate={data.cutoff_date}
                child={children[i] ?? {}}
                onBirthDate={(iso) => setBirthDate(i, iso)}
              />
            ))}

            <ScholarshipGuide guide={data.scholarship_guide} intro={data.scholarship_intro} />

            <section
              aria-label={t('dates.title')}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              <h2 style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 700 }}>
                {t('dates.title')}
              </h2>
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {data.key_dates.map((k) => (
                  <li
                    key={k.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      padding: '10px 14px',
                      borderRadius: 12,
                      background: 'var(--glass3)',
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>
                      {date(k.date)}
                      {k.approximate ? ` ${t('dates.approx')}` : ''} · {k.label}
                      <span style={{ fontWeight: 500, color: 'var(--ink2)' }}>
                        {' · '}
                        {k.days_until >= 0
                          ? t('dates.in', { days: days(k.days_until) })
                          : t('dates.ago', { days: days(-k.days_until) })}
                      </span>
                    </span>
                    <Confidence field={k.field} />
                  </li>
                ))}
              </ul>
            </section>

            {data.notes.map((n) => (
              <p key={n} style={{ margin: 0, color: 'var(--ink2)', fontSize: 14 }}>
                {n}
              </p>
            ))}
          </>
        )}
      </div>
    </ThemeShell>
  );
}
