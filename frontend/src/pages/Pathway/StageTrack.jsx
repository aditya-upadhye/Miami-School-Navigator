import { useI18n } from '../../i18n';

export default function StageTrack({ hereLabel, stages }) {
  const { t } = useI18n();
  return (
    <section
      aria-label={t('pathway.stagesAria')}
      style={{
        overflowX: 'auto',
        borderRadius: 24,
        background: 'var(--glass)',
        backdropFilter: 'blur(16px) saturate(170%)',
        WebkitBackdropFilter: 'blur(16px) saturate(170%)',
        border: '1px solid var(--edge)',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div style={{ position: 'relative', minWidth: 1120, padding: '28px 20px 22px' }}>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '6%',
            right: '6%',
            top: 170,
            height: 0,
            borderTop: '3px dashed var(--line2)',
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: 10,
          }}
        >
          {stages.map((st, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={st.selected}
              aria-label={st.aria}
              onClick={st.pick}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                padding: '12px 8px 16px',
                borderRadius: 18,
                border: `2px solid ${st.border}`,
                background: st.cardBg,
                font: 'inherit',
                color: 'inherit',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              <span style={{ minHeight: 26, display: 'flex', alignItems: 'center' }}>
                {st.current && (
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: 999,
                      background: '#F6C343',
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: '#1B1830',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {hereLabel}
                  </span>
                )}
              </span>
              <span
                aria-hidden="true"
                style={{ height: 136, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
              >
                <svg viewBox="0 0 44 100" style={{ height: st.figH, width: 'auto', overflow: 'visible' }}>
                  <circle cx="20" cy="13" r="10" fill={st.fig} />{' '}
                  <rect x="9" y="26" width="22" height="36" rx="9" fill={st.fig} />{' '}
                  <path d="M15 58 V96 M25 58 V96" stroke={st.fig} strokeWidth="7" strokeLinecap="round" />{' '}
                  <path
                    d="M10 34 L4 54 M30 34 L36 54"
                    stroke={st.fig}
                    strokeWidth="6"
                    strokeLinecap="round"
                  />{' '}
                  <rect x="2" y="30" width="9" height="20" rx="3" fill="#DC2626" opacity={st.bagOp} />{' '}
                  <path d="M6 5 L20 -1 L34 5 L20 11 Z" fill="#1B1830" opacity={st.capOp} />{' '}
                  <path d="M33 5 V13" stroke="#F6C343" strokeWidth="2" opacity={st.capOp} />{' '}
                  <rect x="33" y="52" width="11" height="9" rx="2" fill="#1B1830" opacity={st.briefOp} />
                </svg>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 16, fontWeight: 700, overflowWrap: 'anywhere' }}>{st.name}</span>
                <span style={{ fontSize: 13, color: 'var(--ink2)' }}>{st.ages}</span>
              </span>
              <span
                style={{
                  minHeight: 52,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px 10px',
                  borderRadius: 12,
                  background: st.chipBg,
                  color: st.chipFg,
                  fontSize: 13.5,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  overflowWrap: 'anywhere',
                }}
              >
                {st.pick_name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
