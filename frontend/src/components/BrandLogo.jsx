import { Link } from 'react-router-dom';

// "md" is the app-bar size; "lg" is the larger sign-up header.
const SIZES = {
  md: { mark: 36, eyebrow: 10, title: 18 },
  lg: { mark: 40, eyebrow: 11, title: 20 },
};

export default function BrandLogo({ size = 'md' }) {
  const s = SIZES[size];
  return (
    <Link viewTransition
      to="/"
      style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'var(--ink)' }}
    >
      <svg width={s.mark} height={s.mark} viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="11" style={{ fill: 'var(--accent)' }} />
        <path
          d="M10 19 L20 11 L30 19"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M20 16 L24.5 29 L20 25.8 L15.5 29 Z" fill="#F6C343" />
      </svg>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
        <span
          style={{
            fontSize: s.eyebrow,
            fontWeight: 700,
            letterSpacing: '0.14em',
            color: 'var(--accent-ink)',
          }}
        >
          MIAMI-DADE
        </span>
        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: s.title, fontWeight: 700 }}>
          School Navigator
        </span>
      </span>
    </Link>
  );
}
