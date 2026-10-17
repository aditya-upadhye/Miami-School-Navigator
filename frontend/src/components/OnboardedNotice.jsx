import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n';

/**
 * Shown on the first screen after the family form is submitted (router state `onboarded`).
 * Signed in: confirms the profile is saved to the account. Guest: a gentle nudge to create a free account.
 */
export default function OnboardedNotice() {
  const { t } = useI18n();
  const { state } = useLocation();
  const { user, profileStatus } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSettled(true), 1600); // the save starts ~0.8 s after the change
    return () => clearTimeout(id);
  }, []);
  if (!state?.onboarded || dismissed) return null;

  let body;
  if (user) {
    const saved = profileStatus === 'saved' || (profileStatus === null && settled);
    body = t(
      profileStatus === 'error'
        ? 'account.profile.error'
        : saved
          ? 'account.profile.saved'
          : 'account.profile.saving',
    );
  } else {
    body = (
      <Link to="/signup?next=%2Fexplore" style={{ fontWeight: 700 }}>
        {t('auth.nudge')}
      </Link>
    );
  }
  return (
    <div
      role="status"
      data-testid="onboarded-notice"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '4px clamp(16px, 3vw, 40px)',
        background: 'var(--glass3)',
        borderBottom: '1px solid var(--line)',
        fontSize: 15,
        color: 'var(--ink)',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>{body}</span>
      <button
        type="button"
        aria-label={t('auth.notice.dismiss')}
        onClick={() => setDismissed(true)}
        style={{
          width: 44,
          height: 44,
          border: 0,
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
