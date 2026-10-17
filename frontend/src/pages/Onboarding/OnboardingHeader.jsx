import AccountMenu from '../../components/AccountMenu';
import BackButton from '../../components/BackButton';
import MenuButton from '../../components/MenuButton';
import BrandLogo from '../../components/BrandLogo';
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <BackButton fallback="/" />
        <BrandLogo />
      </div>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <MenuButton />
        <AccountMenu />
      </div>
    </header>
  );
}
