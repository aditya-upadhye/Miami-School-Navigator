import { useI18n } from '../i18n';
import { useSaved } from './SavedProvider';

const HEART =
  'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.8 6.2 4.5c2-.2 3.8.9 4.8 2.6h2c1-1.7 2.8-2.8 4.8-2.6 3.5.3 5.3 3.9 3.8 7.3C19.5 16.4 12 21 12 21z';

/**
 * Heart button that saves or un-saves a school. `labeled` shows "Save" / "Saved" next to the heart (School page); otherwise it is an
 * icon-only 44 px target (cards and the map pop-over). The accessible name always includes the school's name.
 */
export default function SaveButton({ id, name, labeled = false, style }) {
  const { t } = useI18n();
  const { isSaved, toggle } = useSaved();
  const on = isSaved(id);
  return (
    <button
      type="button"
      data-testid="save-button"
      aria-pressed={on}
      aria-label={t(on ? 'saved.btn.remove' : 'saved.btn.save', { name })}
      title={t(on ? 'saved.btn.removeTitle' : 'saved.btn.saveTitle')}
      onClick={() => toggle(id)}
      style={{
        flexShrink: 0,
        minWidth: 44,
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: labeled ? '0 16px 0 12px' : 0,
        borderRadius: labeled ? 999 : 12,
        border: `1.5px solid ${on ? '#C95FA6' : 'var(--line2)'}`,
        background: on ? 'var(--accent-tint)' : 'var(--glass3)',
        color: on ? 'var(--accent-ink)' : 'var(--ink)',
        font: "700 14px 'Figtree', sans-serif",
        cursor: 'pointer',
        ...style,
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill={on ? '#C95FA6' : 'none'}
        stroke={on ? '#C95FA6' : 'currentColor'}
        strokeWidth="2"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={HEART} />
      </svg>
      {labeled && <span>{t(on ? 'saved.btn.labelOn' : 'saved.btn.label')}</span>}
    </button>
  );
}
