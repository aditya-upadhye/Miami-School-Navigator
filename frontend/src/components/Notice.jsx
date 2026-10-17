import { useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n';

/** A short-lived message for a failed background action (saving a school, signing out...). Shows the server's text as received. */
export default function Notice() {
  const { t } = useI18n();
  const { notice, showNotice } = useAuth();
  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => showNotice(null), 12000);
    return () => clearTimeout(id);
  }, [notice, showNotice]);
  if (!notice) return null;
  return (
    <div
      role="alert"
      data-testid="notice"
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 84,
        zIndex: 90,
        maxWidth: 520,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 14,
        border: '1px solid rgba(220,38,38,0.55)',
        background: 'var(--page)',
        boxShadow: 'var(--shadow)',
        color: 'var(--ink)',
        fontSize: 15,
        lineHeight: 1.45,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        {notice.message} {notice.suggestedAction}
      </span>
      <button
        type="button"
        aria-label={t('auth.notice.dismiss')}
        onClick={() => showNotice(null)}
        style={{
          flexShrink: 0,
          width: 44,
          height: 44,
          margin: '-8px -8px -8px 0',
          border: 0,
          borderRadius: 22,
          background: 'transparent',
          color: 'var(--ink)',
          cursor: 'pointer',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
