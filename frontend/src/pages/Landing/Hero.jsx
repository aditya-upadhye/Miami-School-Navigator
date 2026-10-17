import { useI18n } from '../../i18n';
import HeroArt from './HeroArt';

/** Left: headline, one line of explanation, one yellow button. Right: the illustration. Sits on a soft pastel sweep. */
export default function Hero() {
  const { t } = useI18n();
  return (
    <section style={{ padding: '0 clamp(16px, 5vw, 64px) 20px' }}>
      {/* On a phone the illustration would push the three choices below the fold, so it is hidden there. */}
      <style>{'@media (max-width: 700px) { .hero-art { display: none !important; } }'}</style>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '24px 40px' }}>
        <div style={{ flex: '1 1 420px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent-ink)' }}>
            {t('landing.hero.badge')}
          </span>
          <h1
            style={{
              margin: 0,
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 800,
              fontSize: 'clamp(36px, 4.6vw, 56px)',
              lineHeight: 1.04,
              letterSpacing: '-0.02em',
              textWrap: 'balance',
              // plain, high-contrast text (the global gradient headline style is switched off here for readability)
              background: 'none',
              WebkitTextFillColor: 'var(--ink)',
              color: 'var(--ink)',
            }}
          >
            {t('landing.hero.title')}
          </h1>
          <p style={{ margin: 0, maxWidth: 520, fontSize: 'clamp(16px, 1.4vw, 18px)', lineHeight: 1.5, color: 'var(--ink2)' }}>
            {t('landing.hero.lede')}
          </p>
        </div>
        <div style={{ flex: '1 1 340px', display: 'flex', justifyContent: 'center', maxWidth: 380 }} className="hero-art">
          <HeroArt />
        </div>
      </div>
    </section>
  );
}
