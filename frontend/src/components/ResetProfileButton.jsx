import { useI18n } from '../i18n';
import { useProfile } from '../profile/ProfileProvider';

/** "Reset": forget the family that was filled in (address, children, preferences, and any "remember me" copy) and start empty again. Only shown while a family's own details are in use. Saved schools and the signed-in account are not touched. */
export default function ResetProfileButton({ style }) {
  const { t } = useI18n();
  const { profile, forget } = useProfile();
  if (!profile.hasLocation) return null;
  return (
    <button
      type="button"
      title={t('menu.reset.title')}
      onClick={() => window.confirm(t('menu.reset.confirm')) && forget()}
      style={{
        minHeight: 40,
        padding: '0 16px',
        borderRadius: 999,
        border: '1.5px solid var(--line2)',
        background: 'var(--glass)',
        color: 'var(--ink)',
        font: "700 14px 'Figtree', sans-serif",
        cursor: 'pointer',
        ...style,
      }}
    >
      ↺ {t('menu.reset')}
    </button>
  );
}
