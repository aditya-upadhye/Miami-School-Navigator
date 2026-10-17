import { Link } from 'react-router-dom';
import { isMissing, KIND_LABEL, miles, stateGrade, text, zonedLevel } from '../../api/fields';
import { useI18n } from '../../i18n';
import SaveButton from '../../saved/SaveButton';
import { childName, stageForAge } from '../../utils/stages';
import { levelLabel } from './useSchool';

const pill = {
  padding: '5px 12px',
  borderRadius: 999,
  background: 'var(--glass2)',
  border: '1px solid var(--edge)',
  fontSize: 14,
  fontWeight: 600,
};

export default function SchoolHero({ school: s, links, profile }) {
  const { t } = useI18n();
  const lvl = zonedLevel(s.zoned);
  const lvlName = lvl && levelLabel(t, lvl);
  const online = s.flags?.includes('online_school');
  const children = profile.children ?? [];
  const stages = s.stages?.value ?? [];
  const fits = children.map((c, i) => ({ name: childName(c, i), ok: stages.includes(stageForAge(c.age)) }));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'stretch' }}>
      <section style={{ flex: '2 1 480px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Link viewTransition to="/explore" style={{ fontWeight: 700, textDecoration: 'none' }}>
          ← {t('school.backToMap')}
        </Link>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span style={pill}>{KIND_LABEL[s.kind]}</span>
          {online && <span style={pill}>{t('school.hero.online')}</span>}
          <span style={pill}>
            {t('school.hero.grades', { grades: text(s.grades, t('school.hero.gradesNotListed')) })}
          </span>
          <span style={pill}>{stateGrade(s.state_grade)}</span>
          {lvl && (
            <span style={{ ...pill, background: 'var(--accent-tint)', color: 'var(--accent-ink)' }}>
              {t('school.hero.zoned', { level: lvlName })}
            </span>
          )}
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: "'Outfit', sans-serif",
            fontSize: 'clamp(34px, 4vw, 54px)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
          }}
        >
          {s.name}
        </h1>
        <p style={{ margin: 0, fontSize: 18, color: 'var(--ink2)' }}>
          {[s.address, s.city, s.zip].filter(Boolean).join(', ')}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {!isMissing(s.website) && (
            <a href={s.website.value} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>
              {t('school.hero.website')}
            </a>
          )}
          {!isMissing(s.phone) && (
            <span style={{ fontWeight: 600, color: 'var(--ink2)' }}>{s.phone.value}</span>
          )}
          <Link viewTransition to="/pathway" style={{ fontWeight: 700 }}>
            {t('school.hero.pathway')}
          </Link>
          <SaveButton id={s.id} name={s.name} />
        </div>
      </section>
      <aside
        aria-label={t('school.hero.fitAria')}
        style={{
          flex: '1 1 300px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 24,
          borderRadius: 22,
          background: 'var(--panel-dark)',
          backdropFilter: 'blur(18px) saturate(150%)',
          WebkitBackdropFilter: 'blur(18px) saturate(150%)',
          boxShadow: '0 14px 40px rgba(43,27,20,0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
          color: '#FFFFFF',
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#F6C343',
          }}
        >
          {t('school.hero.forFamily')}
        </span>
        <span style={{ fontSize: 22, fontFamily: "'Outfit', sans-serif", fontWeight: 700 }}>
          {online
            ? t('school.hero.online')
            : profile.hasLocation
              ? t('school.hero.distYou', { miles: miles(s.distance_mi) })
              : t('school.hero.noAddress')}
        </span>
        <span style={{ fontSize: 15, color: '#ECE8FA' }}>
          {online
            ? t('school.hero.virtual')
            : s.kind === 'public'
              ? lvl
                ? t('school.hero.zonedYours', { level: lvlName })
                : t('school.hero.notZoned')
              : t('school.hero.notAssigned')}
        </span>
        {fits.length > 0 && (
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              fontSize: 15,
            }}
          >
            {fits.map((f) => (
              <li key={f.name}>
                {f.ok ? '✓' : '–'} {t(f.ok ? 'school.hero.fitOk' : 'school.hero.fitNo', { name: f.name })}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
