import { Link } from 'react-router-dom';
import Card from '../../components/Card';
import { useI18n } from '../../i18n';
import { Confidence, Pill } from './Bits';

const todayIso = () => new Date().toISOString().slice(0, 10);

const ELIG = {
  eligible: { icon: '✓', tone: 'good', key: 'elig.eligible' },
  later: { icon: '◷', tone: 'info', key: 'elig.later' },
  not_eligible: { icon: '–', tone: 'muted', key: 'elig.past' },
};

const label = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--accent-ink)',
};

export default function ChildPlanCard({ plan, schoolYear, cutoffDate, child, onBirthDate, index }) {
  const { t, date, monthDay, days } = useI18n();
  const name = plan.name || t('child', { n: index + 1 });
  const exactAge = plan.age_basis === 'birth_date';

  function status(it) {
    const d = it.deadline;
    switch (it.status) {
      case 'open':
        return { tone: 'good', text: d ? t('status.openCloses', { date: date(d.date) }) : t('status.open') };
      case 'closes_soon':
        return {
          tone: 'warn',
          text: t('status.closesSoon', { days: days(d.days_until), date: date(d.date) }),
        };
      case 'upcoming':
        return it.id === 'magnet-results'
          ? { tone: 'info', text: t('status.expected', { date: date(d.date) }) }
          : { tone: 'info', text: t('status.upcoming') };
      case 'closed':
        return {
          tone: 'muted',
          text: d ? t('status.closed', { date: date(d.date) }) : t('status.closedPlain'),
        };
      case 'rolling':
        return { tone: 'muted', text: t('status.rolling') };
      default:
        return { tone: 'muted', text: t('status.info') };
    }
  }

  return (
    <Card aria-labelledby={`child-${index}`}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2
            id={`child-${index}`}
            style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 800 }}
          >
            {name}
          </h2>
          <span style={{ color: 'var(--ink2)', fontSize: 16 }}>
            {t(exactAge ? 'child.now' : 'child.nowAbout', { age: plan.age_now })} ·{' '}
            {t('child.in', { year: schoolYear })}{' '}
            <strong style={{ color: 'var(--ink)' }}>{plan.entering}</strong>
          </span>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600 }}>
          {t('birth.label')}
          <input
            type="date"
            max={todayIso()}
            value={child.birthDate ?? ''}
            onChange={(e) => onBirthDate(e.target.value)}
            style={{
              height: 44,
              padding: '0 12px',
              border: '1.5px solid var(--line2)',
              borderRadius: 12,
              font: "15px 'Figtree', sans-serif",
              color: 'var(--ink)',
            }}
          />
        </label>
      </div>
      {!exactAge && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink2)' }}>
          {t('birth.helper', { cutoff: monthDay(cutoffDate) })}
        </p>
      )}
      {plan.transition_note && (
        <p
          style={{
            margin: 0,
            padding: '10px 14px',
            borderRadius: 12,
            background: 'var(--accent-tint)',
            color: 'var(--accent-ink)',
            fontWeight: 700,
          }}
        >
          {plan.transition_note}
        </p>
      )}

      {plan.eligibility.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={label}>{t('elig.heading')}</span>
          {plan.eligibility.map((e) => {
            const el = ELIG[e.result];
            return (
              <div
                key={e.key}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: 'var(--glass3)',
                }}
              >
                <span
                  style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontWeight: 700 }}
                >
                  <span aria-hidden="true">{el.icon}</span> {e.label}
                  <Pill tone={el.tone}>{t(el.key)}</Pill>
                  <Pill
                    tone={e.exact ? 'good' : 'warn'}
                    title={t(e.exact ? 'pill.exactTip' : 'pill.estimateTip')}
                  >
                    {t(e.exact ? 'pill.exact' : 'pill.estimate')}
                  </Pill>
                </span>
                <span style={{ fontSize: 15, lineHeight: 1.45 }}>{e.explanation}</span>
                <Confidence field={e.field} />
              </div>
            );
          })}
        </div>
      )}

      {plan.items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={label}>{t('checklist.heading', { year: schoolYear })}</span>
          <ol
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {plan.items.map((it) => {
              const st = status(it);
              return (
                <li
                  key={it.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: '14px 16px',
                    borderRadius: 14,
                    background: 'var(--glass3)',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 17, fontWeight: 700 }}>{it.title}</span>
                    <Pill tone={st.tone}>{st.text}</Pill>
                  </span>
                  <span style={{ fontSize: 15, lineHeight: 1.5 }}>{it.detail}</span>
                  <Confidence field={it.field} />
                  {it.link && (
                    <span style={{ fontSize: 14, fontWeight: 700 }}>
                      {it.link === 'explore' && <Link viewTransition to="/explore">{t('link.explore')}</Link>}
                      {it.link === 'scholarships' && <a href="#scholarships">{t('link.scholarships')}</a>}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Card>
  );
}
