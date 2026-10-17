import Card, { h2 } from '../../components/Card';
import FieldBadge from '../../components/FieldBadge';
import { miles } from '../../api/fields';
import { useI18n } from '../../i18n';

function List({ title, items }) {
  const { t } = useI18n();
  return (
    <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontWeight: 700 }}>{title}</span>
      {items.length === 0 ? (
        <span style={{ color: 'var(--ink2)' }}>{t('school.nearby.none')}</span>
      ) : (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {items.map((p) => (
            <li
              key={`${p.name}-${p.address}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '10px 14px',
                borderRadius: 12,
                background: 'var(--glass3)',
              }}
            >
              <span style={{ fontWeight: 700 }}>{p.name}</span>
              <span
                style={{
                  fontSize: 14,
                  color: 'var(--ink2)',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                {t('school.nearby.away', { miles: miles(p.distance_mi) })}{' '}
                <FieldBadge field={p.distance_mi} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function NearbyPlaces({ parks, libraries }) {
  const { t } = useI18n();
  return (
    <Card id="nearby" aria-labelledby="nearby-title">
      <h2 id="nearby-title" style={h2}>
        {t('school.nearby.title')}
      </h2>
      <p style={{ margin: 0, color: 'var(--ink2)' }}>{t('school.nearby.intro')}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        <List title={t('school.nearby.parks')} items={parks} />
        <List title={t('school.nearby.libraries')} items={libraries} />
      </div>
    </Card>
  );
}
