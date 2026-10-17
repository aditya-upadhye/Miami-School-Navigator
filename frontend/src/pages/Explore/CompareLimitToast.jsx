import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';

/** "Only 3 schools can be compared": a small bubble right next to where the family just clicked, so it is seen without scrolling to the compare table. */
export default function CompareLimitToast({ at, onDismiss, onGo }) {
  const { t } = useI18n();
  const last = useRef({ x: 24, y: 24 });
  const [pos, setPos] = useState(null);

  useEffect(() => {
    const note = (e) => {
      last.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointerdown', note, true);
    return () => window.removeEventListener('pointerdown', note, true);
  }, []);

  useEffect(() => {
    if (!at) {
      setPos(null);
      return undefined;
    }
    const { x, y } = last.current;
    const w = Math.min(300, window.innerWidth - 24);
    setPos({ left: Math.max(12, Math.min(x - w / 2, window.innerWidth - w - 12)), top: Math.max(12, y - 96), w });
    const id = setTimeout(onDismiss, 5000);
    return () => clearTimeout(id);
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!at || !pos) return null;
  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: pos.w,
        zIndex: 120,
        padding: '10px 12px',
        borderRadius: 14,
        background: '#FFF0C2',
        color: '#1B1830',
        boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
        fontSize: 14,
        lineHeight: 1.35,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <span style={{ fontWeight: 700 }}>{t('explore.cmp.limit')}</span>
      <span style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onGo} style={{ padding: '4px 10px', borderRadius: 999, border: 0, background: '#1B1830', color: '#fff', font: "700 13px 'Figtree', sans-serif", cursor: 'pointer' }}>
          {t('explore.cmp.limit.go')}
        </button>
        <button type="button" onClick={onDismiss} style={{ padding: '4px 10px', borderRadius: 999, border: '1.5px solid rgba(27,24,48,0.35)', background: 'transparent', color: '#1B1830', font: "700 13px 'Figtree', sans-serif", cursor: 'pointer' }}>
          OK
        </button>
      </span>
    </div>
  );
}
