import Card, { h2 } from '../../components/Card';
import { useI18n } from '../../i18n';

export default function HowToApply({ steps, notes }) {
  const { t } = useI18n();
  if (!steps.length) return null;
  return (
    <Card aria-labelledby="apply-title">
      <h2 id="apply-title" style={h2}>
        {t('school.apply.title')}
      </h2>
      <ol
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {steps.map((s) => {
          return (
            <li
              key={s.rule_id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '14px 16px',
                borderRadius: 14,
                background: 'var(--glass3)',
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1.5 }}>{s.text}</span>
              <span
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  alignItems: 'center',
                  fontSize: 13.5,
                  color: 'var(--ink2)',
                }}
              >
                <a href={s.field.url} target="_blank" rel="noopener noreferrer">
                  {t('school.apply.source')}
                </a>
                <span>{t('school.apply.checked', { date: s.field.as_of })}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {notes.map((n) => (
        <p key={n} style={{ margin: 0, color: 'var(--ink2)', fontSize: 14 }}>
          {n}
        </p>
      ))}
    </Card>
  );
}
