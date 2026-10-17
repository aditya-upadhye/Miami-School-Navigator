import { Link } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import ThemeShell from '../../components/ThemeShell';
import { useI18n } from '../../i18n';
import PathwayHeading from './PathwayHeading';
import StageOptions from './StageOptions';
import StageTrack from './StageTrack';
import { usePathway } from './usePathway';

export default function Pathway() {
  const p = usePathway();
  const { t } = useI18n();
  return (
    <ThemeShell paddingBottom={72}>
      <AppHeader active="pathways" />
      <div
        style={{
          maxWidth: 1360,
          margin: '0 auto',
          padding: '32px clamp(16px, 3vw, 40px) 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        <PathwayHeading intro={p.intro} kids={p.kids} title={p.title} />
        {!p.hasChildren && (
          <p style={{ color: 'var(--ink2)' }}>
            {t('pathway.addAges')}{' '}
            <Link to="/onboarding" style={{ fontWeight: 700 }}>
              {t('pathway.tellUs')}
            </Link>
          </p>
        )}
        {p.loading && !p.stages.length && <p style={{ color: 'var(--ink2)' }}>{t('pathway.building')}</p>}
        {p.error && (
          <p role="alert">
            {p.error.message} {p.error.suggestedAction}
          </p>
        )}
        {p.stages.length > 0 && (
          <>
            <StageTrack hereLabel={p.hereLabel} stages={p.stages} />
            {p.panel && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
                <StageOptions panel={p.panel} />
              </div>
            )}
            {p.notes.map((n) => (
              <p key={n} style={{ margin: 0, color: 'var(--ink2)', fontSize: 14 }}>
                {n}
              </p>
            ))}
            <p style={{ margin: 0, color: 'var(--ink3)', fontSize: 13.5 }}>{p.zoneNote}</p>
          </>
        )}
      </div>
    </ThemeShell>
  );
}
