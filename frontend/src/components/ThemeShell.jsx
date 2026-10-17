import { useTheme } from '../theme/ThemeProvider';

const FONT = "'Figtree', system-ui, sans-serif";

const VARIANTS = {
  // Flat, quiet background for the welcome page: nothing behind the text.
  landing: { minHeight: '100vh', fontFamily: FONT, color: 'var(--ink)', background: 'var(--landing-bg)' },
  // Frosted gradient page used by every other screen.
  page: { minHeight: '100vh', background: 'var(--page)', color: 'var(--ink)', fontFamily: FONT },
};

/** Themed page wrapper: sets data-theme and the page background. The light/dark switch lives in Settings (the menu). */
export default function ThemeShell({ variant = 'page', paddingBottom, children }) {
  const { theme } = useTheme();
  const style = paddingBottom ? { ...VARIANTS[variant], paddingBottom } : VARIANTS[variant];
  return (
    <div className="theme-root" data-theme={theme} style={style}>
      {children}
    </div>
  );
}
