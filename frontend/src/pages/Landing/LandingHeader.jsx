import BrandLogo from '../../components/BrandLogo';

import { useProfile } from '../../profile/ProfileProvider';
import { useI18n } from '../../i18n';

const LANGS = [
  ['en', 'English'],
  ['es', 'Español'],
  ['ht', 'Kreyòl'],
];

export default function LandingHeader() {
  const { profile, setLang } = useProfile();
  const { t } = useI18n();
  return (
    <header
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '24px clamp(16px, 4vw, 56px)',
      }}
    >
      <BrandLogo size="lg" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div
          style={{ display: 'flex', gap: 2, padding: 4, background: 'var(--edge)', borderRadius: 999 }}
          aria-label={t('nav.language')}
        >
          {LANGS.map(([code, label]) => {
            const on = profile.lang === code;
            return (
              <button
                key={code}
                type="button"
                aria-pressed={on}
                onClick={() => setLang(code)}
                title={t('landing.lang.title')}
                style={{
                  minHeight: 36,
                  padding: '0 14px',
                  border: 0,
                  borderRadius: 999,
                  background: on ? 'var(--panel-dark)' : 'transparent',
                  backdropFilter: on ? 'blur(18px) saturate(150%)' : undefined,
                  WebkitBackdropFilter: on ? 'blur(18px) saturate(150%)' : undefined,
                  boxShadow: on
                    ? '0 14px 40px rgba(43,27,20,0.28), inset 0 1px 0 rgba(255,255,255,0.12)'
                    : undefined,
                  color: on ? '#FFFFFF' : 'var(--ink)',
                  font: "600 14px 'Figtree', sans-serif",
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
