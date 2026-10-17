import BrandLogo from '../../components/BrandLogo';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';

export default function OnboardingHeader() {
  const { t } = useI18n();
  return (
    <header
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '16px clamp(16px, 4vw, 48px)',
        background: 'var(--glass)',
        backdropFilter: 'blur(16px) saturate(170%)',
        WebkitBackdropFilter: 'blur(16px) saturate(170%)',
        borderBottom: '1px solid var(--edge)',
      }}
    >
      <BrandLogo />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink2)' }}>{t('onboarding.step')}</span>
        <span aria-hidden="true" style={{ display: 'flex', gap: 4 }}>
          <span
            style={{
              width: 28,
              height: 6,
              borderRadius: 3,
              background: 'var(--accent-grad)',
              boxShadow: 'var(--accent-shadow)',
            }}
          />
          <span
            style={{
              width: 28,
              height: 6,
              borderRadius: 3,
              background: 'var(--accent-grad)',
              boxShadow: 'var(--accent-shadow)',
            }}
          />
          <span style={{ width: 28, height: 6, borderRadius: 3, background: 'var(--line)' }} />
        </span>
      </div>
      <Link
        to="/explore"
        style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, fontSize: 15, fontWeight: 600 }}
      >
        {t('onboarding.skipMap')}
      </Link>
    </header>
  );
}
