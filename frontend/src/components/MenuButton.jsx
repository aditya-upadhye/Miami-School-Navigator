import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import MenuDrawer from './MenuDrawer';

/** Opens the menu drawer: every page, plus Settings (language, light/dark, forget the saved family). */
export default function MenuButton() {
  const { t } = useI18n();
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 44,
          padding: '0 16px 0 12px',
          borderRadius: 999,
          border: '1.5px solid var(--line2)',
          background: 'var(--glass)',
          color: 'var(--ink)',
          font: "700 15px 'Figtree', sans-serif",
          cursor: 'pointer',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        {t('menu.button')}
      </button>
      {/* Portal: the header's blur makes fixed children position against the header, so the drawer is rendered at the body. */}
      {open &&
        createPortal(
          <div className="theme-root" data-theme={theme} style={{ fontFamily: "'Figtree', system-ui, sans-serif", color: 'var(--ink)' }}>
            <MenuDrawer onClose={close} />
          </div>,
          document.body,
        )}
    </>
  );
}
