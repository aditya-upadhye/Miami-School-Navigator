import { useTheme } from '../theme/ThemeProvider';
import Notice from './Notice';
import ThemeToggle from './ThemeToggle';

const FONT = "'Figtree', system-ui, sans-serif";

const VARIANTS = {
  // Sunny skyline backdrop used by the sign-up screen.
  landing: {
    position: 'relative',
    minHeight: '100vh',
    overflow: 'hidden',
    fontFamily: FONT,
    color: 'var(--ink)',
    background: 'var(--sky)',
  },
  // Frosted gradient page used by every other screen.
  page: { minHeight: '100vh', background: 'var(--page)', color: 'var(--ink)', fontFamily: FONT },
};

/** Themed page wrapper: sets data-theme, the page background and the floating light/dark toggle. */
export default function ThemeShell({ variant = 'page', paddingBottom, children }) {
  const { theme } = useTheme();
  const style = paddingBottom ? { ...VARIANTS[variant], paddingBottom } : VARIANTS[variant];
  return (
    <div className="theme-root" data-theme={theme} style={style}>
      <ThemeToggle />
      <Notice />
      {children}
    </div>
  );
}
