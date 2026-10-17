import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';

/** Compact switcher above the assistant / form: jump between the ways to start without going back to the landing page. */
export default function ModeSwitcher({ chatOn, formOn }) {
  const { t } = useI18n();
  const items = [
    { key: 'chat', to: '/onboarding?mode=chat', on: chatOn, label: t('onboarding.mode.chat.title') },
    { key: 'form', to: '/onboarding?mode=form', on: formOn, label: t('onboarding.mode.form.title') },
    { key: 'skip', to: '/explore', on: false, label: t('onboarding.skipExplore') },
  ];
  return (
    <nav aria-label={t('menu.startAria')} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {items.map((i) => (
        <Link viewTransition
          key={i.key}
          to={i.to}
          replace={i.key !== 'skip'}
          aria-current={i.on ? 'page' : undefined}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            padding: '0 18px',
            borderRadius: 999,
            border: `1.5px solid ${i.on ? 'var(--accent)' : 'var(--line2)'}`,
            background: i.on ? 'var(--accent-tint)' : 'var(--glass)',
            color: i.on ? 'var(--accent-ink)' : 'var(--ink)',
            fontWeight: 700,
            fontSize: 15,
            textDecoration: 'none',
          }}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
