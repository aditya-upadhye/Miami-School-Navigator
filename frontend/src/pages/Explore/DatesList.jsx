import { useI18n } from '../../i18n';
export default function DatesList({ dates }) {
  const { t } = useI18n();
  return (
    <section
      id="dates"
      aria-labelledby="dates-title"
      style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '40px clamp(16px, 3vw, 40px) 0' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2
          id="dates-title"
          style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 26, fontWeight: 700 }}
        >
          {t('explore.dates.title')}
        </h2>
        <span style={{ fontSize: 14, color: 'var(--ink2)' }}>{t('explore.dates.subtitle')}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {dates.map((d, i) => (
          <div
            key={i}
            style={{
              flex: '1 1 230px',
              display: 'flex',
              gap: 14,
              alignItems: 'flex-start',
              padding: 16,
              borderRadius: 18,
              background: 'var(--glass)',
              backdropFilter: 'blur(16px) saturate(170%)',
              WebkitBackdropFilter: 'blur(16px) saturate(170%)',
              border: '1px solid var(--edge)',
              boxShadow: 'var(--shadow)',
            }}
          >
            <span
              style={{
                flexShrink: 0,
                minWidth: 62,
                padding: '8px 6px',
                borderRadius: 14,
                background: d.color,
                color: '#FFFFFF',
                textAlign: 'center',
                fontFamily: "'Outfit', sans-serif",
                fontSize: 17,
                fontWeight: 800,
                lineHeight: 1.1,
              }}
            >
              {d.when}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{d.what}</span>
              <span style={{ fontSize: 14, color: 'var(--ink2)' }}>{d.who}</span>
              <span style={{ fontSize: 13.5, color: 'var(--ink2)' }}>{d.note}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
