import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

/** One colour per school, in a fixed order (purple, green, amber). The compare cards use the same three, so a school keeps its colour. */
export const SERIES_COLORS = ['#8b7cf0', '#4fb59a', '#e9a93b'];

// The factors behind the match score, in the order the backend lists them. Each keeps its own colour (--f1 ... --f6, light and dark in
// global.css) in every donut. Labels are catalog keys `shared.factor.<name>`.
const FACTORS = ['state_grade', 'zoned', 'distance', 'priorities', 'popularity', 'scholarship'];

const R = 42;
const C = 2 * Math.PI * R;
const GAP = 2; // space between slices, in the donut's own units
const MS = 700; // how long the rings and the number take to follow a change

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Counts a number up or down to `target`, so the score in the middle moves with the slices when a setting changes. */
function useTween(target) {
  const [shown, setShown] = useState(reducedMotion() ? target : 0);
  const from = useRef(shown);
  useEffect(() => {
    if (reducedMotion()) {
      setShown(target);
      return undefined;
    }
    const start = performance.now();
    const origin = from.current;
    let raf;
    const tick = (now) => {
      const k = Math.min(1, (now - start) / MS);
      const v = origin + (target - origin) * (1 - (1 - k) ** 3);
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return Math.round(shown);
}

/** One donut per school. Each slice is the points one factor earned; together the slices fill as much of the ring as the school's match
 *  score (the rest stays grey), and the score sits in the middle. The numbers are listed under the ring so colour is never the only signal. */
function Donut({ school, t }) {
  // Slices start empty and grow on the first paint; after that a change in the score moves them (CSS transition below).
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const score = useTween(school.match_score ?? 0);
  const parts = FACTORS.map((name, i) => ({
    name,
    i,
    f: school.breakdown?.find((x) => x.factor === name),
  })).filter((p) => p.f);
  const possible = parts.reduce((n, p) => n + p.f.max_points, 0) || 1;
  let start = 0;
  const slices = parts.map((p) => {
    const len = (p.f.points / possible) * C;
    const slice = { ...p, len, start };
    start += len;
    return slice;
  });
  return (
    <div
      style={{
        flex: '1 1 230px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        minWidth: 0,
      }}
    >
      <svg viewBox="0 0 120 120" width="170" height="170" role="img" aria-label={`${school.name}: ${school.match_score}/100`}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--track)" strokeWidth="16" />
        {slices.map((s) => {
          const dash = grown && s.len > GAP ? s.len - GAP : 0.01; // a factor with no points keeps a hidden dot so it can grow back
          return (
            <circle
              key={s.name}
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={`var(--f${s.i + 1})`}
              strokeWidth="16"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={grown ? -s.start : 0}
              transform="rotate(-90 60 60)"
              style={{
                transition: `stroke-dasharray ${MS}ms cubic-bezier(0.4, 0, 0.2, 1), stroke-dashoffset ${MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              }}
            >
              <title>{`${t(`shared.factor.${s.name}`)}: ${s.f.points}/${s.f.max_points}. ${s.f.detail ?? ''}`}</title>
            </circle>
          );
        })}
        <text
          x="60"
          y="58"
          textAnchor="middle"
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: 28,
            fontWeight: 700,
            fill: 'var(--ink)',
          }}
        >
          {score}
        </text>
        <text x="60" y="74" textAnchor="middle" style={{ fontSize: 10, fill: 'var(--ink3)' }}>
          {t('shared.chart.outOf')}
        </text>
      </svg>
      <span
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: 17,
          fontWeight: 700,
          textAlign: 'center',
          lineHeight: 1.25,
        }}
      >
        {school.name}
      </span>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          width: '100%',
          maxWidth: 260,
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}
      >
        {parts.map((p) => (
          <li
            key={p.name}
            title={p.f.detail}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              color: 'var(--ink)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                flexShrink: 0,
                background: `var(--f${p.i + 1})`,
              }}
            />
            <span style={{ flexGrow: 1 }}>{t(`shared.factor.${p.name}`)}</span>
            <span
              style={{
                color: 'var(--ink2)',
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {p.f.points}/{p.f.max_points}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Donut charts of the match score, one per school, side by side. Used by Compare and by each Pathway stage. */
export default function ScoreChart({ title, note, series }) {
  const { t } = useI18n();
  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <figcaption style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          {title}
        </span>
        {note && <span style={{ fontSize: 14, color: 'var(--ink2)' }}>{note}</span>}
      </figcaption>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '28px 20px',
          justifyContent: 'space-around',
        }}
      >
        {series.map((school, i) => (
          <Donut key={school.name} school={school} t={t} />
        ))}
      </div>
    </figure>
  );
}
