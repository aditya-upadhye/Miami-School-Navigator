import Card, { h2 } from '../../components/Card';
import { useI18n } from '../../i18n';
import AlumniSurvey from './AlumniSurvey';
import { useOutcomes } from './useOutcomes';

const W = 560;
const H = 220;
const PAD = { l: 40, r: 16, t: 14, b: 28 };
const SERIES = [
  {
    key: 'enrolled_pct',
    color: 'var(--f1)',
    label: 'school.outcomes.series.enrolled',
  },
  {
    key: 'employed_pct',
    color: 'var(--f2)',
    label: 'school.outcomes.series.employed',
  },
];

/** Line chart of the share of each graduating class in college or employed, one point per year. A year the state hid is a gap. */
function CollegeTrend({ rows, t }) {
  const years = rows.map((r) => r.year);
  const x = (y) =>
    PAD.l + (years.length === 1 ? (W - PAD.l - PAD.r) / 2 : ((y - years[0]) / (years.at(-1) - years[0])) * (W - PAD.l - PAD.r));
  const y = (v) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);
  const last = rows.at(-1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 18px',
        }}
      >
        {SERIES.map((s) => (
          <li
            key={s.key}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 14,
                height: 4,
                borderRadius: 2,
                background: s.color,
              }}
            />
            {t(s.label)}
            {last[s.key] != null && <b style={{ color: 'var(--ink2)' }}>{last[s.key]}%</b>}
          </li>
        ))}
      </ul>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={t('school.outcomes.college.title')}
        style={{ maxWidth: W, overflow: 'visible' }}
      >
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.l - 8} y={y(g) + 4} textAnchor="end" style={{ fontSize: 11, fill: 'var(--ink3)' }}>
              {g}%
            </text>
          </g>
        ))}
        {rows.map((r, i) =>
          i % Math.ceil(rows.length / 7) === 0 || i === rows.length - 1 ? (
            <text key={r.year} x={x(r.year)} y={H - 8} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--ink3)' }}>
              {r.year}
            </text>
          ) : null,
        )}
        {SERIES.map((s) => {
          // break the line at a missing year instead of drawing across it
          const runs = [];
          rows.forEach((r) => {
            if (r[s.key] == null) runs.push([]);
            else {
              if (!runs.length) runs.push([]);
              runs.at(-1).push(r);
            }
          });
          return (
            <g key={s.key}>
              {runs
                .filter((run) => run.length > 1)
                .map((run, i) => (
                  <polyline
                    key={i}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={run.map((r) => `${x(r.year)},${y(r[s.key])}`).join(' ')}
                  />
                ))}
              {rows
                .filter((r) => r[s.key] != null)
                .map((r) => (
                  <circle key={r.year} cx={x(r.year)} cy={y(r[s.key])} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2">
                    <title>{`${r.year}: ${t(s.label)} ${r[s.key]}%`}</title>
                  </circle>
                ))}
            </g>
          );
        })}
      </svg>
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>{t('school.outcomes.table')}</summary>
        <table style={{ marginTop: 8, borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              {['class', 'graduates', 'enrolled', 'employed'].map((c) => (
                <th key={c} style={{ textAlign: 'left', padding: '4px 14px 4px 0' }}>
                  {t(`school.outcomes.col.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year}>
                <td style={{ padding: '3px 14px 3px 0' }}>{r.year}</td>
                <td style={{ padding: '3px 14px 3px 0' }}>{r.graduates ?? '–'}</td>
                <td style={{ padding: '3px 14px 3px 0' }}>{r.enrolled_pct != null ? `${r.enrolled_pct}%` : '–'}</td>
                <td style={{ padding: '3px 14px 3px 0' }}>{r.employed_pct != null ? `${r.employed_pct}%` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** One bar per course path for the latest year, as a share of all students, with the earliest year's share beside it for the trend. */
function Readiness({ years, t }) {
  const latest = years.at(-1);
  const first = years.length > 1 ? years[0] : null;
  const before = (metric) => first?.metrics.find((m) => m.metric === metric);
  const top = Math.max(...latest.metrics.map((m) => m.pct ?? 0), 1);
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {latest.metrics.map((m) => {
        const old = before(m.metric);
        return (
          <li
            key={m.metric}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(120px, 190px) 1fr',
              gap: '2px 14px',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t(`school.outcomes.metric.${m.metric}`)}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                role="img"
                aria-label={`${m.pct}%`}
                style={{
                  flex: 1,
                  height: 10,
                  borderRadius: 4,
                  background: 'var(--track)',
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: `${((m.pct ?? 0) / top) * 100}%`,
                    height: '100%',
                    borderRadius: 4,
                    background: 'var(--accent)',
                  }}
                />
              </span>
              <span
                style={{
                  minWidth: 150,
                  fontSize: 13,
                  color: 'var(--ink2)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <b>{m.pct}%</b> ({m.count})
                {old && old !== m && old.pct != null && ` · ${t('school.outcomes.was', { pct: old.pct, year: first.year })}`}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 14px', borderRadius: 14, background: 'var(--glass3)' }}>
      <span style={{ fontSize: 13, color: 'var(--ink3)' }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800 }}>{value}</span>
      {sub && <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{sub}</span>}
    </div>
  );
}

/** Official FLDOE / NCES figures for the school. A figure that was not reported is left out, never shown as empty. */
function Official({ o, t }) {
  const tiles = [
    o.grad_rate != null && { k: 'gradRate', v: `${o.grad_rate}%`, sub: o.grad_rate_year },
    o.school_grade && { k: 'grade', v: o.school_grade, sub: o.school_grade_year },
    o.pct_continuing_ed != null && { k: 'continuing', v: `${o.pct_continuing_ed}%`, sub: o.fetpip_year },
    o.pct_employed != null && { k: 'employed', v: `${o.pct_employed}%`, sub: o.fetpip_year },
    o.pct_military != null && { k: 'military', v: `${o.pct_military}%`, sub: o.fetpip_year },
  ].filter(Boolean);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 18 }}>{t('school.outcomes.official.title')}</h3>
      {tiles.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {tiles.map((x) => (
            <Tile key={x.k} label={t(`school.outcomes.official.${x.k}`)} value={x.v} sub={x.sub} />
          ))}
        </div>
      )}
      {o.earnings && (
        <p style={{ margin: 0, fontSize: 15 }}>
          <b>{t('school.outcomes.official.earnings')}:</b> {o.earnings}
        </p>
      )}
      {o.program_focus && (
        <p style={{ margin: 0, fontSize: 15 }}>
          <b>{t('school.outcomes.official.focus')}:</b> {o.program_focus}
        </p>
      )}
      {o.sources?.length > 0 && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink3)' }}>
          {o.sources.map((u, i) => (
            <span key={u}>
              {i > 0 && ' · '}
              <a href={u} target="_blank" rel="noreferrer">
                {new URL(u).hostname.replace('www.', '')}
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function Bars({ title, rows }) {
  const top = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b style={{ fontSize: 15 }}>{title}</b>
      {rows.map((r) => (
        <div key={r.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 1fr) 1.2fr auto', gap: 8, alignItems: 'center', fontSize: 14 }}>
          <span>{r.name}</span>
          <span aria-hidden="true" style={{ height: 8, borderRadius: 4, background: 'var(--track)', overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${(r.count / top) * 100}%`, height: '100%', background: 'var(--accent)' }} />
          </span>
          <span style={{ color: 'var(--ink2)', fontVariantNumeric: 'tabular-nums' }}>{r.count}</span>
        </div>
      ))}
    </div>
  );
}

