import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';

export default function ComparePanel({
  clearCmp,
  cmpCols,
  cmpMessage,
  cmpCountLabel,
  cmpFull,
  cmpHead,
  cmpMinW,
  cmpRows,
  hasCmp,
  noCmp,
}) {
  const { t } = useI18n();
  return (
    <section
      id="compare"
      aria-labelledby="compare-title"
      style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '40px clamp(16px, 3vw, 40px) 0' }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2
            id="compare-title"
            style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 26, fontWeight: 700 }}
          >
            {t('explore.compare.title')}
          </h2>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              color: 'var(--ink2)',
            }}
          >
            <span
              style={{ width: 14, height: 14, borderRadius: 7, background: '#F6C343', color: '#1B1830' }}
            />
            {t('explore.compare.countLine', { count: cmpCountLabel })}
          </span>
        </div>
        {hasCmp && (
          <button
            type="button"
            onClick={clearCmp}
            style={{
              minHeight: 44,
              padding: '0 16px',
              borderRadius: 12,
              border: '1.5px solid var(--line2)',
              background: 'var(--glass)',
              backdropFilter: 'blur(16px) saturate(170%)',
              WebkitBackdropFilter: 'blur(16px) saturate(170%)',
              color: 'var(--ink)',
              font: "700 14px 'Figtree', sans-serif",
              cursor: 'pointer',
            }}
          >
            {t('explore.compare.clear')}
          </button>
        )}
      </div>
      {cmpFull && (
        <p
          role="status"
          style={{
            margin: 0,
            padding: '12px 16px',
            borderRadius: 12,
            background: '#FFF0C2',
            fontSize: 15,
            fontWeight: 600,
            color: '#1B1830',
          }}
        >
          {t('explore.compare.full')}
        </p>
      )}
      {cmpMessage && <p style={{ margin: 0, color: 'var(--ink2)' }}>{cmpMessage}</p>}
      {noCmp && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            padding: '40px 20px',
            borderRadius: 20,
            border: '2px dashed var(--line2)',
            background: 'var(--glass)',
            backdropFilter: 'blur(16px) saturate(170%)',
            WebkitBackdropFilter: 'blur(16px) saturate(170%)',
            textAlign: 'center',
          }}
        >
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700 }}>
            {t('explore.compare.empty.title')}
          </span>
          <span style={{ fontSize: 15, color: 'var(--ink2)' }}>{t('explore.compare.empty.body')}</span>
        </div>
      )}
      {hasCmp && (
        <div
          style={{
            overflowX: 'auto',
            borderRadius: 20,
            border: '1px solid var(--edge)',
            boxShadow: 'var(--shadow)',
            background: 'var(--glass)',
            backdropFilter: 'blur(16px) saturate(170%)',
            WebkitBackdropFilter: 'blur(16px) saturate(170%)',
          }}
        >
          <div style={{ minWidth: cmpMinW, display: 'flex', flexDirection: 'column' }}>
            <div
              style={{ display: 'grid', gridTemplateColumns: cmpCols, borderBottom: '1px solid var(--edge)' }}
            >
              <div
                style={{
                  padding: '18px 20px',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--ink3)',
                  alignSelf: 'end',
                }}
              >
                {t('explore.compare.side')}
              </div>
              {cmpHead.map((h, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    padding: '18px 20px',
                    borderLeft: '1px solid var(--line)',
                    borderTop: '6px solid #F6C343',
                    color: 'var(--ink)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Outfit', sans-serif",
                        fontSize: 18,
                        fontWeight: 700,
                        lineHeight: 1.2,
                      }}
                    >
                      {h.name}
                    </span>
                    <button
                      type="button"
                      aria-label={h.removeLabel}
                      onClick={h.remove}
                      style={{
                        flexShrink: 0,
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        border: 0,
                        background: 'var(--glass3)',
                        color: 'var(--ink)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 14, fontWeight: 700 }}>
                    <Link to={`/school/${h.id}`}>{t('explore.card.details')}</Link>
                    <Link to="/pathway">{t('explore.compare.pathway')}</Link>
                  </div>
                </div>
              ))}
            </div>
            {cmpRows.map((row, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: cmpCols,
                  borderBottom: '1px solid var(--track)',
                }}
              >
                <div style={{ padding: '14px 20px', fontSize: 14, fontWeight: 700, color: 'var(--ink2)' }}>
                  {row.label}
                </div>
                {row.cells.map((cell, j) => (
                  <div
                    key={j}
                    title={cell.title}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 8,
                      padding: '14px 20px',
                      borderLeft: '1px solid var(--line)',
                      background: cell.bg,
                      fontSize: 15,
                      // the "best" highlight is a light tan in both themes, so it needs dark text
                      color: cell.best ? '#1B1830' : cell.missing ? 'var(--ink3)' : 'var(--ink)',
                      fontStyle: cell.missing ? 'italic' : 'normal',
                    }}
                  >
                    {cell.text}
                    {cell.best && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'var(--accent-grad)',
                          boxShadow: 'var(--accent-shadow)',
                          color: '#FFFFFF',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {t('explore.compare.best')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
