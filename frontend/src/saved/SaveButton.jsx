import { useI18n } from '../i18n';
import { useSaved } from './SavedProvider';

/** Heart-style toggle that saves or unsaves a school. */
export default function SaveButton({ id, name, style }) {
  const { t } = useI18n();
  const { isSaved, toggleSaved } = useSaved();
  const on = isSaved(id);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => toggleSaved(id, name)}
      style={{
        minHeight: 44,
        padding: '4px 14px',
        borderRadius: 12,
        border: `1.5px solid ${on ? 'var(--accent-ink)' : 'var(--line2)'}`,
        background: on ? 'var(--accent-tint)' : 'transparent',
        color: on ? 'var(--accent-ink)' : 'var(--ink)',
        font: "700 14px 'Figtree', sans-serif",
        cursor: 'pointer',
        ...style,
      }}
    >
      {on ? '♥ ' : '♡ '}
      {t(on ? 'saved.saved' : 'saved.save')}
    </button>
  );
}
