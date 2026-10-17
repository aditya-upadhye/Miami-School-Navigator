import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';

const pillLink = { display: 'inline-flex', alignItems: 'center', minHeight: 50, padding: '0 28px', borderRadius: 999, fontWeight: 800, fontSize: 16, textDecoration: 'none' };

/** Closing band on the same pastel sweep as the hero: one invitation, the account links. */
export default function Cta() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <footer style={{ background: 'var(--hero-grad)', borderRadius: '50% 50% 0 0 / 70px 70px 0 0', padding: '64px clamp(16px, 5vw, 64px) 40px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
        <h2 style={{ margin: 0, maxWidth: 460, fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(28px, 3.4vw, 40px)', fontWeight: 800, lineHeight: 1.1, textWrap: 'balance' }}>
          {t('landing.cta.title')}
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {user ? (
            <Link to="/explore" style={{ ...pillLink, background: 'var(--cta)', color: 'var(--cta-ink)' }}>
              {t('landing.explore.title')}
            </Link>
          ) : (
            <>
              <Link to="/account?tab=signup" style={{ ...pillLink, background: 'var(--cta)', color: 'var(--cta-ink)' }}>
                {t('account.createLink')}
              </Link>
              <Link to="/account" style={{ ...pillLink, border: '1.5px solid var(--ink)', color: 'var(--ink)' }}>
                {t('account.signIn')}
              </Link>
            </>
          )}
        </div>
      </div>
    </footer>
  );
}
