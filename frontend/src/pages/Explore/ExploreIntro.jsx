import { useI18n } from '../../i18n';
export default function ExploreIntro({ badge, kids, subtitle, title, views }) {
  const { t } = useI18n();
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: '16px 24px',
        padding: '24px clamp(16px, 3vw, 40px) 18px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: "'Outfit', sans-serif",
            fontSize: 'clamp(28px, 2.8vw, 38px)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h1>
        <p
          style={{
            margin: 0,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            fontSize: 16,
            color: 'var(--ink2)',
          }}
        >
          {subtitle}
          {badge && (
            <span
              style={{
                padding: '3px 10px',
                borderRadius: 999,
                background: 'var(--glass)',
                backdropFilter: 'blur(16px) saturate(170%)',
                WebkitBackdropFilter: 'blur(16px) saturate(170%)',
                border: '1px solid var(--edge)',
                boxShadow: 'var(--shadow)',
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              {badge}
            </span>
          )}
        </p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            maxWidth: '100%',
            gap: 4,
            padding: 4,
            borderRadius: 14,
            background: 'var(--line)',
          }}
          aria-label={t('explore.view.aria')}
        >
          {views.map((v, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={v.on}
              onClick={v.pick}
              style={{
                minHeight: 40,
                padding: '0 16px',
                borderRadius: 10,
                border: 0,
                background: v.bg,
                color: 'var(--ink)',
                font: `${v.weight} 15px 'Figtree', sans-serif`,
                boxShadow: v.shadow,
                cursor: 'pointer',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}
          aria-label={t('explore.for.aria')}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink2)' }}>{t('explore.for')}</span>
          {kids.map((k, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={k.on}
              onClick={k.pick}
              style={{
                minHeight: 40,
                padding: '0 14px',
                borderRadius: 999,
                border: `1.5px solid ${k.border}`,
                background: k.bg,
                color: k.fg,
                font: "600 14px 'Figtree', sans-serif",
                cursor: 'pointer',
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