/** What people who list the school on LinkedIn studied and do now: a labelled sample, not a statistic. */
function Linkedin({ li, t, note }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 18 }}>{t('school.outcomes.linkedin.title')}</h3>
      {li.alumni_count > 0 && (
        <p style={{ margin: 0, fontSize: 15, color: 'var(--ink2)' }}>
          {t('school.outcomes.linkedin.count', { n: li.alumni_count })}
          {li.url && (
            <>
              {' · '}
              <a href={li.url} target="_blank" rel="noreferrer">
                {t('school.outcomes.linkedin.open')}
              </a>
            </>
          )}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        {li.studied.length > 0 && <Bars title={t('school.outcomes.linkedin.studied')} rows={li.studied} />}
        {li.does.length > 0 && <Bars title={t('school.outcomes.linkedin.does')} rows={li.does} />}
      </div>
      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink3)' }}>{note('linkedin')}</p>
    </div>
  );
}

export default function Outcomes({ id }) {
  const { t } = useI18n();
  const { data } = useOutcomes(id);
  if (!data || !data.applies) return null;
  const empty = !data.college.length && !data.readiness.length && !data.alumni.length && !data.official && !data.linkedin;
  const latest = data.college.at(-1);
  const readiness = data.readiness.at(-1);
  const note = (key) => data.sources.find((s) => s.key === key)?.note;
  return (
    <Card aria-labelledby="outcomes-title">
      <h2 id="outcomes-title" style={h2}>
        {t('school.outcomes.title')}
      </h2>
      {empty && <p style={{ margin: 0, fontSize: 15, color: 'var(--ink2)' }}>{data.empty_reason}</p>}
      {data.college.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>{t('school.outcomes.college.title')}</h3>
          {latest.enrolled_pct != null && (
            <p style={{ margin: 0, fontSize: 15, color: 'var(--ink2)' }}>
              {t('school.outcomes.latest', {
                year: latest.year,
                pct: latest.enrolled_pct,
                n: latest.with_outcome_data ?? latest.graduates ?? 0,
              })}
            </p>
          )}
          <CollegeTrend rows={data.college} t={t} />
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink3)' }}>{note('fldoe')}</p>
        </div>
      )}
      {readiness && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>{t('school.outcomes.readiness.title', { year: readiness.year })}</h3>
          <Readiness years={data.readiness} t={t} />
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink3)' }}>{note('crdc')}</p>
        </div>
      )}
      {data.official && <Official o={data.official} t={t} />}
      {data.linkedin && <Linkedin li={data.linkedin} t={t} note={note} />}
      {data.alumni.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>{t('school.outcomes.alumni.title')}</h3>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--ink2)' }}>
            {t('school.outcomes.alumni.count', { n: data.alumni_total })}:{' '}
            {data.alumni_groups.map((g) => `${t(`school.outcomes.group.${g.group}`)} ${g.count}`).join(' · ')}
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: 15,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
            }}
          >
            {data.alumni.map((p) => (
              <li key={p.name}>
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {p.name}
                  </a>
                ) : (
                  p.name
                )}{' '}
                <span style={{ color: 'var(--ink3)' }}>
                  · {t(`school.outcomes.group.${p.group}`)}
                  {p.birth_decade ? ` · ${t('school.outcomes.decade', { d: p.birth_decade })}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink3)' }}>{note('wikidata')}</p>
        </div>
      )}
      <AlumniSurvey id={id} />
      {!empty && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink3)' }}>
          {t('school.outcomes.sources')}{' '}
          {data.sources.map((s, i) => (
            <span key={s.key}>
              {i > 0 && ' · '}
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.name}
              </a>
              {s.years ? ` (${s.years})` : ''}
            </span>
          ))}
        </p>
      )}
    </Card>
  );
}
