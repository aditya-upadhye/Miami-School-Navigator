import { Link } from 'react-router-dom';
import AccountMenu from '../../components/AccountMenu';
import BrandLogo from '../../components/BrandLogo';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';
import { useProfile } from '../../profile/ProfileProvider';

const LANGS = [
  ['en', 'English'],
  ['es', 'Español'],
  ['ht', 'Kreyòl'],
];

const quietLink = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '0 14px',
  borderRadius: 999,
  fontWeight: 700,
  fontSize: 15,
  textDecoration: 'none',
};

/** Logo on the left; language and the two account links on the right, kept quiet so the three main actions stay the focus. */
export default function LandingHeader() {
  const { profile, setLang } = useProfile();
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '20px clamp(16px, 4vw, 48px)' }}>
      <BrandLogo size="lg" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div role="group" aria-label={t('nav.language')} style={{ display: 'flex', gap: 2, padding: 4, background: 'var(--glass2)', border: '1px solid var(--surface-line)', borderRadius: 999 }}>
          {LANGS.map(([code, label]) => {
            const on = profile.lang === code;
            return (
              <button
                key={code}
                type="button"
                aria-pressed={on}
                onClick={() => setLang(code)}
                title={t('landing.lang.title')}
                style={{
                  minHeight: 36,
                  padding: '0 14px',
                  border: 0,
                  borderRadius: 999,
                  background: on ? 'var(--accent)' : 'transparent',
                  color: on ? 'var(--on-accent)' : 'var(--ink)',
                  font: "600 14px 'Figtree', sans-serif",
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        {user ? (
          <AccountMenu />
        ) : (
          <>
            <Link viewTransition to="/account" style={{ ...quietLink, color: 'var(--ink)' }}>
              {t('account.signIn')}
            </Link>
            <Link viewTransition to="/account?tab=signup" style={{ ...quietLink, padding: '0 22px', background: 'var(--cta)', color: 'var(--cta-ink)' }}>
              {t('account.createLink')}
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
