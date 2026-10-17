import JarvisConversation from '../../components/JarvisConversation';
import { useI18n } from '../../i18n';
import { useProfile } from '../../profile/ProfileProvider';

export default function JarvisChat({ toggleChat }) {
  const { profile } = useProfile();
  const { t } = useI18n();
  return (
    <section
      aria-label={t('explore.navi.aria')}
      style={{
        position: 'fixed',
        right: 16,
        top: 88, // opens under the header's Talk to Jarvis button, top-right
        maxHeight: 'calc(100vh - 104px)',
        zIndex: 60,
        width: 390,
        maxWidth: 'calc(100vw - 32px)',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 22,
        background: 'var(--glass)',
        backdropFilter: 'blur(16px) saturate(170%)',
        WebkitBackdropFilter: 'blur(16px) saturate(170%)',
        boxShadow: '0 24px 60px rgba(16,35,46,0.3)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '12px 12px 12px 18px',
          borderBottom: '1px solid var(--edge)',
        }}
      >
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 700 }}>Jarvis</span>
          <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>
            {t(profile.hasLocation ? 'explore.navi.knows' : 'explore.navi.needsAddress')}
          </span>
        </span>
        <button
          type="button"
          aria-label={t('explore.navi.close')}
          onClick={toggleChat}
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
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <JarvisConversation autoFocus />
    </section>
  );
}
