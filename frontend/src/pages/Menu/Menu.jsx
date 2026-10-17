import { Link } from 'react-router-dom';
import BackButton from '../../components/BackButton';
import BrandLogo from '../../components/BrandLogo';
import LanguageSwitcher from '../../components/LanguageSwitcher';
import SettingsSection from '../../components/SettingsSection';
import ThemeShell from '../../components/ThemeShell';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';

// Every page and starting option, as buttons. Titles and descriptions reuse the text each page already has.
const GROUPS = [
  {
    title: 'menu.group.start',
    items: [
      { to: '/', title: 'menu.home.title', body: 'menu.home.body' },
      { to: '/onboarding?mode=chat', title: 'onboarding.mode.chat.title', body: 'onboarding.mode.chat.body' },
      { to: '/onboarding?mode=form', title: 'onboarding.mode.form.title', body: 'onboarding.mode.form.body' },
      { to: '/explore', title: 'onboarding.skipExplore', body: 'onboarding.mode.skip.body' },
    ],
  },
  {
    title: 'menu.group.tools',
    items: [
      { to: '/explore', title: 'nav.explore', body: 'menu.explore.body' },
      { to: '/explore#compare', title: 'nav.compare', body: 'menu.compare.body' },
      { to: '/pathway', title: 'nav.pathways', body: 'menu.pathway.body' },
      { to: '/planner', title: 'nav.plan', body: 'menu.plan.body' },
      { to: '/saved', title: 'nav.saved', body: 'menu.saved.body' },
    ],
  },
];

function Tile({ to, title, body }) {
  const { t } = useI18n();
  return (
    <Link viewTransition
      to={to}
      style={{
        flex: '1 1 260px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 18,
        borderRadius: 18,
        border: '2px solid var(--line)',
        background: 'var(--glass2)',
        textDecoration: 'none',
        color: 'var(--ink)',
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 700 }}>{t(title)}</span>
      <span style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--ink2)' }}>{t(body)}</span>
    </Link>
  );
}

export default function Menu() {
  const { t } = useI18n();
  const { user } = useAuth();
  const groups = [
    ...GROUPS,
    { title: 'menu.group.account', items: [user
      ? { to: '/account', title: 'account.signOut', body: 'menu.account.signedIn' }
      : { to: '/account', title: 'account.landing.title', body: 'account.landing.body' }] },
  ];
  return (
    <ThemeShell paddingBottom={72}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '20px clamp(16px, 4vw, 48px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <BackButton fallback="/" />
          <BrandLogo />
        </div>
        <LanguageSwitcher />
      </header>
      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '16px clamp(16px, 4vw, 40px) 0', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(30px, 4vw, 44px)', fontWeight: 800 }}>{t('menu.title')}</h1>
          <p style={{ margin: 0, fontSize: 18, color: 'var(--ink2)' }}>{t('menu.lede')}</p>
        </div>
        {groups.map((g) => (
          <section key={g.title} aria-labelledby={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 id={g.title} style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
              {t(g.title)}
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {g.items.map((i) => (
                <Tile key={i.title} {...i} />
              ))}
            </div>
          </section>
        ))}
        <section aria-labelledby="menu-settings" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 id="menu-settings" style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
            {t('menu.settings')}
          </h2>
          <SettingsSection />
        </section>
      </main>
    </ThemeShell>
  );
}
