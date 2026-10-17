import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n';
import { initials } from '../utils/initials';

/** Top-right account control. A guest sees "Sign in"; a signed-in family sees their initials on the yellow button, with a menu. */
export default function AccountMenu() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const { pathname, search } = useLocation();
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => !box.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!user) {
    return (
      <Link
        to={`/account?next=${encodeURIComponent(pathname + search)}`}
        aria-label={t('account.guestAria')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 44,
          padding: '0 16px 0 10px',
          borderRadius: 999,
          border: '1.5px solid var(--line2)',
          background: 'var(--glass)',
          color: 'var(--ink)',
          fontWeight: 700,
          fontSize: 15,
          textDecoration: 'none',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="10" r="3" />
          <path d="M6.5 18.5a6.5 6.5 0 0 1 11 0" />
        </svg>
        {t('account.signIn')}
      </Link>
    );
  }

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('account.menuAria', { name: user.name })}
        title={user.name}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          border: 0,
          background: '#F6C343',
          color: '#1B1830',
          font: "700 15px 'Figtree', sans-serif",
          cursor: 'pointer',
        }}
      >
        {initials(user.name)}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: 52,
            zIndex: 50,
            minWidth: 220,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: 14,
            borderRadius: 14,
            background: 'var(--panel-dark)',
            backdropFilter: 'blur(18px) saturate(150%)',
            WebkitBackdropFilter: 'blur(18px) saturate(150%)',
            boxShadow: '0 14px 40px rgba(43,27,20,0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
            color: '#FFFFFF',
          }}
        >
          <strong style={{ overflowWrap: 'anywhere' }}>{user.name}</strong>
          <span style={{ fontSize: 13, color: '#ECE8FA', overflowWrap: 'anywhere' }}>{user.email}</span>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            style={{
              marginTop: 8,
              minHeight: 40,
              borderRadius: 10,
              border: '1.5px solid rgba(255,255,255,0.4)',
              background: 'transparent',
              color: '#FFFFFF',
              font: "700 14px 'Figtree', sans-serif",
              cursor: 'pointer',
            }}
          >
            {t('account.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
