import { useState } from 'react';
import { useI18n } from '../../i18n';

const LEVEL_COLOR = {
  confirmed_district_source: '#15803D',
  other_district_policies: '#B45309',
  single_secondary_source: '#B45309',
  unconfirmed_project_spec: '#B91C1C',
};

/** Key dates. Each card opens its source (what it says, where it comes from, a link, how sure we are) on hover, on keyboard focus and on click. */
export default function DatesList({ dates }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(null); // index opened by a click or Enter
  const [hover, setHover] = useState(null);
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
        {dates.map((d, i) => {
          const shown = open === i || hover === i;
          const panelId = `date-source-${i}`;
          return (
            <div
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setHover(null);
              }}
              style={{
                flex: '1 1 230px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: 16,
                borderRadius: 18,
                background: 'var(--glass)',
                backdropFilter: 'blur(16px) saturate(170%)',
                WebkitBackdropFilter: 'blur(16px) saturate(170%)',
                border: `1px solid ${shown ? 'var(--accent)' : 'var(--edge)'}`,
                boxShadow: 'var(--shadow)',
                transition: 'border-color 0.15s ease',
              }}
            >
              <button
                type="button"
                aria-expanded={open === i}
                aria-controls={panelId}
                title={t('dates.tap')}
                onClick={() => setOpen(open === i ? null : i)}
                style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: 0, border: 0, background: 'none', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}
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
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{d.what}</span>
                  <span style={{ fontSize: 14, color: 'var(--ink2)' }}>{d.who}</span>
                  {d.levelLabel && (
                    <span style={{ alignSelf: 'flex-start', padding: '2px 9px', borderRadius: 999, background: LEVEL_COLOR[d.level] ?? 'var(--ink3)', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                      {d.levelLabel}
                    </span>
                  )}
                </span>
              </button>
              <div id={panelId} hidden={!shown} style={{ display: shown ? 'flex' : 'none', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: '1px solid var(--line)', fontSize: 13.5, color: 'var(--ink2)' }}>
                {d.note && <span>{d.note}</span>}
                <span>
                  <strong>{t('dates.source')}:</strong> {d.source || '—'}
                  {d.asOf ? ` · ${t('dates.asOf', { date: d.asOf })}` : ''}
                </span>
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>
                    {t('dates.open')} ↗
                  </a>
                ) : (
                  <span>{t('dates.noLink')}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
