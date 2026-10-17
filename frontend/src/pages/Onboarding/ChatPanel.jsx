import { Link } from 'react-router-dom';
import JarvisConversation from '../../components/JarvisConversation';
import { useI18n } from '../../i18n';

export default function ChatPanel() {
  const { t } = useI18n();
  return (
    <section
      aria-label={t('onboarding.chat.label')}
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--edge)',
        boxShadow: 'var(--shadow)',
        borderRadius: 20,
        background: 'var(--glass)',
        backdropFilter: 'blur(16px) saturate(170%)',
        WebkitBackdropFilter: 'blur(16px) saturate(170%)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 18px',
          borderBottom: '1px solid var(--edge)',
        }}
      >
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 700 }}>Jarvis</span>
          <span style={{ fontSize: 13, color: 'var(--ink2)' }}>{t('onboarding.chat.intro')}</span>
        </span>
        <Link to="/explore" style={{ fontWeight: 700 }}>
          {t('onboarding.chat.map')}
        </Link>
      </div>
      <JarvisConversation height={380} blankProfile />
    </section>
  );
}
