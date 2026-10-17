import { Link } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import ThemeShell from '../../components/ThemeShell';
import { primaryButton } from '../../auth/ui';
import { useI18n } from '../../i18n';
import { useProfile } from '../../profile/ProfileProvider';
import SavedCard from './SavedCard';
import { useSavedSchools } from './useSavedSchools';

export default function Saved() {
  const { t, tp } = useI18n();
  const { profile } = useProfile();
  const { rows, saved } = useSavedSchools();
  const { signedIn, loading, loadError, count } = saved;
  const waiting = signedIn && loading && rows.length === 0;
  return (
    <ThemeShell paddingBottom={96}>
      <AppHeader active="saved" />
      <main
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '32px clamp(16px, 4vw, 40px) 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: "'Outfit', sans-serif",
              fontSize: 'clamp(32px, 3.8vw, 50px)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
            }}
          >
            {t('saved.title')}
          </h1>
          <p
            style={{ margin: 0, maxWidth: 760, fontSize: 18, lineHeight: 1.5, color: 'var(--ink2)' }}
            aria-live="polite"
          >
            {waiting ? t('saved.loading') : tp('saved.count', count)}
          </p>
        </div>

        {!signedIn && (
          <p
            style={{
              margin: 0,
              padding: '12px 16px',
              borderRadius: 14,
              background: 'var(--glass3)',
              border: '1px solid var(--line)',
              fontSize: 15,
              lineHeight: 1.5,
              color: 'var(--ink2)',
            }}
          >
            {t('saved.guest.note')}{' '}
            <Link to="/signup?next=%2Fsaved" style={{ fontWeight: 700 }}>
              {t('saved.guest.signup')}
            </Link>{' '}
            ·{' '}
            <Link to="/login?next=%2Fsaved" style={{ fontWeight: 700 }}>
              {t('landing.signIn')}
            </Link>
          </p>
        )}

        {loadError && (
          <p role="alert" style={{ margin: 0 }}>
            {loadError.message} {loadError.suggestedAction}{' '}
            <button
              type="button"
              onClick={saved.reload}
              style={{
                background: 'none',
                border: 0,
                padding: 0,
                color: 'var(--accent-ink)',
                font: 'inherit',
                fontWeight: 700,
                textDecoration: 'underline',
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              {t('saved.card.retry')}
            </button>
          </p>
        )}

        {rows.length === 0 && !waiting && !loadError && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
            <p style={{ margin: 0, fontSize: 16, color: 'var(--ink2)' }}>{t('saved.empty')}</p>
            <Link to="/explore" style={primaryButton}>
              {t('saved.empty.cta')}
            </Link>
          </div>
        )}

        {rows.length > 0 && (
          <ul
            aria-label={t('saved.list.aria')}
            style={{
              margin: 0,
              padding: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
              gap: 14,
            }}
          >
            {rows.map((row) => (
              <SavedCard
                key={row.id}
                row={row}
                profile={profile}
                signedIn={signedIn}
                onRemove={() => saved.remove(row.id)}
                onNote={(note) => saved.setNote(row.id, note)}
              />
            ))}
          </ul>
        )}
      </main>
    </ThemeShell>
  );
}
