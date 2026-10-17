import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useI18n } from '../../i18n';
import SaveButton from '../../saved/SaveButton';

const small = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 36,
  padding: '0 12px',
  borderRadius: 10,
  fontSize: 13.5,
  fontWeight: 700,
  textDecoration: 'none',
  cursor: 'pointer',
};

/** The "Why this match" fold-out. The one-to-two sentence summary is written by the language model, and only once the family opens the card. */
function WhyDetails({ r }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const summary = useApi((signal) => api.whyMatch(r.id, r.whyBody, { signal }), [r.id, JSON.stringify(r.whyBody)], { enabled: open && !!r.whyBody.lat });
  const text = summary.data?.summary;
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--accent-ink)' }}>{t('menu.panel.why')}</summary>
      <div aria-live="polite" style={{ margin: '8px 0 6px', fontSize: 13.5, lineHeight: 1.45, color: 'var(--ink)' }}>
        {/* the plain reasons show at once; the model's sentences replace them when they arrive (or stay if it is slow or unavailable) */}
        {text || r.reasons}
        {!text && summary.loading && !summary.error && (
          <div style={{ marginTop: 4, fontSize: 12.5, fontStyle: 'italic', color: 'var(--ink2)' }}>{t('explore.why.loading')}</div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0 6px' }}>
        {r.chips.map((c, k) => (
          <span key={k} title={c.title} style={{ padding: '3px 9px', borderRadius: 999, background: 'var(--glass3)', fontSize: 12.5, fontWeight: 600 }}>
            {c.label}
          </span>
        ))}
      </div>
    </details>
  );
}

/** Compact list of matches for the side panel. Clicking "Map" selects the pin; "Why" folds out the score reasons. */
export default function ResultsList({ results, resultsTitle, sortLabel, loading, error, empty, notes = [] }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="results-title" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
        <h2 id="results-title" style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 700 }}>
          {resultsTitle}
        </h2>
        <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{sortLabel}</span>
      </div>
      {error && (
        <p role="alert" style={{ margin: 0, color: 'var(--ink2)' }}>
          {error.message} {error.suggestedAction}
        </p>
      )}
      {!error && empty && !loading && <p style={{ margin: 0, color: 'var(--ink2)' }}>{t('explore.results.empty')}</p>}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10, opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
        {results.map((r) => (
          <li
            key={r.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 12,
              borderRadius: 14,
              border: `2px solid ${r.cardBorder}`,
              background: 'var(--glass2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span
                style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: r.bg, color: r.fg, fontWeight: 700, fontSize: 13 }}
              >
                {r.rank}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button
                  type="button"
                  onClick={r.show}
                  title={t('explore.card.showOnMap')}
                  style={{ padding: 0, border: 0, background: 'none', textAlign: 'left', color: 'var(--ink)', font: "700 15px 'Figtree', sans-serif", lineHeight: 1.25, cursor: 'pointer' }}
                >
                  {r.name}
                </button>
                <span style={{ fontSize: 13, color: 'var(--ink2)' }}>
                  {r.type} · {r.grades} · {r.dist}
                </span>
                {r.fits && <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{r.fits}</span>}
              </span>
              {r.match != null && (
                <span style={{ flexShrink: 0, padding: '3px 9px', borderRadius: 999, background: 'var(--accent-tint)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13 }}>
                  {t('explore.card.match', { n: r.match })}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <Link viewTransition to={`/school/${r.id}`} style={{ ...small, background: 'var(--accent-grad)', color: 'var(--on-accent)' }}>
                {t('explore.card.details')}
              </Link>
              <button
                type="button"
                aria-pressed={r.inCmp}
                onClick={r.toggle}
                style={{ ...small, border: `1.5px solid ${r.cmpBorder}`, background: r.cmpBg, color: r.cmpFg, font: "700 13.5px 'Figtree', sans-serif" }}
              >
                {r.cmpLabel}
              </button>
              <SaveButton id={r.id} name={r.name} style={{ minHeight: 36, padding: '0 12px', fontSize: 13.5, borderRadius: 10 }} />
            </div>
            <WhyDetails r={r} />
          </li>
        ))}
      </ol>
      {notes.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>{t('menu.panel.notes')}</summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--ink2)' }}>
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
