import { useI18n } from '../../i18n';
export default function FiltersPanel({
  onRadius,
  radius,
  radiusLabel,
  reset,
  onlySpec,
  specNote,
  specs,
  switches,
  toggleOnlySpec,
  toggleChat,
  types,
}) {
  const { t } = useI18n();
  return (
    <aside
      aria-label={t('explore.filters.aria')}
      style={{
        flex: '1 1 320px',
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
        padding: 22,
        borderRadius: 22,
        border: '1px solid var(--edge)',
        boxShadow: 'var(--shadow)',
        background: 'var(--glass)',
        backdropFilter: 'blur(16px) saturate(170%)',
        WebkitBackdropFilter: 'blur(16px) saturate(170%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            fontFamily: "'Outfit', sans-serif",
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6B54C9"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
            <circle cx="15" cy="6" r="2" />
            <circle cx="9" cy="12" r="2" />
            <circle cx="17" cy="18" r="2" />
          </svg>
          {t('explore.filters.title')}
        </span>
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: 40,
            padding: '0 12px',
            borderRadius: 10,
            border: 0,
            background: 'transparent',
            color: 'var(--accent-ink)',
            font: "700 14px 'Figtree', sans-serif",
            cursor: 'pointer',
          }}
        >
          {t('explore.filters.reset')}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <label htmlFor="f-radius" style={{ fontSize: 15, fontWeight: 700 }}>
            {t('explore.filters.travel')}
          </label>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent-ink)' }}>{radiusLabel}</span>
        </div>
        <input
          id="f-radius"
          type="range"
          min="1"
          max="25"
          step="1"
          value={radius}
          onChange={onRadius}
          style={{ width: '100%', height: 28, accentColor: 'var(--accent)' }}
        />
        <div
          style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink3)' }}
        >
          <span>{t('explore.unit.mi', { n: 1 })}</span>
          <span>{t('explore.unit.mi', { n: 25 })}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{t('explore.filters.type')}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {types.map((c, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={c.on}
              onClick={c.pick}
              style={{
                minHeight: 40,
                padding: '0 14px',
                borderRadius: 999,
                border: `1.5px solid ${c.border}`,
                background: c.bg,
                color: c.fg,
                font: "600 14px 'Figtree', sans-serif",
                cursor: 'pointer',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{t('explore.filters.spec')}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {specs.map((c, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={c.on}
              onClick={c.pick}
              style={{
                minHeight: 40,
                padding: '0 14px',
                borderRadius: 999,
                border: `1.5px solid ${c.border}`,
                background: c.bg,
                color: c.fg,
                font: "600 14px 'Figtree', sans-serif",
                cursor: 'pointer',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={onlySpec}
            onChange={toggleOnlySpec}
            style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
          />
          {t('explore.filters.onlyMatch')}
        </label>
        <span style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--ink3)' }}>{specNote}</span>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          borderTop: '1px solid var(--line)',
          paddingTop: 10,
        }}
      >
        {switches.map((w, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={w.on}
            aria-disabled={w.disabled || undefined}
            title={w.disabled ? w.disabledReason : undefined}
            onClick={w.disabled ? undefined : w.toggle}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              minHeight: 56,
              padding: '6px 0',
              border: 0,
              borderBottom: '1px solid var(--line)',
              background: 'transparent',
              textAlign: 'left',
              font: 'inherit',
              color: 'inherit',
              cursor: w.disabled ? 'not-allowed' : 'pointer',
              opacity: w.disabled ? 0.5 : 1,
            }}
          >
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{w.label}</span>
              <span style={{ fontSize: 13, color: 'var(--ink2)' }}>
                {w.disabled
                  ? t('explore.switch.unavailable', { hint: w.hint, reason: w.disabledReason })
                  : w.hint}
              </span>
            </span>
            <span
              aria-hidden="true"
              style={{
                flexShrink: 0,
                position: 'relative',
                width: 44,
                height: 26,
                borderRadius: 13,
                background: w.track,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 3,
                  left: w.knob,
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  background: 'var(--glass)',
                  backdropFilter: 'blur(16px) saturate(170%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(170%)',
                  boxShadow: '0 1px 2px rgba(16,35,46,0.3)',
                }}
              />
            </span>
          </button>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 16,
          borderRadius: 16,
          background: 'var(--panel-dark)',
          backdropFilter: 'blur(18px) saturate(150%)',
          WebkitBackdropFilter: 'blur(18px) saturate(150%)',
          boxShadow: '0 14px 40px rgba(43,27,20,0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
          color: '#FFFFFF',
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700 }}>{t('explore.ask.title')}</span>
        <span style={{ fontSize: 14, lineHeight: 1.45, color: '#ECE8FA' }}>{t('explore.ask.body')}</span>
        <button
          type="button"
          onClick={toggleChat}
          style={{
            alignSelf: 'flex-start',
            minHeight: 44,
            padding: '0 16px',
            borderRadius: 12,
            border: 0,
            background: '#F6C343',
            color: '#1B1830',
            font: "700 15px 'Figtree', sans-serif",
            cursor: 'pointer',
          }}
        >
          {t('nav.ask')}
        </button>
      </div>
    </aside>
  );
}
