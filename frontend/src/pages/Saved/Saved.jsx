import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { KIND_LABEL, miles, stateGrade, text } from '../../api/fields';
import AppHeader from '../../components/AppHeader';
import ThemeShell from '../../components/ThemeShell';
import { useI18n } from '../../i18n';
import { useProfile } from '../../profile/ProfileProvider';
import { useSaved } from '../../saved/SavedProvider';

/** Saved schools: the ids kept in this browser, each loaded from /api/schools/:id so the details stay current. */
export default function Saved() {
  const { t } = useI18n();
  const { lang } = useI18n();
  const { profile } = useProfile();
  const { saved, toggleSaved, clearSaved } = useSaved();
  const [details, setDetails] = useState({});
  const ids = saved.map((s) => s.id).join(',');

  useEffect(() => {
    let live = true;
    Promise.all(
      saved.map((s) =>
        api
          .school(s.id, profile.lat, profile.lon)
          .then((d) => [s.id, d.school ?? d]) // the detail response wraps the school: { school, how_to_apply, ... }
          .catch(() => [s.id, null]),
      ),
    ).then((rows) => live && setDetails(Object.fromEntries(rows)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, profile.lat, profile.lon, lang]);

  return (
    <ThemeShell paddingBottom={72}>
      <AppHeader active="saved" />
      <main
        id="saved"
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '32px clamp(16px, 4vw, 40px) 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <h1 style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(30px, 4vw, 44px)', fontWeight: 800 }}>
            {t('saved.title')}
          </h1>
          {saved.length > 0 && (
            <button
              type="button"
              onClick={clearSaved}
              style={{ border: 0, background: 'none', color: 'var(--ink2)', font: "700 14px 'Figtree', sans-serif", cursor: 'pointer' }}
            >
              {t('saved.clear')}
            </button>
          )}
        </div>
        <p style={{ margin: 0, color: 'var(--ink2)' }}>{t('saved.note')}</p>
        {saved.length === 0 && (
          <p style={{ margin: 0, color: 'var(--ink2)' }}>
            {t('saved.empty')}{' '}
            <Link viewTransition to="/explore" style={{ fontWeight: 700 }}>
              {t('saved.browse')}
            </Link>
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {saved.map((s) => {
            const d = details[s.id];
            return (
              <article
                key={s.id}
                style={{
                  flex: '1 1 260px',
                  maxWidth: 420,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  padding: 16,
                  borderRadius: 18,
                  border: '2px solid var(--edge)',
                  background: 'var(--glass)',
                }}
              >
                <span style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.25 }}>{d?.name ?? s.name}</span>
                {d ? (
                  <span style={{ fontSize: 13.5, color: 'var(--ink2)' }}>
                    {[KIND_LABEL[d.kind], text(d.grades, ''), stateGrade(d.state_grade), d.distance_mi && miles(d.distance_mi)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                ) : (
                  <span style={{ fontSize: 13.5, color: 'var(--ink2)' }}>{t('saved.loading')}</span>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                  <Link viewTransition
                    to={`/school/${s.id}`}
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 44,
                      borderRadius: 12,
                      background: 'var(--accent-grad)',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      fontSize: 14,
                      textDecoration: 'none',
                    }}
                  >
                    {t('explore.card.details')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleSaved(s.id, s.name)}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      borderRadius: 12,
                      border: '1.5px solid var(--line2)',
                      background: 'transparent',
                      color: 'var(--ink)',
                      font: "700 14px 'Figtree', sans-serif",
                      cursor: 'pointer',
                    }}
                  >
                    {t('saved.remove')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </ThemeShell>
  );
}
