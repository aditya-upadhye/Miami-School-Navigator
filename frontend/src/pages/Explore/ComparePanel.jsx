import { Link } from 'react-router-dom';
import ScoreChart, { SERIES_COLORS } from '../../components/ScoreChart';
import { useI18n } from '../../i18n';

// One accent per school card (purple, green, amber) and an icon for the kind of school.
export const CARD_COLORS = SERIES_COLORS;
const KIND_ICON = {
  public: (
    <>
      <path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6" />
      <path d="M12 10h.01" />
    </>
  ),
  charter: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  private: (
    <>
      <path d="M2 9l10-5 10 5-10 5-10-5z" />
      <path d="M6 11v5c3 2.5 9 2.5 12 0v-5" />
    </>
  ),
  early_learning: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
};

export default function ComparePanel({
  clearCmp,
  cmpChart = [],
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
      style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '40px clamp(16px, 3vw, 40px) 0', scrollMarginTop: 56 /* clear of the fixed header */ }}
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
        <div style={{ overflowX: 'auto', padding: '6px 2px 10px' }}>
          <div style={{ minWidth: cmpMinW, display: 'flex', flexDirection: 'column' }}>
            {/* One card per school: a coloured bar fading across the top, a tinted icon tile, its number, and the name. The rows below line up
                across the cards so the schools can still be compared line by line. */}
            <div style={{ display: 'grid', gridTemplateColumns: cmpCols, columnGap: 16 }}>
              <div style={{ padding: '18px 8px 18px 0', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink2)', alignSelf: 'end' }}>
                {t('explore.compare.side')}
              </div>
              {cmpHead.map((h, i) => {
                const color = CARD_COLORS[i % CARD_COLORS.length];
                return (
                  <div
                    key={i}
                    style={{
                      position: 'relative',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      padding: '24px 22px 18px',
                      borderRadius: '22px 22px 0 0',
                      border: '1px solid var(--surface-line)',
                      borderBottom: 0,
                      background: 'var(--surface)',
                      color: 'var(--ink)',
                    }}
                  >
                    <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 4, background: `linear-gradient(90deg, ${color}, ${color}00 88%)` }} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span aria-hidden="true" style={{ width: 52, height: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}2e`, color }}>
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          {KIND_ICON[h.kind] ?? KIND_ICON.public}
                        </svg>
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 15, color: 'var(--ink3)', fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</span>
                        <button
                          type="button"
                          aria-label={h.removeLabel}
                          onClick={h.remove}
                          style={{ width: 32, height: 32, borderRadius: 16, border: 0, background: 'var(--glass3)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                            <path d="M6 6l12 12M18 6 6 18" />
                          </svg>
                        </button>
                      </span>
                    </div>
                    <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{h.name}</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 14, fontWeight: 700 }}>
                      <Link viewTransition to={`/school/${h.id}`} style={{ color: 'var(--accent-ink)' }}>{t('explore.card.details')}</Link>
                      <Link viewTransition to="/pathway" style={{ color: 'var(--accent-ink)' }}>{t('explore.compare.pathway')}</Link>
                    </div>
                  </div>
                );
              })}
            </div>
            {cmpRows.map((row, i) => {
              const last = i === cmpRows.length - 1;
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: cmpCols, columnGap: 16 }}>
                  <div style={{ padding: '14px 8px 14px 0', fontSize: 14, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--surface-line)' }}>
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
                        padding: '14px 22px',
                        border: '1px solid var(--surface-line)',
                        borderTop: 0,
                        borderBottom: last ? '1px solid var(--surface-line)' : '1px solid var(--line)',
                        borderRadius: last ? '0 0 22px 22px' : 0,
                        backgroundColor: 'var(--surface)',
                        // the winner's highlight and the gentle row stripes are layered over the card's solid surface
                        backgroundImage: cell.best
                          ? 'linear-gradient(var(--accent-tint), var(--accent-tint))'
                          : i % 2
                            ? 'linear-gradient(rgba(127,127,160,0.08), rgba(127,127,160,0.08))'
                            : 'none',
                        fontSize: 15,
                        color: cell.missing ? 'var(--ink2)' : 'var(--ink)',
                        fontStyle: cell.missing ? 'italic' : 'normal',
                      }}
                    >
                      {cell.text}
                      {cell.note && (
                        <span style={{ flexBasis: '100%', fontSize: 13, fontStyle: 'normal', lineHeight: 1.35, color: 'var(--ink3)' }}>{cell.note}</span>
                      )}
                      {cell.best && (
                        <span style={{ padding: '2px 8px', borderRadius: 999, background: 'var(--accent-grad)', boxShadow: 'var(--accent-shadow)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700 }}>
                          {t('explore.compare.best')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {hasCmp && cmpChart.length > 0 && (
        <div style={{ padding: 22, borderRadius: 22, border: '1px solid var(--surface-line)', background: 'var(--surface)' }}>
          <ScoreChart title={t('shared.chart.title')} note={t('shared.chart.note')} series={cmpChart} />
        </div>
      )}
    </section>
  );
}
