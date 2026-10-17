import { useI18n } from '../../i18n';
import { CARD_COLORS } from './ComparePanel';

/** Appears as soon as one school is picked, so it is obvious a comparison exists: who is in it, how many of 3, and one button that scrolls
 *  down to the table, which stays on the page below the map. */
export function CompareTray({ head, countLabel, onOpen }) {
  const { t } = useI18n();
  return (
    <div
      role="region"
      aria-label={t('menu.compare.tray')}
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        zIndex: 70,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: 'min(760px, calc(100vw - 32px))',
        padding: '10px 10px 10px 18px',
        borderRadius: 999,
        background: 'var(--surface)',
        color: 'var(--ink)',
        border: '1.5px solid var(--surface-line)',
        boxShadow: '0 12px 36px rgba(16, 35, 46, 0.35)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
        {head.map((h, i) => (
          <span key={h.id} title={h.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 14, fontWeight: 600 }}>
            <span aria-hidden="true" style={{ flexShrink: 0, width: 10, height: 10, borderRadius: 5, background: CARD_COLORS[i % CARD_COLORS.length] }} />
            <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
          </span>
        ))}
      </span>
      <span style={{ flexShrink: 0, fontSize: 13, color: 'var(--ink2)' }}>{countLabel}</span>
      <button
        type="button"
        onClick={onOpen}
        style={{ flexShrink: 0, minHeight: 44, padding: '0 20px', borderRadius: 999, border: 0, background: 'var(--accent-grad)', boxShadow: 'var(--accent-shadow)', color: 'var(--on-accent)', font: "700 15px 'Figtree', sans-serif", cursor: 'pointer' }}
      >
        {t('menu.compare.open')}
      </button>
    </div>
  );
}
