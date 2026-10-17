import { useI18n } from '../../i18n';

export default function Hero() {
  const { t } = useI18n();
  return (
    <section
      style={{
        flex: '1 1 520px',
        maxWidth: 660,
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
        paddingTop: 24,
      }}
    >
      <span
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          borderRadius: 999,
          background: 'var(--edge)',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--accent-ink)',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
        {t('landing.hero.badge')}
      </span>
      <h1
        style={{
          margin: 0,
          fontFamily: "'Outfit', sans-serif",
          fontWeight: 800,
          fontSize: 'clamp(44px, 5.4vw, 80px)',
          lineHeight: 0.98,
          letterSpacing: '-0.025em',
        }}
      >
        {t('landing.hero.title')}
      </h1>
      <p style={{ margin: 0, maxWidth: 540, fontSize: 20, lineHeight: 1.5, color: 'var(--ink2)' }}>
        {t('landing.hero.lede')}
      </p>
      <ul
        style={{
          listStyle: 'none',
          margin: '6px 0 0',
          padding: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          maxWidth: 600,
        }}
      >
        <li
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 999,
            background: 'var(--glass2)',
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6B54C9"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
            <path d="M9 4v14M15 6v14" />
          </svg>
          {t('landing.hero.f1')}
        </li>
        <li
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 999,
            background: 'var(--glass2)',
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6B54C9"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="5" height="16" rx="1" />
            <rect x="9.5" y="4" width="5" height="16" rx="1" />
            <rect x="16" y="4" width="5" height="16" rx="1" />
          </svg>
          {t('landing.hero.f2')}
        </li>
        <li
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 999,
            background: 'var(--glass2)',
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6B54C9"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {t('landing.hero.f3')}
        </li>
        <li
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 999,
            background: 'var(--glass2)',
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6B54C9"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="6" cy="19" r="2" />
            <circle cx="18" cy="5" r="2" />
            <path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7" />
          </svg>
          {t('landing.hero.f4')}
        </li>
      </ul>
    </section>
  );
}
