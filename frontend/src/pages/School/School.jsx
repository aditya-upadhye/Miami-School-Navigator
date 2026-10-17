import AppHeader from '../../components/AppHeader';
import { useI18n } from '../../i18n';
import ThemeShell from '../../components/ThemeShell';
import { Link } from 'react-router-dom';
import AtAGlance from './AtAGlance';
import ChildFit from './ChildFit';
import HowToApply from './HowToApply';
import NearbyPlaces from './NearbyPlaces';
import Outcomes from './Outcomes';
import QuestionsToAsk from './QuestionsToAsk';
import SchoolHero from './SchoolHero';
import { useSchool } from './useSchool';

export default function School() {
  const { data, error, loading, profile } = useSchool();
  const { t } = useI18n();
  return (
    <ThemeShell paddingBottom={72}>
      <AppHeader />
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '32px clamp(16px, 4vw, 40px) 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        {loading && !data && <p style={{ color: 'var(--ink2)' }}>{t('school.loading')}</p>}
        {error && (
          <p role="alert" style={{ color: 'var(--ink)' }}>
            {error.message} {error.suggestedAction}{' '}
            <Link viewTransition to="/explore" style={{ fontWeight: 700 }}>
              {t('school.backToMap')}
            </Link>
          </p>
        )}
        {data && (
          <>
            <SchoolHero school={data.school} links={data.links} profile={profile} />
            <ChildFit id={data.school.id} profile={profile} />
            <AtAGlance school={data.school} />
            <Outcomes id={data.school.id} />
            <HowToApply steps={data.how_to_apply} notes={data.notes} />
            <QuestionsToAsk questions={data.questions_to_ask} />
            <NearbyPlaces parks={data.nearby_parks} libraries={data.nearby_libraries} />
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink3)' }}>
              {data.school.identity_source.as_of
                ? t('school.identityRetrieved', {
                    source: data.school.identity_source.source,
                    date: data.school.identity_source.as_of,
                  })
                : t('school.identity', { source: data.school.identity_source.source })}
            </p>
          </>
        )}
      </div>
    </ThemeShell>
  );
}
