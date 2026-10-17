import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';

export default function ModePicker({
  chatBg,
  chatBorder,
  chatOn,
  formBg,
  formBorder,
  formOn,
  pickChat,
  pickForm,
}) {
  const { t } = useI18n();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      <button
        type="button"
        aria-pressed={chatOn}
        onClick={pickChat}
        style={{
          flex: '1 1 300px',
          display: 'flex',
          gap: 16,
          alignItems: 'flex-start',
          padding: 20,
          borderRadius: 18,
          border: `2px solid ${chatBorder}`,
          background: chatBg,
          textAlign: 'left',
          font: 'inherit',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            flexShrink: 0,
            width: 48,
            height: 48,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--accent-grad)',
            boxShadow: 'var(--accent-shadow)',
            color: '#FFFFFF',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z" />
          </svg>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{t('onboarding.mode.chat.title')}</span>
          <span style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--ink2)' }}>
            {t('onboarding.mode.chat.body')}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-pressed={formOn}
        onClick={pickForm}
        style={{
          flex: '1 1 300px',
          display: 'flex',
          gap: 16,
          alignItems: 'flex-start',
          padding: 20,
          borderRadius: 18,
          border: `2px solid ${formBorder}`,
          background: formBg,
          textAlign: 'left',
          font: 'inherit',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            flexShrink: 0,
            width: 48,
            height: 48,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#DC2626',
            color: 'var(--ink)',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6h11M9 12h11M9 18h11" />
            <path d="M4 6h.01M4 12h.01M4 18h.01" />
          </svg>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{t('onboarding.mode.form.title')}</span>
          <span style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--ink2)' }}>
            {t('onboarding.mode.form.body')}
          </span>
        </span>
      </button>
      <Link viewTransition
        to="/explore"
        style={{
          flex: '1 1 300px',
          display: 'flex',
          gap: 16,
          alignItems: 'flex-start',
          padding: 20,
          borderRadius: 18,
          border: '2px dashed var(--line2)',
          background: 'var(--glass)',
          backdropFilter: 'blur(16px) saturate(170%)',
          WebkitBackdropFilter: 'blur(16px) saturate(170%)',
          textDecoration: 'none',
          color: 'var(--ink)',
        }}
      >
        <span
          style={{
            flexShrink: 0,
            width: 48,
            height: 48,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#F6C343',
            color: '#1B1830',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
            <path d="M9 4v14M15 6v14" />
          </svg>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{t('onboarding.skipExplore')}</span>
          <span style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--ink2)' }}>
            {t('onboarding.mode.skip.body')}
          </span>
        </span>
      </Link>
    </div>
  );
}
