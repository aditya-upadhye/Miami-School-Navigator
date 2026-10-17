import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';

const ICONS = {
  map: (
    <>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z" />,
  form: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
};

// The three ways to start, as pastel cards (pink, lavender, yellow). Dark text on every card, so it reads the same in both themes.
const OPTIONS = [
  { key: 'explore', to: '/explore', icon: 'map', bg: 'var(--pastel-pink)', title: 'landing.explore.title', body: 'onboarding.mode.skip.body' },
  { key: 'chat', to: '/onboarding?mode=chat', icon: 'chat', bg: 'var(--pastel-lav)', title: 'onboarding.mode.chat.title', body: 'onboarding.mode.chat.body' },
  { key: 'form', to: '/onboarding?mode=form', icon: 'form', bg: 'var(--pastel-yellow)', title: 'onboarding.mode.form.title', body: 'onboarding.mode.form.body' },
];

export default function StartCard() {
  const { t } = useI18n();
  return (
    <section id="start" aria-labelledby="start-title" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 id="start-title" style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(24px, 2.6vw, 30px)', fontWeight: 800 }}>
          {t('onboarding.title')}
        </h2>
        <span style={{ fontSize: 16, color: 'var(--ink2)' }}>{t('landing.start.sub')}</span>
      </div>
      <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 18 }}>
        {OPTIONS.map((o) => (
          <Link viewTransition
            key={o.key}
            to={o.to}
            className="land-card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 22,
              borderRadius: 24,
              border: '1.5px solid transparent',
              background: o.bg,
              textDecoration: 'none',
              color: 'var(--ink)',
            }}
          >
            <span style={{ width: 46, height: 46, borderRadius: '58% 42% 55% 45% / 48% 55% 45% 52%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 3px 10px rgba(50, 30, 110, 0.1)' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {ICONS[o.icon]}
              </svg>
            </span>
            <span style={{ marginTop: 4, fontFamily: "'Outfit', sans-serif", fontSize: 21, fontWeight: 700, lineHeight: 1.2 }}>{t(o.title)}</span>
            <span style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--ink2)' }}>{t(o.body)}</span>
            <span aria-hidden="true" style={{ marginTop: 'auto', paddingTop: 4, fontSize: 20, fontWeight: 700 }}>
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
