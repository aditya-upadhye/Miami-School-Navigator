import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';

export default function StageOptions({ panel }) {
  const { t } = useI18n();
  return (
    <section
      aria-labelledby="stage-title"
      style={{
        flex: '999 1 520px',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: 24,
        borderRadius: 22,
        background: 'var(--glass)',
        backdropFilter: 'blur(16px) saturate(170%)',
        WebkitBackdropFilter: 'blur(16px) saturate(170%)',
        border: '1px solid var(--edge)',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--accent-ink)',
          }}
        >
          {panel.kicker}
        </span>
        <h2
          id="stage-title"
          style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 700 }}
        >
          {panel.headline}
        </h2>
        {panel.note && (
          <p style={{ margin: '4px 0 0', fontSize: 14.5, color: 'var(--ink2)' }}>{panel.note}</p>
        )}
      </div>
      {panel.empty && <p style={{ margin: 0, color: 'var(--ink2)' }}>{panel.empty}</p>}
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {panel.options.map((o, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '12px 16px',
              padding: 16,
              borderRadius: 16,
              border: `2px solid ${o.border}`,
              background: o.bg,
            }}
          >
            <span
              style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}
            >
              <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{o.name}</span>
                {o.picked && (
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: 999,
                      background: 'var(--accent-grad)',
                      boxShadow: 'var(--accent-shadow)',
                      color: '#FFFFFF',
                      fontSize: 12.5,
                      fontWeight: 700,
                    }}
                  >
                    {o.tag}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 14, color: 'var(--ink2)' }}>{o.meta}</span>
              <span style={{ fontSize: 15, color: 'var(--ink2)' }}>{o.why}</span>
            </span>
            {o.href && (
              <Link
                to={o.href}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 44,
                  padding: '0 16px',
                  borderRadius: 12,
                  border: '1.5px solid var(--line2)',
                  background: 'var(--glass)',
                  backdropFilter: 'blur(16px) saturate(170%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(170%)',
                  color: 'var(--ink)',
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                {o.cta}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            )}
          </li>
        ))}
      </ol>
      {panel.dates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontWeight: 700 }}>{t('pathway.keyDates')}</span>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink2)', fontSize: 15 }}>
            {panel.dates.map((d) => (
              <li key={d.label}>{d.line}</li>
            ))}
          </ul>
          <Link to="/explore#dates" style={{ fontSize: 14, fontWeight: 600 }}>
            {t('pathway.datesLink')}
          </Link>
        </div>
      )}
    </section>
  );
}
