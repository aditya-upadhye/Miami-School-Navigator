import { useI18n } from '../i18n';
import { useProfile } from '../profile/ProfileProvider';
import { useTheme } from '../theme/ThemeProvider';
import LanguageSwitcher from './LanguageSwitcher';
import ResetProfileButton from './ResetProfileButton';

const row = { display: 'flex', flexDirection: 'column', gap: 8 };
const label = { fontSize: 13, fontWeight: 700, color: 'var(--ink2)' };

/** Secondary options in one place: language, light/dark, and forgetting the family that was filled in. */
export default function SettingsSection() {
  const { t } = useI18n();
  const { dark, toggleTheme } = useTheme();
  const { profile } = useProfile();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={row}>
        <span style={label}>{t('menu.settings.language')}</span>
        <div style={{ alignSelf: 'flex-start' }}>
          <LanguageSwitcher />
        </div>
      </div>
      <div style={row}>
        <span style={label}>{t('menu.settings.appearance')}</span>
        <button
          type="button"
          aria-pressed={dark}
          onClick={toggleTheme}
          style={{
            alignSelf: 'flex-start',
            minHeight: 40,
            padding: '0 16px',
            borderRadius: 999,
            border: '1.5px solid var(--line2)',
            background: 'var(--glass)',
            color: 'var(--ink)',
            font: "700 14px 'Figtree', sans-serif",
            cursor: 'pointer',
          }}
        >
          {dark ? '☀ ' : '☾ '}
          {t(dark ? 'shared.theme.toLight' : 'shared.theme.toDark')}
        </button>
      </div>
      <div style={row}>
        <span style={label}>{t('menu.settings.family')}</span>
        {!profile.hasLocation ? (
          <span style={{ fontSize: 14, color: 'var(--ink2)' }}>{t('menu.settings.familyNone')}</span>
        ) : (
          <div style={{ alignSelf: 'flex-start' }}>
            <ResetProfileButton />
          </div>
        )}
      </div>
    </div>
  );
}
