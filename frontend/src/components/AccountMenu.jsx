import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { initials } from '../auth/authLogic';
import { useI18n } from '../i18n';
import { safeNext } from '../saved/savedLogic';

const itemStyle = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  minHeight: 44,
  padding: '0 14px',
  border: 0,
  borderRadius: 10,
  background: 'transparent',
  color: 'var(--ink)',
  font: "600 15px 'Figtree', sans-serif",
  textAlign: 'left',
  textDecoration: 'none',
  cursor: 'pointer',
};

/** Header control: "Sign in" when signed out, otherwise an avatar button with a Saved / Account / Sign out menu. */
export default function AccountMenu() {
  const { t } = useI18n();
  const { user, ready, logout, showNotice } = useAuth();
  const { pathname, search } = useLocation();
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const button = useRef(null);
  const menuId = useId();

  const items = () => [...(wrap.current?.querySelectorAll('[role="menuitem"]') ?? [])];
  const focusItem = (i) => {
    const list = items();
    if (list.length) list[(i + list.length) % list.length].focus();
  };

  // Close on a click or tap outside (Escape is handled on the button and the menu).
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  // Opening the menu moves focus to its first item.
  useEffect(() => {
    if (open) focusItem(0);
  }, [open]);

  if (!ready) return <span style={{ width: 44, height: 44 }} aria-hidden="true" />;

  if (!user) {
    const here = safeNext(pathname + search, null);
    return (
      <Link
        to={here && pathname !== '/' ? `/login?next=${encodeURIComponent(here)}` : '/login'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: 44,
          padding: '0 18px',
          borderRadius: 999,
          border: '1.5px solid var(--line2)',
          background: 'var(--glass)',
          color: 'var(--ink)',
          fontWeight: 700,
          fontSize: 15,
          textDecoration: 'none',
        }}
      >
        {t('landing.signIn')}
      </Link>
    );
  }

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) button.current?.focus();
  };

  const onMenuKey = (e) => {
    const i = items().indexOf(document.activeElement);
    const move = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: -1 }[e.key];
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (move !== undefined) {
      e.preventDefault();
      focusItem(move);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const signOut = async () => {
    close();
    try {
      await logout(); // the Account page sends a signed-out visitor home by itself
    } catch (err) {
      showNotice(err);
    }
  };

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <button
        ref={button}
        type="button"
        data-testid="account-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t('auth.menu.aria', { who: user.name || user.email })}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            close(true);
          }
        }}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          border: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F6C343',
          fontFamily: "'Figtree', sans-serif",
          fontSize: 15,
          fontWeight: 700,
          color: '#1B1830',
          cursor: 'pointer',
        }}
      >
        {initials(user)}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('auth.menu.label')}
          onKeyDown={onMenuKey}
          style={{
            position: 'absolute',
            right: 0,
            top: 52,
            zIndex: 60,
            minWidth: 220,
            maxWidth: 'calc(100vw - 32px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            padding: 6,
            borderRadius: 14,
            border: '1px solid var(--line2)',
            background: 'var(--page)',
            boxShadow: '0 18px 40px rgba(16,35,46,0.28)',
          }}
        >
          <div
            style={{
              padding: '8px 14px',
              fontSize: 13,
              color: 'var(--ink2)',
              overflowWrap: 'anywhere',
              borderBottom: '1px solid var(--line)',
              marginBottom: 4,
            }}
          >
            {user.email}
          </div>
          <Link role="menuitem" to="/saved" tabIndex={-1} onClick={() => close()} style={itemStyle}>
            {t('nav.saved')}
          </Link>
          <Link role="menuitem" to="/account" tabIndex={-1} onClick={() => close()} style={itemStyle}>
            {t('auth.account')}
          </Link>
          <button type="button" role="menuitem" tabIndex={-1} onClick={signOut} style={itemStyle}>
            {t('auth.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
