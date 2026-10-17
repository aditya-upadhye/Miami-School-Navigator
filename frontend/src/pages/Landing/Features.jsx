import { useI18n } from '../../i18n';

const ITEMS = [
  { key: 'landing.hero.f1', bg: 'var(--pastel-mint)', icon: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></> },
  { key: 'landing.hero.f2', bg: 'var(--pastel-lav)', icon: <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="9.5" y="4" width="5" height="16" rx="1" /><rect x="16" y="4" width="5" height="16" rx="1" /></> },
  { key: 'landing.hero.f3', bg: 'var(--pastel-yellow)', icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { key: 'landing.hero.f4', bg: 'var(--pastel-pink)', icon: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7" /></> },
];

/** What the app does, as four small pastel cards. */
export default function Features() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="features-title" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
      <h2 id="features-title" style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(28px, 3.4vw, 38px)', fontWeight: 800, textAlign: 'center' }}>
        {t('landing.features.title')}
      </h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
        {ITEMS.map((i) => (
          <li key={i.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 22px', borderRadius: 22, background: i.bg, color: 'var(--ink)', fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>
            <span aria-hidden="true" style={{ flexShrink: 0, width: 46, height: 46, borderRadius: '55% 45% 50% 50% / 50% 55% 45% 50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', boxShadow: '0 3px 10px rgba(50, 30, 110, 0.1)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {i.icon}
              </svg>
            </span>
            {t(i.key)}
          </li>
        ))}
      </ul>
    </section>
  );
}
