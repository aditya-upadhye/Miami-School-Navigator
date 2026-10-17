import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { primaryButton, secondaryButton } from '../../auth/ui';
import { useI18n } from '../../i18n';
import { useProfile } from '../../profile/ProfileProvider';
import AuthForm from '../Auth/AuthForm';

export default function SignupCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  return (
    <section
      aria-labelledby="signup-title"
      style={{
        flex: '0 1 440px',
        marginLeft: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        padding: 'clamp(20px, 5vw, 34px)',
        borderRadius: 24,
        background: 'var(--glass)',
        backdropFilter: 'blur(16px) saturate(170%)',
        WebkitBackdropFilter: 'blur(16px) saturate(170%)',
        boxShadow: '0 24px 60px rgba(16,35,46,0.18)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#B8432A',
          }}
        >
          {t('landing.signup.eyebrow')}
        </span>
        <h2
          id="signup-title"
          style={{
            margin: 0,
            fontFamily: "'Outfit', sans-serif",
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: '-0.01em',
          }}
        >
          {t('landing.signup.title')}
        </h2>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--ink2)' }}>
          {t('landing.signup.lede')}
        </p>
      </div>
      {user ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p role="status" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            {t('auth.signedInAs', { who: user.name || user.email })}
          </p>
          <Link to={profile.isDemo ? '/onboarding' : '/explore'} style={primaryButton}>
            {t(profile.isDemo ? 'auth.continueOnboarding' : 'auth.goExplore')}
          </Link>
          <Link to="/account" style={secondaryButton}>
            {t('auth.account')}
          </Link>
        </div>
      ) : (
        <>
          <AuthForm mode="signup" onSuccess={() => navigate(profile.isDemo ? '/onboarding' : '/explore')} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--ink3)' }}>
            <span style={{ flexGrow: 1, height: 1, background: 'var(--line)' }} />
            {t('landing.signup.or')}
            <span style={{ flexGrow: 1, height: 1, background: 'var(--line)' }} />
          </div>
          <Link
            to="/onboarding"
            style={{ ...secondaryButton, minHeight: 48, fontSize: 16, borderRadius: 14 }}
          >
            {t('auth.guest')}
          </Link>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink2)', textAlign: 'center' }}>
            {t('landing.signup.have')}{' '}
            <Link to="/login" style={{ fontWeight: 700 }}>
              {t('landing.signIn')}
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
