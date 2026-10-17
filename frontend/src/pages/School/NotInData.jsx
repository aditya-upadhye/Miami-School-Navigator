import Card, { h2 } from '../../components/Card';
import { useI18n } from '../../i18n';

const ITEMS = ['reviews', 'photos', 'safety', 'staffing'];

export default function NotInData() {
  const { t } = useI18n();
  return (
    <Card aria-labelledby="gaps-title">
      <h2 id="gaps-title" style={h2}>
        {t('school.gaps.title')}
      </h2>
      <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ITEMS.map((id) => (
          <div key={id}>
            <dt style={{ fontWeight: 700 }}>{t(`school.gaps.${id}.title`)}</dt>
            <dd style={{ margin: 0, color: 'var(--ink2)' }}>{t(`school.gaps.${id}.text`)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
