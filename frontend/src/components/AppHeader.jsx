import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useSaved } from '../saved/SavedProvider';
import AccountMenu from './AccountMenu';
import BrandLogo from './BrandLogo';
import LanguageSwitcher from './LanguageSwitcher';

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

const askNaviStyle = {
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

function NaviMark() {
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
 *  - onAskNavi:   when given, "Ask Navi" opens the assistant in place; otherwise it links to the map
 */
export default function AppHeader({ active, showSearch = false, onAskNavi, onSearch }) {
  const { t, tp } = useI18n();
  const { count } = useSaved();
  return (
    <header
      style={{
        position: 'relative',
        zIndex: 50, // above the page content so the account menu is never covered
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        // With the search box, the search field absorbs the free space instead.
        justifyContent: showSearch ? 'flex-start' : 'space-between',
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
        <BrandLogo />
        <nav aria-label={t('nav.main')} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {NAV.map((item) => {
            const isActive = item.key === active;
            const style = navLinkStyle(isActive);
            const current = isActive ? 'page' : undefined;
            const label = t(`nav.${item.key === 'planner' ? 'plan' : item.key}`);
            const badge = item.key === 'saved' && count > 0;
            return (
              <Link
                key={item.key}
                to={item.to}
                aria-current={current}
                aria-label={badge ? tp('saved.nav.aria', count) : undefined}
                style={style}
              >
                {label}
                {badge && (
                  <span
                    data-testid="saved-count"
                    aria-hidden="true"
                    style={{
                      marginLeft: 8,
                      minWidth: 22,
                      height: 22,
                      padding: '0 6px',
                      borderRadius: 11,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--accent-grad)',
                      color: '#FFFFFF',
                      fontSize: 12.5,
                      fontWeight: 700,
                    }}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
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

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <LanguageSwitcher />
        {onAskNavi ? (
          <button
            type="button"
            onClick={onAskNavi}
            style={{ ...askNaviStyle, border: 0, font: "700 15px 'Figtree', sans-serif", cursor: 'pointer' }}
          >
            <NaviMark />
            {t('nav.ask')}
          </button>
        ) : (
          <Link to="/explore" style={askNaviStyle}>
            <NaviMark />
            {t('nav.ask')}
          </Link>
        )}
        <AccountMenu />
      </div>
    </header>
  );
}
