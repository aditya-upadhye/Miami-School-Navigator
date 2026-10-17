import Card, { h2 } from '../../components/Card';
import { useI18n } from '../../i18n';
import { Confidence } from './Bits';

export default function ScholarshipGuide({ guide, intro }) {
  const { t } = useI18n();
  if (!guide.length) return null;
  return (
    <Card id="scholarships" aria-labelledby="sch-title">
      <h2 id="sch-title" style={h2}>
        {t('guide.title')}
      </h2>
      {intro && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 15.5, lineHeight: 1.5 }}>{intro.value}</span>
          <Confidence field={intro} />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {guide.map((g) => (
          <div
            key={g.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: '16px 18px',
              borderRadius: 16,
              background: 'var(--glass3)',
            }}
          >
            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 19, fontWeight: 700 }}>
              {g.program}
            </span>
            <span style={{ fontSize: 15, lineHeight: 1.5 }}>{g.summary.value}</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {t(g.schools_nearby === 1 ? 'guide.count.one' : 'guide.count.other', { n: g.schools_nearby })}
            </span>
            <Confidence field={g.summary} />
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--ink2)' }}>{t('guide.disclaimer')}</p>
    </Card>
  );
}
