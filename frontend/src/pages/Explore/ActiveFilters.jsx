import { useI18n } from '../../i18n';
/** What is narrowing or re-ranking the list right now, and how many schools each filter hides. Every chip removes its filter. */
export default function ActiveFilters({ filters, hiddenTotal }) {
  const { t, tp, nf } = useI18n();
  if (!filters.length) return null;
  return (
    <div
      role="group"
      aria-label={t('explore.active.aria')}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        padding: '0 clamp(16px, 3vw, 40px) 14px',
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 700 }}>
        {hiddenTotal > 0
          ? t('explore.active.titleHidden', {
              schools: tp('explore.schools', hiddenTotal, { n: nf(hiddenTotal) }),
            })
          : t('explore.active.title')}
      </span>
      {filters.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={f.remove}
          title={f.note || t('explore.active.remove')}
          aria-label={
            f.count
              ? t('explore.active.removeAriaHides', { label: f.label, count: nf(f.count) })
              : t('explore.active.removeAria', { label: f.label })
          }
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            minHeight: 36,
            padding: '0 12px',
            borderRadius: 999,
            border: '1.5px solid var(--line2)',
            background: 'var(--glass2)',
            color: 'var(--ink)',
            font: "600 13.5px 'Figtree', sans-serif",
            cursor: 'pointer',
          }}
        >
          {f.label}
          {f.count > 0 && (
            <span
              style={{
                padding: '1px 8px',
                borderRadius: 999,
                background: 'var(--accent-tint)',
                color: 'var(--accent-ink)',
                fontWeight: 700,
              }}
            >
              {t('explore.active.hides', { n: nf(f.count) })}
            </span>
          )}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      ))}
    </div>
  );
}
