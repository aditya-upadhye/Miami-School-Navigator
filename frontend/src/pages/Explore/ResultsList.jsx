import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import SaveButton from '../../saved/SaveButton';

export default function ResultsList({ results, resultsTitle, sortLabel, loading, error, empty, notes = [] }) {
  const { t } = useI18n();
  return (
    <section
      aria-labelledby="results-title"
      style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '36px clamp(16px, 3vw, 40px) 0' }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <h2
          id="results-title"
          style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 26, fontWeight: 700 }}
        >
          {resultsTitle}
        </h2>
        <span style={{ fontSize: 14, color: 'var(--ink2)' }}>{sortLabel}</span>
      </div>
      {notes.length > 0 && (
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            fontSize: 13.5,
            color: 'var(--ink2)',
          }}
        >
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" style={{ margin: 0, color: 'var(--ink2)' }}>
          {error.message} {error.suggestedAction}
        </p>
      )}
      {!error && empty && !loading && (
        <p style={{ margin: 0, color: 'var(--ink2)' }}>{t('explore.results.empty')}</p>
      )}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
          opacity: loading ? 0.6 : 1,
          transition: 'opacity .2s',
        }}
      >
        {results.map((r, i) => (
          <article
            key={i}
            style={{
              flex: '1 1 230px',
              maxWidth: 420,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: 16,
              borderRadius: 18,
              border: `2px solid ${r.cardBorder}`,
              background: 'var(--glass)',
              backdropFilter: 'blur(16px) saturate(170%)',
              WebkitBackdropFilter: 'blur(16px) saturate(170%)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span
                style={{
                  flexShrink: 0,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: r.bg,
                  color: r.fg,
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {r.rank}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>{r.name}</span>
                <span style={{ fontSize: 13.5, color: 'var(--ink2)' }}>
                  {r.type} · {r.grades} · {r.dist}
                </span>
              </span>
              <SaveButton id={r.id} name={r.name} style={{ marginLeft: 'auto' }} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {r.chips.map((c, k) => (
                <span
                  key={k}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: 'var(--glass3)',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                  title={c.title}
                >
                  {c.label}
                </span>
              ))}
            </div>
            {r.reasons && (
              <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--ink2)' }}>{r.reasons}</div>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 13.5,
              }}
            >
              <span style={{ color: 'var(--ink2)', fontWeight: 600 }}>{r.fits}</span>
              <span
                style={{
                  padding: '3px 9px',
                  borderRadius: 999,
                  background: 'var(--accent-tint)',
                  color: 'var(--accent-ink)',
                  fontWeight: 700,
                }}
              >
                {t('explore.card.match', { n: r.match })}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'auto' }}>
              <Link
                to={`/school/${r.id}`}
                style={{
                  flex: '1 1 100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 44,
                  borderRadius: 12,
                  background: 'var(--accent-grad)',
                  boxShadow: 'var(--accent-shadow)',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                {t('explore.card.details')}
              </Link>
              <a
                href="#map"
                onClick={r.show}
                style={{
                  flex: '1 1 0',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 44,
                  padding: '4px 8px',
                  textAlign: 'center',
                  borderRadius: 12,
                  border: '1.5px solid var(--line2)',
                  color: 'var(--ink)',
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                {t('explore.card.showOnMap')}
              </a>
              <button
                type="button"
                aria-pressed={r.inCmp}
                onClick={r.toggle}
                style={{
                  flex: '1 1 0',
                  minHeight: 44,
                  padding: '4px 8px',
                  borderRadius: 12,
                  border: `1.5px solid ${r.cmpBorder}`,
                  background: r.cmpBg,
                  color: r.cmpFg,
                  font: "700 14px 'Figtree', sans-serif",
                  cursor: 'pointer',
                }}
              >
                {r.cmpLabel}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
