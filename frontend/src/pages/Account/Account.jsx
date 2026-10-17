import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import BackButton from '../../components/BackButton';
import BrandLogo from '../../components/BrandLogo';
import MenuButton from '../../components/MenuButton';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import ThemeShell from '../../components/ThemeShell';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';

const input = {
  height: 48,
  padding: '0 14px',
  border: '1.5px solid var(--line2)',
  borderRadius: 12,
  font: "16px 'Figtree', sans-serif",
  color: 'var(--ink)',
};
const field = { display: 'flex', flexDirection: 'column', gap: 6 };
const labelStyle = { fontSize: 14, fontWeight: 600 };

/** Sign in or create an account. One page, two tabs; `?tab=signup` opens the second, `?next=/path` is where to go afterwards. */
export default function Account() {
  const { t } = useI18n();
  const { user, signIn, signUp, signOut } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const signup = params.get('tab') === 'signup';
  const next = params.get('next');
  const to = next && next.startsWith('/') && !next.startsWith('//') ? next : '/explore'; // only ever stay inside the app
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const pick = (tab) => {
    setError(null);
    const p = new URLSearchParams(params);
    if (tab === 'signup') p.set('tab', 'signup');
    else p.delete('tab');
    setParams(p, { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      if (signup) {
        await signUp({
          name: String(f.get('name')).trim(),
          email: String(f.get('email')).trim(),
          password: String(f.get('password')),
          zip: String(f.get('zip') ?? '').trim() || undefined,
        });
      } else {
        await signIn({ email: String(f.get('email')).trim(), password: String(f.get('password')) });
      }
      navigate(to, { replace: true }); // replace: Back from the next page should not return to the sign-in form
    } catch (err) {
      setError(`${err.message} ${err.suggestedAction ?? ''}`.trim());
    } finally {
      setBusy(false);
    }
  };

  const tab = (on) => ({
    flex: 1,
    minHeight: 44,
    border: 0,
    borderRadius: 999,
    background: on ? 'var(--panel-dark)' : 'transparent',
    color: on ? '#FFFFFF' : 'var(--ink)',
    font: "700 15px 'Figtree', sans-serif",
    cursor: 'pointer',
  });

  return (
    <ThemeShell>
      <header
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '20px clamp(16px, 4vw, 48px)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <BackButton fallback="/" />
          <BrandLogo />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <LanguageSwitcher />
          <MenuButton />
          <Link to="/explore" style={{ fontWeight: 700 }}>
            {t('account.continueGuest')}
          </Link>
        </div>
      </header>
      <main style={{ maxWidth: 480, margin: '0 auto', padding: '24px clamp(16px, 4vw, 24px) 64px' }}>
        <section
          aria-labelledby="account-title"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            padding: 30,
            borderRadius: 24,
            background: 'var(--glass)',
            backdropFilter: 'blur(16px) saturate(170%)',
            WebkitBackdropFilter: 'blur(16px) saturate(170%)',
            boxShadow: '0 24px 60px rgba(16,35,46,0.18)',
          }}
        >
          {user ? (
            <>
              <h1 id="account-title" style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 28 }}>
                {t('account.already', { name: user.name })}
              </h1>
              <Link
                to={to}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 14, background: 'var(--accent-grad)', color: 'var(--on-accent)', fontWeight: 700, textDecoration: 'none' }}
              >
                {t('account.continue')}
              </Link>
              <button type="button" onClick={signOut} style={{ ...tab(false), flex: 'none', border: '1.5px solid var(--line2)' }}>
                {t('account.signOut')}
              </button>
            </>
          ) : (
            <>
              <h1 id="account-title" style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 28, letterSpacing: '-0.01em' }}>
                {t(signup ? 'account.title.signup' : 'account.title.signin')}
              </h1>
              <div role="group" aria-label={t('account.tabsAria')} style={{ display: 'flex', gap: 2, padding: 4, background: 'var(--edge)', borderRadius: 999 }}>
                <button type="button" aria-pressed={!signup} onClick={() => pick('signin')} style={tab(!signup)}>
                  {t('account.tab.signin')}
                </button>
                <button type="button" aria-pressed={signup} onClick={() => pick('signup')} style={tab(signup)}>
                  {t('account.tab.signup')}
                </button>
              </div>
              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {signup && (
                  <div style={field}>
                    <label htmlFor="ac-name" style={labelStyle}>{t('account.name')}</label>
                    <input id="ac-name" name="name" type="text" required maxLength={80} autoComplete="name" placeholder={t('account.namePh')} style={input} />
                  </div>
                )}
                <div style={field}>
                  <label htmlFor="ac-email" style={labelStyle}>{t('account.email')}</label>
                  <input id="ac-email" name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@example.com" style={input} />
                </div>
                <div style={field}>
                  <label htmlFor="ac-pass" style={labelStyle}>{t('account.password')}</label>
                  <input
                    id="ac-pass"
                    name="password"
                    type="password"
                    required
                    minLength={signup ? 8 : undefined}
                    maxLength={128}
                    autoComplete={signup ? 'new-password' : 'current-password'}
                    style={input}
                  />
                  {signup && <span style={{ fontSize: 13, color: 'var(--ink2)' }}>{t('account.passwordHint')}</span>}
                </div>
                {signup && (
                  <div style={field}>
                    <label htmlFor="ac-zip" style={labelStyle}>{t('account.zip')}</label>
                    <input id="ac-zip" name="zip" type="text" maxLength={40} autoComplete="postal-code" placeholder={t('account.zipPh')} style={input} />
                  </div>
                )}
                {error && (
                  <p role="alert" style={{ margin: 0, padding: '10px 14px', borderRadius: 12, background: 'rgba(220,38,38,0.14)', color: 'var(--ink)' }}>
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  style={{ minHeight: 52, borderRadius: 14, border: 0, background: 'var(--accent-grad)', boxShadow: 'var(--accent-shadow)', color: 'var(--on-accent)', font: "700 17px 'Figtree', sans-serif", cursor: 'pointer', opacity: busy ? 0.7 : 1 }}
                >
                  {busy ? t('account.working') : t(signup ? 'account.submit.signup' : 'account.submit.signin')}
                </button>
              </form>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink2)' }}>{t('account.privacy')}</p>
            </>
          )}
        </section>
      </main>
    </ThemeShell>
  );
}
