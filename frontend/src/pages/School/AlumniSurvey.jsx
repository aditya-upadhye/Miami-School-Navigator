import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { useApi } from '../../hooks/useApi';
import { useI18n } from '../../i18n';

const control = {
  height: 44,
  padding: '0 12px',
  border: '1.5px solid var(--line2)',
  borderRadius: 12,
  font: "16px 'Figtree', sans-serif",
  color: 'var(--ink)',
};

/** What alumni of this school do today, self-reported by signed-in people. The split is shown only once enough people answered. */
export default function AlumniSurvey({ id }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data } = useApi((signal) => api.survey(id, { signal }), [id, user?.id]);
  const [local, setLocal] = useState(null); // the server's reply to my own save or delete
  const [field, setField] = useState('');
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const view = local ?? data;
  useEffect(() => setLocal(null), [id, user?.id]);
  useEffect(() => {
    setField(view?.mine?.field ?? '');
    setYear(view?.mine?.grad_year ?? '');
  }, [view?.mine?.field, view?.mine?.grad_year]);
  if (!view) return null;

  const run = async (call, ok) => {
    setBusy(true);
    setError(null);
    try {
      setLocal(await call());
      setSaved(ok);
    } catch (e) {
      setError(`${e.message} ${e.suggestedAction ?? ''}`.trim());
    } finally {
      setBusy(false);
    }
  };
  const top = Math.max(...view.breakdown.map((b) => b.pct), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 18 }}>{t('school.outcomes.survey.title')}</h3>
      {view.enough ? (
        <>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--ink2)' }}>{t('school.outcomes.survey.shown', { n: view.responses })}</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {view.breakdown.map((b) => (
              <li
                key={b.field}
                style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 210px) 1fr', gap: '2px 14px', alignItems: 'center' }}
              >
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t(`school.outcomes.survey.field.${b.field}`)}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    role="img"
                    aria-label={`${b.pct}%`}
                    style={{ flex: 1, height: 10, borderRadius: 4, background: 'var(--track)', overflow: 'hidden' }}
                  >
                    <span
                      style={{
                        display: 'block',
                        width: `${(b.pct / top) * 100}%`,
                        height: '100%',
                        borderRadius: 4,
                        background: 'var(--accent)',
                      }}
                    />
                  </span>
                  <span style={{ minWidth: 90, fontSize: 13, color: 'var(--ink2)', fontVariantNumeric: 'tabular-nums' }}>
                    <b>{b.pct}%</b> ({b.count})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: 15, color: 'var(--ink2)' }}>
          {t('school.outcomes.survey.thin', { n: view.responses, min: view.min_responses })}
        </p>
      )}
      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink3)' }}>{t('school.outcomes.survey.note')}</p>

      {user ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api.saveSurvey(id, { field, grad_year: year === '' ? null : Number(year) }), true);
          }}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}
        >
          <label style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, fontWeight: 600 }}>
            {t('school.outcomes.survey.prompt')}
            <select required value={field} onChange={(e) => setField(e.target.value)} style={control}>
              <option value="">{t('school.outcomes.survey.choose')}</option>
              {view.fields.map((f) => (
                <option key={f} value={f}>
                  {t(`school.outcomes.survey.field.${f}`)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: '0 1 150px', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, fontWeight: 600 }}>
            {t('school.outcomes.survey.year')}
            <input type="number" min="1950" max="2100" value={year} onChange={(e) => setYear(e.target.value)} style={control} />
          </label>
          <button
            type="submit"
            disabled={busy || !field}
            style={{
              ...control,
              border: 0,
              padding: '0 18px',
              background: 'var(--accent-grad)',
              color: 'var(--on-accent)',
              fontWeight: 700,
              cursor: 'pointer',
              opacity: busy || !field ? 0.7 : 1,
            }}
          >
            {t(view.mine ? 'school.outcomes.survey.update' : 'school.outcomes.survey.save')}
          </button>
          {view.mine && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => api.deleteSurvey(id), false)}
              style={{ ...control, background: 'var(--glass)', fontWeight: 700, cursor: 'pointer' }}
            >
              {t('school.outcomes.survey.remove')}
            </button>
          )}
        </form>
      ) : (
        <p style={{ margin: 0, fontSize: 15 }}>
          <Link viewTransition to={`/login?next=${encodeURIComponent(`/school/${id}`)}`} style={{ fontWeight: 700 }}>
            {t('school.outcomes.survey.signin')}
          </Link>
        </p>
      )}
      {saved && view.mine && (
        <p role="status" style={{ margin: 0, fontSize: 14, color: 'var(--ink2)' }}>
          {t('school.outcomes.survey.thanks')}
        </p>
      )}
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 14, color: 'var(--danger)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
