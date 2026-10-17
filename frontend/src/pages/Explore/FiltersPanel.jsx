import { useI18n } from '../../i18n';

function KeyDot({ children, dot }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 16, height: 16, borderRadius: 8, border: '2px solid #FFFFFF', boxShadow: '0 0 0 1px var(--line2)', ...dot }} />
      {children}
    </span>
  );
}

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
  types,
  valueChips = [],
  zoneNote,
  zoneToggles = [],
}) {
  const { t } = useI18n();
  return (
    <div aria-label={t('explore.filters.aria')} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{t('values.title')}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {valueChips.map((c, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={c.on}
              title={c.tip}
              onClick={c.pick}
              style={{ minHeight: 40, padding: '0 14px', borderRadius: 999, border: `1.5px solid ${c.border}`, background: c.bg, color: c.fg, font: "600 14px 'Figtree', sans-serif", cursor: 'pointer' }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--ink3)' }}>{t('values.help')}</span>
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
      {zoneToggles.length > 0 && (
        <div role="group" aria-label={t('explore.zone.aria')} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ flexBasis: '100%', fontSize: 15, fontWeight: 700 }}>{t('explore.zone.heading')}</span>
          {zoneToggles.map((z) => (
            <button
              key={z.level}
              type="button"
              aria-pressed={z.on}
              onClick={z.toggle}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 40,
                padding: '0 14px',
                borderRadius: 999,
                border: `2px solid ${z.color}`,
                background: z.on ? 'var(--glass)' : 'transparent',
                color: 'var(--ink)',
                font: "600 14px 'Figtree', sans-serif",
                cursor: 'pointer',
                opacity: z.on ? 1 : 0.65,
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 3, background: z.color, opacity: z.on ? 1 : 0.4 }} />
              {z.label}
            </button>
          ))}
          <span style={{ flexBasis: '100%', fontSize: 12.5, color: 'var(--ink3)' }}>{zoneNote}</span>
        </div>
      )}
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>{t('menu.panel.key')}</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, fontSize: 14, color: 'var(--ink2)' }}>
          <KeyDot dot={{ background: 'var(--accent-grad)' }}>{t('explore.legend.match')}</KeyDot>
          <KeyDot dot={{ background: '#F6C343' }}>{t('explore.legend.cmp')}</KeyDot>
          <KeyDot dot={{ background: 'var(--ink)' }}>{t('explore.legend.selected')}</KeyDot>
          <KeyDot dot={{ background: '#DC2626' }}>{t('explore.legend.home')}</KeyDot>
        </div>
      </details>
    </div>
  );
}
