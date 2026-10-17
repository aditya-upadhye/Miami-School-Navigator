import { useI18n } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';

export default function ThemeToggle() {
  const { dark, light, toggleTheme } = useTheme();
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={dark}
      aria-label={t(dark ? 'shared.theme.toLight' : 'shared.theme.toDark')}
      onClick={toggleTheme}
      style={{
        position: 'fixed',
        left: 20,
        bottom: 20,
        zIndex: 80,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 48,
        padding: '0 18px 0 14px',
        borderRadius: 999,
        border: '1px solid var(--edge)',
        background: 'var(--glass2)',
        backdropFilter: 'blur(16px) saturate(170%)',
        WebkitBackdropFilter: 'blur(16px) saturate(170%)',
        boxShadow: 'var(--shadow)',
        color: 'var(--ink)',
        font: "700 14px 'Figtree', sans-serif",
        cursor: 'pointer',
      }}
    >
      {dark && (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
        </svg>
      )}
      {light && (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
      {t(dark ? 'shared.theme.dark' : 'shared.theme.light')}
    </button>
  );
}
