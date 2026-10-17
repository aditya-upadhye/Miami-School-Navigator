import { useRef } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import BrandLogo from '../../components/BrandLogo';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import ThemeShell from '../../components/ThemeShell';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';
import { useProfile } from '../../profile/ProfileProvider';
import { safeNext } from '../../saved/savedLogic';
import AuthForm from './AuthForm';

/** /login and /signup. `?next=/some/path` says where to go afterwards (same-site paths only). */
export default function AuthPage({ mode }) {
  const { t } = useI18n();
  const { user, ready } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { search } = useLocation();
  const submitted = useRef(false);
  const signup = mode === 'signup';
  const rawNext = params.get('next');
  const next = safeNext(rawNext, null); // null when absent or unsafe
  const other = `${signup ? '/login' : '/signup'}${next ? `?next=${encodeURIComponent(next)}` : ''}`;

  // Already signed in (and not because of a submit on this page): nothing to do here.
  if (ready && user && !submitted.current) return <Navigate to={next ?? '/explore'} replace />;

  const onSuccess = () => {
    // A new account that is still on the demo family goes on to tell us about their family.
    navigate(signup && profile.isDemo && !next ? '/onboarding' : (next ?? '/explore'), { replace: true, viewTransition: true });
  };

  return (
    <ThemeShell>
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '16px clamp(16px, 4vw, 48px)',
          background: 'var(--glass)',
          backdropFilter: 'blur(16px) saturate(170%)',
          WebkitBackdropFilter: 'blur(16px) saturate(170%)',
          borderBottom: '1px solid var(--edge)',
        }}
      >
        <BrandLogo />
        <LanguageSwitcher />
      </header>
      <main style={{ display: 'flex', justifyContent: 'center', padding: '40px 16px 96px' }}>
        <section
          aria-labelledby="auth-title"
          style={{
            width: '100%',
            maxWidth: 440,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            padding: 'clamp(20px, 5vw, 34px)',
            borderRadius: 24,
            background: 'var(--glass)',
            backdropFilter: 'blur(16px) saturate(170%)',
            WebkitBackdropFilter: 'blur(16px) saturate(170%)',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1
              id="auth-title"
              style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 32, fontWeight: 800 }}
            >
              {t(signup ? 'auth.signup.title' : 'auth.login.title')}
            </h1>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--ink2)' }}>
              {t(signup ? 'auth.signup.lede' : 'auth.login.lede')}
            </p>
          </div>
          <AuthForm
            key={mode + search}
            mode={mode}
            onSubmitStart={() => (submitted.current = true)}
            onSuccess={onSuccess}
          />
          <p style={{ margin: 0, fontSize: 15, color: 'var(--ink2)' }}>
            {t(signup ? 'auth.haveAccount' : 'auth.noAccount')}{' '}
            <Link viewTransition to={other} style={{ fontWeight: 700 }}>
              {t(signup ? 'auth.goLogin' : 'auth.goSignup')}
            </Link>
          </p>
          <p style={{ margin: 0, fontSize: 15 }}>
            <Link viewTransition to="/onboarding" style={{ fontWeight: 700 }}>
              {t('auth.guest')}
            </Link>
          </p>
        </section>
      </main>
    </ThemeShell>
  );
}
