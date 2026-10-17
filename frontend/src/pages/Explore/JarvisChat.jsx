import { useEffect, useRef, useState } from 'react';
import JarvisConversation from '../../components/JarvisConversation';
import { useI18n } from '../../i18n';
import { useProfile } from '../../profile/ProfileProvider';

const POS_KEY = 'sn.jarvis.pos';
const MARGIN = 8;
const STEP = 24;

const readPos = () => {
  try {
    const p = JSON.parse(window.sessionStorage.getItem(POS_KEY));
    return Number.isFinite(p?.x) && Number.isFinite(p?.y) ? p : null;
  } catch {
    return null;
  }
};

/** A floating window: drag the title bar (mouse, finger or pen) or use the arrow keys on the grip to put it anywhere on screen.
 *  Until it is moved it opens under the header's Talk to Jarvis button; after that its place is remembered for this tab. */
function useFloating() {
  const ref = useRef(null);
  const drag = useRef(null);
  const [pos, setPos] = useState(readPos);

  const clamp = (x, y) => {
    const r = ref.current?.getBoundingClientRect();
    const w = r?.width ?? 390;
    const h = r?.height ?? 300;
    return {
      x: Math.min(Math.max(x, MARGIN), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
      y: Math.min(Math.max(y, MARGIN), Math.max(MARGIN, window.innerHeight - Math.min(h, 120) - MARGIN)), // the title bar always stays reachable
    };
  };
  const place = (p) => {
    const c = clamp(p.x, p.y);
    setPos(c);
    try {
      window.sessionStorage.setItem(POS_KEY, JSON.stringify(c));
    } catch {
      /* no storage: the window just forgets its place on reload */
    }
  };

  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = (e) => {
    if (e.button > 0 || e.target.closest('[data-nodrag]')) return; // the close button keeps its own click
    const r = ref.current.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (drag.current) place({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onGripKey = (e) => {
    const d = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] }[e.key];
    if (!d) return;
    e.preventDefault();
    const r = ref.current.getBoundingClientRect();
    place({ x: r.left + d[0], y: r.top + d[1] });
  };
  return { ref, pos, bar: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }, onGripKey };
}

export default function JarvisChat({ toggleChat }) {
  const { profile } = useProfile();
  const { t } = useI18n();
  const { ref, pos, bar, onGripKey } = useFloating();
  return (
    <section
      ref={ref}
      aria-label={t('explore.navi.aria')}
      style={{
        position: 'fixed',
        ...(pos ? { left: pos.x, top: pos.y } : { right: 16, top: 88 }),
        maxHeight: pos ? `calc(100vh - ${pos.y + MARGIN}px)` : 'calc(100vh - 104px)',
        zIndex: 60,
        width: 390,
        maxWidth: 'calc(100vw - 32px)',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 22,
        background: 'var(--glass)',
        backdropFilter: 'blur(16px) saturate(170%)',
        WebkitBackdropFilter: 'blur(16px) saturate(170%)',
        boxShadow: '0 24px 60px rgba(16,35,46,0.3)',
        overflow: 'hidden',
      }}
    >
      <div
        {...bar}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '12px 12px 12px 18px',
          borderBottom: '1px solid var(--edge)',
          cursor: 'grab',
          touchAction: 'none', // so a finger drags the window instead of scrolling the page
          userSelect: 'none',
        }}
      >
        <button
          type="button"
          aria-label={t('explore.navi.move')}
          title={t('explore.navi.move')}
          onKeyDown={onGripKey}
          style={{ width: 28, height: 40, border: 0, background: 'none', color: 'var(--ink3)', cursor: 'grab', padding: 0, flexShrink: 0 }}
        >
          <svg width="14" height="22" viewBox="0 0 14 22" fill="currentColor" aria-hidden="true">
            {[3, 11, 19].map((y) => (
              <g key={y}>
                <circle cx="3" cy={y} r="1.6" />
                <circle cx="11" cy={y} r="1.6" />
              </g>
            ))}
          </svg>
        </button>
        <span style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
          <span style={{ fontWeight: 700 }}>Jarvis</span>
          <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>
            {t(profile.hasLocation ? 'explore.navi.knows' : 'explore.navi.needsAddress')}
          </span>
        </span>
        <button
          type="button"
          aria-label={t('explore.navi.close')}
          data-nodrag
          onClick={toggleChat}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            border: 0,
            background: 'var(--glass3)',
            color: 'var(--ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <JarvisConversation autoFocus mapEnabled />
    </section>
  );
}
