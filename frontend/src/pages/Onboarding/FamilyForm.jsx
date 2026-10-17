import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { useProfile } from '../../profile/ProfileProvider';

export default function FamilyForm({
  addKid,
  budgetLabel,
  budgets,
  kidCount,
  kids,
  kidsSummary,
  onRadius,
  onWhere,
  pickChat,
  prioSummary,
  prios,
  valueChips,
  radius,
  radiusLabel,
  removeKid,
  where,
  error,
  submit,
  submitting,
}) {
  const { t } = useI18n();
  const { remember, setRemember, forget } = useProfile();
  return (
    <section
      aria-label={t('onboarding.form.label')}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}
    >
      <div
        style={{
          flex: '999 1 560px',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 30,
          padding: 32,
          borderRadius: 20,
          border: '1px solid var(--edge)',
          boxShadow: 'var(--shadow)',
          background: 'var(--glass)',
          backdropFilter: 'blur(16px) saturate(170%)',
          WebkitBackdropFilter: 'blur(16px) saturate(170%)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label
            htmlFor="where"
            style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700 }}
          >
            {t('onboarding.form.where')}
          </label>
          <input
            id="where"
            type="text"
            value={where}
            onChange={onWhere}
            style={{
              height: 52,
              padding: '0 16px',
              border: '1.5px solid var(--line2)',
              borderRadius: 14,
              font: "16px 'Figtree', sans-serif",
              color: 'var(--ink)',
            }}
          />
          <span style={{ fontSize: 14, color: 'var(--ink2)' }}>{t('onboarding.form.whereHelp')}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700 }}>
              {t('onboarding.form.children')}
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: 4,
                borderRadius: 999,
                border: '1.5px solid var(--line2)',
              }}
            >
              <button
                type="button"
                aria-label={t('onboarding.form.removeChild')}
                onClick={removeKid}
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
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                </svg>
              </button>
              <span style={{ minWidth: 88, textAlign: 'center', fontWeight: 700 }}>{kidCount}</span>
              <button
                type="button"
                aria-label={t('onboarding.form.addChild')}
                onClick={addKid}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  border: 0,
                  background: 'var(--accent-grad)',
                  boxShadow: 'var(--accent-shadow)',
                  color: 'var(--on-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          </div>
          {kids.map((kid, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: 14,
                padding: 16,
                borderRadius: 14,
                background: 'var(--glass3)',
                border: '1px solid var(--line)',
              }}
            >
              <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor={kid.nameId} style={{ fontSize: 14, fontWeight: 600 }}>
                  {t('onboarding.form.kidName', { label: kid.label })}
                </label>
                <input
                  id={kid.nameId}
                  type="text"
                  value={kid.name}
                  onChange={kid.onName}
                  placeholder={t('onboarding.form.optional')}
                  style={{
                    height: 46,
                    padding: '0 14px',
                    border: '1.5px solid var(--line2)',
                    borderRadius: 12,
                    font: "16px 'Figtree', sans-serif",
                    color: 'var(--ink)',
                    background: 'var(--glass)',
                    backdropFilter: 'blur(16px) saturate(170%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(170%)',
                  }}
                />
              </div>
              <div style={{ flex: '1 1 130px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor={kid.ageId} style={{ fontSize: 14, fontWeight: 600 }}>
                  {t('onboarding.form.age')}
                </label>
                <select
                  id={kid.ageId}
                  value={kid.age}
                  onChange={kid.onAge}
                  style={{
                    height: 46,
                    padding: '0 12px',
                    border: '1.5px solid var(--line2)',
                    borderRadius: 12,
                    font: "16px 'Figtree', sans-serif",
                    color: 'var(--ink)',
                    background: 'var(--glass)',
                    backdropFilter: 'blur(16px) saturate(170%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(170%)',
                  }}
                >
                  <option value="">{t('onboarding.form.selectAge')}</option>
                  <option value="0">{t('onboarding.form.under1')}</option>
                  {Array.from({ length: 17 }, (_, n) => (
                    <option key={n + 1} value={n + 1}>
                      {n + 1}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: '1 1 150px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor={kid.gradeId} style={{ fontSize: 14, fontWeight: 600 }}>
                  {t('onboarding.form.nextYear')}
                </label>
                <select
                  id={kid.gradeId}
                  value={kid.grade}
                  onChange={kid.onGrade}
                  required
                  style={{
                    height: 46,
                    padding: '0 12px',
                    border: '1.5px solid var(--line2)',
                    borderRadius: 12,
                    font: "16px 'Figtree', sans-serif",
                    color: 'var(--ink)',
                    background: 'var(--glass)',
                    backdropFilter: 'blur(16px) saturate(170%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(170%)',
                  }}
                >
                  <option value="">{t('onboarding.form.selectGrade')}</option>
                  {kid.gradeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <label
                htmlFor={kid.supId}
                style={{
                  flex: '1 1 230px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 46,
                  fontSize: 15,
                  cursor: 'pointer',
                }}
              >
                <input
                  id={kid.supId}
                  type="checkbox"
                  checked={kid.support}
                  onChange={kid.onSupport}
                  style={{ width: 22, height: 22, accentColor: 'var(--accent)' }}
                />
                {t('onboarding.form.support')}
              </label>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <label
              htmlFor="radius"
              style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700 }}
            >
              {t('onboarding.form.travel')}
            </label>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-ink)' }}>{radiusLabel}</span>
          </div>
          <input
            id="radius"
            type="range"
            min="1"
            max="15"
            step="1"
            value={radius}
            onChange={onRadius}
            style={{ width: '100%', height: 28, accentColor: 'var(--accent)' }}
          />
          <div
            style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink3)' }}
          >
            {[1, 5, 10, 15].map((n) => (
              <span key={n}>{t('onboarding.form.mi', { n })}</span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700 }}>
            {t('onboarding.form.budget')}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {budgets.map((b, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={b.on}
                onClick={b.pick}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 44,
                  padding: '0 16px',
                  borderRadius: 999,
                  border: `1.5px solid ${b.border}`,
                  background: b.bg,
                  color: b.fg,
                  font: "600 15px 'Figtree', sans-serif",
                  cursor: 'pointer',
                }}
              >
                {b.on && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
                {b.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700 }}>
            {t('onboarding.form.priorities')}{' '}
            <span
              style={{
                fontFamily: "'Figtree', sans-serif",
                fontSize: 15,
                fontWeight: 500,
                color: 'var(--ink2)',
              }}
            >
              {t('onboarding.form.prioHelp')}
            </span>
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {prios.map((p, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={p.on}
                onClick={p.pick}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 44,
                  padding: '0 16px',
                  borderRadius: 999,
                  border: `1.5px solid ${p.border}`,
                  background: p.bg,
                  color: p.fg,
                  font: "600 15px 'Figtree', sans-serif",
                  cursor: 'pointer',
                }}
              >
                {p.on && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700 }}>{t('values.title')}</span>
          <span style={{ fontSize: 14, color: 'var(--ink2)' }}>{t('values.help')}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {valueChips.map((c, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={c.on}
                title={c.tip}
                onClick={c.pick}
                style={{ minHeight: 44, padding: '0 16px', borderRadius: 999, border: `1.5px solid ${c.border}`, background: c.bg, color: c.fg, font: "600 15px 'Figtree', sans-serif", cursor: 'pointer' }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            {t('onboarding.form.remember')}
          </label>
          <span style={{ fontSize: 14, color: 'var(--ink2)' }}>{t('onboarding.form.rememberHelp')}</span>
          {remember && (
            <button
              type="button"
              onClick={forget}
              style={{
                alignSelf: 'flex-start',
                border: 0,
                background: 'none',
                padding: 0,
                color: 'var(--accent-ink)',
                font: "700 14px 'Figtree', sans-serif",
                cursor: 'pointer',
              }}
            >
              {t('onboarding.form.forget')}
            </button>
          )}
        </div>
        {error && (
          <p
            role="alert"
            style={{
              margin: 0,
              padding: '10px 14px',
              borderRadius: 12,
              background: 'rgba(220,38,38,0.14)',
              color: 'var(--ink)',
            }}
          >
            {error}
          </p>
        )}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 16,
            paddingTop: 8,
            borderTop: '1px solid var(--line)',
          }}
        >
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 52,
              padding: '0 24px',
              borderRadius: 14,
              background: 'var(--accent-grad)',
              boxShadow: 'var(--accent-shadow)',
              color: 'var(--on-accent)',
              fontSize: 17,
              fontWeight: 700,
              border: 0,
              cursor: 'pointer',
              opacity: submitting ? 0.7 : 1,
              font: "700 17px 'Figtree', sans-serif",
            }}
          >
            {submitting ? t('onboarding.form.finding') : t('onboarding.form.submit')}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
          <Link viewTransition to="/explore" style={{ fontWeight: 600 }}>
            {t('onboarding.skipExplore')}
          </Link>
        </div>
      </div>
      <aside
        style={{
          flex: '1 1 300px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: 24,
          borderRadius: 20,
          background: 'var(--panel-dark)',
          backdropFilter: 'blur(18px) saturate(150%)',
          WebkitBackdropFilter: 'blur(18px) saturate(150%)',
          boxShadow: '0 14px 40px rgba(43,27,20,0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
          color: '#FFFFFF',
        }}
      >
        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700 }}>
          {t('onboarding.summary.title')}
        </span>
        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <dt style={{ fontSize: 13, color: '#D5D0EE' }}>{t('onboarding.summary.home')}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{where}</dd>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <dt style={{ fontSize: 13, color: '#D5D0EE' }}>{t('onboarding.summary.children')}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{kidsSummary}</dd>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <dt style={{ fontSize: 13, color: '#D5D0EE' }}>{t('onboarding.summary.distance')}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>
              {t('onboarding.summary.fromHome', { radius: radiusLabel })}
            </dd>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <dt style={{ fontSize: 13, color: '#D5D0EE' }}>{t('onboarding.summary.budget')}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{budgetLabel}</dd>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <dt style={{ fontSize: 13, color: '#D5D0EE' }}>{t('onboarding.summary.priorities')}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{prioSummary}</dd>
          </div>
        </dl>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#ECE8FA' }}>
          {t('onboarding.summary.note')}
        </p>
        <button
          type="button"
          onClick={pickChat}
          style={{
            alignSelf: 'flex-start',
            minHeight: 44,
            padding: '0 16px',
            borderRadius: 12,
            border: '1.5px solid #F6C343',
            background: 'transparent',
            color: '#F6C343',
            font: "700 15px 'Figtree', sans-serif",
            cursor: 'pointer',
          }}
        >
          {t('onboarding.form.switchChat')}
        </button>
      </aside>
    </section>
  );
}
