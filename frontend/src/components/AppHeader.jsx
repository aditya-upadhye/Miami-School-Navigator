import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import BrandLogo from './BrandLogo';
import AccountMenu from './AccountMenu';
import BackButton from './BackButton';
import MenuButton from './MenuButton';

const NAV = [
  { key: 'explore', to: '/explore' },
  { key: 'compare', to: '/explore#compare' },
  { key: 'pathways', to: '/pathway' },
  { key: 'planner', to: '/planner' },
  { key: 'saved', to: '/saved' },
];

const navLinkStyle = (active) => ({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '0 14px',
  borderRadius: 10,
  ...(active
    ? { background: 'var(--accent-tint)', color: 'var(--accent-ink)', fontWeight: 700 }
    : { color: 'var(--ink)', fontWeight: 600 }),
  textDecoration: 'none',
});

const askJarvisStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 44,
  padding: '0 16px 0 8px',
  borderRadius: 999,
  background: 'var(--panel-dark)',
  backdropFilter: 'blur(18px) saturate(150%)',
  WebkitBackdropFilter: 'blur(18px) saturate(150%)',
  boxShadow: '0 14px 40px rgba(43,27,20,0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
  color: '#FFFFFF',
  fontWeight: 700,
  fontSize: 15,
  textDecoration: 'none',
};

function JarvisMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="#2A2650" />
      <path d="M20 9 L25 25 L20 21.5 L15 25 Z" fill="#F6C343" />
    </svg>
  );
}

/**
 * Top bar shared by Explore, School and Pathway.
 *  - active:      which nav item is the current page ("explore" | "pathways")
 *  - showSearch:  render the school search box (Explore only)
 *  - compact:     logo, search and the right-hand buttons only (no page links, no Back): the Explore page uses it to keep the top clean
 *  - onAskJarvis:   when given, "Ask Jarvis" opens the assistant in place; otherwise it links to the map
 */
export default function AppHeader({ active, showSearch = false, compact = false, onAskJarvis, onSearch }) {
  const { t } = useI18n();
  return (
    <header
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        // With the search box, the search field absorbs the free space instead.
        justifyContent: showSearch ? 'flex-start' : 'space-between',
        position: 'sticky', // stays visible while the page scrolls
        top: 0,
        zIndex: 1100,
        gap: '16px 28px',
        padding: '14px clamp(16px, 3vw, 40px)',
        background: 'var(--glass)',
        backdropFilter: 'blur(16px) saturate(170%)',
        WebkitBackdropFilter: 'blur(16px) saturate(170%)',
        borderBottom: '1px solid var(--edge)',
      }}
    >
      {/* "contents" lets the logo and nav wrap independently when the search box shares the row. */}
      <div
        style={
          showSearch
            ? { display: 'contents' }
            : { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px 28px' }
        }
      >
        {!compact && <BackButton fallback="/explore" />}
        <BrandLogo />
        {!compact && (
        <nav aria-label={t('nav.main')} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {NAV.map((item) => {
            const isActive = item.key === active;
            const style = navLinkStyle(isActive);
            const current = isActive ? 'page' : undefined;
            return item.to ? (
              <Link viewTransition key={item.key} to={item.to} aria-current={current} style={style}>
                {t(`nav.${item.key === 'planner' ? 'plan' : item.key}`)}
              </Link>
            ) : (
              <a key={item.key} href={item.href} style={style}>
                {t(`nav.${item.key === 'planner' ? 'plan' : item.key}`)}
              </a>
            );
          })}
        </nav>
        )}
      </div>

      {showSearch && (
        <div
          style={{
            flex: '1 1 260px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            height: 46,
            padding: '0 14px',
            borderRadius: 12,
            border: '1.5px solid var(--line2)',
            background: 'var(--glass)',
            backdropFilter: 'blur(16px) saturate(170%)',
            WebkitBackdropFilter: 'blur(16px) saturate(170%)',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6B5547"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            aria-label={t('shared.search.aria')}
            placeholder={t('shared.search.placeholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) onSearch?.(e.currentTarget.value.trim());
            }}
            style={{
              flexGrow: 1,
              minWidth: 0,
              height: 40,
              border: 0,
              outline: 'none',
              font: "15px 'Figtree', sans-serif",
              color: 'var(--ink)',
              background: 'transparent',
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {onAskJarvis ? (
          <button
            type="button"
            onClick={onAskJarvis}
            style={{ ...askJarvisStyle, border: 0, font: "700 15px 'Figtree', sans-serif", cursor: 'pointer' }}
          >
            <JarvisMark />
            {t('nav.ask')}
          </button>
        ) : (
          <Link viewTransition to="/explore" style={askJarvisStyle}>
            <JarvisMark />
            {t('nav.ask')}
          </Link>
        )}
        <MenuButton />
        <AccountMenu />
      </div>
    </header>
  );
}
