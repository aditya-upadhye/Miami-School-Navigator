import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n';
import SettingsSection from './SettingsSection';

const LINKS = [
  { to: '/', label: 'menu.home.title' },
  { to: '/explore', label: 'nav.explore' },
  { to: '/explore#compare', label: 'nav.compare' },
  { to: '/pathway', label: 'nav.pathways' },
  { to: '/planner', label: 'nav.plan' },
  { to: '/saved', label: 'nav.saved' },
  { to: '/onboarding?mode=chat', label: 'onboarding.mode.chat.title' },
  { to: '/onboarding?mode=form', label: 'onboarding.mode.form.title' },
];

const linkStyle = {
  display: 'flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '0 12px',
  borderRadius: 10,
  color: 'var(--ink)',
  fontWeight: 600,
  fontSize: 16,
  textDecoration: 'none',
};

/** Slide-over menu: every page, then Settings. Closes on Escape, on a click outside, and when the page changes. */
export default function MenuDrawer({ onClose }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { pathname, search, hash } = useLocation();

  // Close when the visitor navigates (not on first render, or the drawer would close the moment it opens).
  const here = `${pathname}${search}${hash}`;
  const opened = useRef(here);
  useEffect(() => {
    if (here !== opened.current) onClose();
  }, [here, onClose]);

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const heading = { margin: '0 0 6px', fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink2)' };
  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 1190, background: 'rgba(16,35,46,0.35)' }} />
      <aside
        role="dialog"
        aria-label={t('menu.button')}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 1200,
          width: 'min(340px, 100vw)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          padding: 20,
          background: 'var(--page)',
          color: 'var(--ink)',
          boxShadow: '-18px 0 50px rgba(16,35,46,0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <strong style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22 }}>{t('menu.button')}</strong>
          <button
            type="button"
            aria-label={t('menu.close')}
            onClick={onClose}
            style={{ width: 44, height: 44, borderRadius: 22, border: 0, background: 'var(--glass3)', color: 'var(--ink)', fontSize: 20, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
        <nav aria-label={t('nav.main')} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2 style={heading}>{t('menu.group.tools')}</h2>
          {LINKS.map((l) => (
            <Link viewTransition key={l.to} to={l.to} style={linkStyle}>
              {t(l.label)}
            </Link>
          ))}
          <Link viewTransition to="/account" style={linkStyle}>
            {user ? t('menu.group.account') : t('account.signIn')}
          </Link>
        </nav>
        <section aria-labelledby="settings-h">
          <h2 id="settings-h" style={heading}>
            {t('menu.settings')}
          </h2>
          <SettingsSection />
        </section>
      </aside>
    </>
  );
}
