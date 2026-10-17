import { useI18n } from '../../i18n';

export default function PathwayHeading({ intro, kids, title }) {
  const { t } = useI18n();
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 20,
      }}
    >
      <div style={{ flex: '1 1 520px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: "'Outfit', sans-serif",
            fontSize: 'clamp(34px, 3.8vw, 52px)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            lineHeight: 1.02,
          }}
        >
          {title}
        </h1>
        <p style={{ margin: 0, maxWidth: 680, fontSize: 18, lineHeight: 1.5, color: 'var(--ink2)' }}>
          {intro}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
        <div
          style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 14, background: 'var(--line)' }}
          aria-label={t('pathway.childAria')}
        >
          {kids.map((k, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={k.on}
              onClick={k.pick}
              style={{
                minHeight: 42,
                padding: '0 16px',
                borderRadius: 10,
                border: 0,
                background: k.bg,
                color: 'var(--ink)',
                font: `${k.weight} 15px 'Figtree', sans-serif`,
                boxShadow: k.shadow,
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
