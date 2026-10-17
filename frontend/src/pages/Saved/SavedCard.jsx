import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isMissing, KIND_LABEL, miles, stateGrade, text, tuition } from '../../api/fields';
import { secondaryButton } from '../../auth/ui';
import { useI18n } from '../../i18n';

const card = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  borderRadius: 18,
  border: '1.5px solid var(--line)',
  background: 'var(--glass)',
  backdropFilter: 'blur(16px) saturate(170%)',
  WebkitBackdropFilter: 'blur(16px) saturate(170%)',
};

function Note({ row, signedIn, onSave, name }) {
  const { t } = useI18n();
  const [value, setValue] = useState(row.note);
  const [status, setStatus] = useState(''); // '' | 'saving' | 'saved'
  useEffect(() => setValue(row.note), [row.note]);
  if (!signedIn) {
    return (
      <p style={{ margin: 0, fontSize: 14, color: 'var(--ink2)' }}>
        <Link viewTransition to="/login?next=%2Fsaved" style={{ fontWeight: 700 }}>
          {t('saved.note.signIn')}
        </Link>
      </p>
    );
  }
  const id = `note-${row.id}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 14, fontWeight: 600 }}>
        {t('saved.note.label', { name })}
      </label>
      <textarea
        id={id}
        rows={2}
        maxLength={500}
        value={value}
        placeholder={t('saved.note.placeholder')}
        onChange={(e) => {
          setValue(e.target.value);
          setStatus('');
        }}
        onBlur={async () => {
          if (value === row.note) return;
          setStatus('saving');
          const ok = await onSave(value);
          setStatus(ok === false ? '' : 'saved');
        }}
        style={{
          width: '100%',
          padding: '10px 12px',
          border: '1.5px solid var(--line2)',
          borderRadius: 12,
          font: "15px 'Figtree', sans-serif",
          color: 'var(--ink)',
          resize: 'vertical',
        }}
      />
      <span aria-live="polite" style={{ minHeight: 18, fontSize: 13, color: 'var(--ink3)' }}>
        {status === 'saving' ? t('saved.note.saving') : status === 'saved' ? t('saved.note.saved') : ''}
      </span>
    </div>
  );
}

/** One saved school: summary facts, a link to its page, a note box and a remove button. */
export default function SavedCard({ row, profile, signedIn, onRemove, onNote }) {
  const { t } = useI18n();
  const s = row.school;
  const name = s?.name ?? row.id;
  const online = s?.flags?.includes('online_school');
  return (
    <li style={{ listStyle: 'none', display: 'flex' }}>
      <article data-testid="saved-card" aria-label={name} style={{ ...card, flex: 1, minWidth: 0 }}>
        {row.status === 'ok' && s && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: 20,
                  fontWeight: 700,
                  lineHeight: 1.2,
                }}
              >
                <Link viewTransition to={`/school/${encodeURIComponent(s.id)}`} style={{ color: 'inherit' }}>
                  {s.name}
                </Link>
              </h2>
              <span style={{ fontSize: 14, color: 'var(--ink2)' }}>
                {KIND_LABEL[s.kind]} ·{' '}
                {t('school.hero.grades', { grades: text(s.grades, t('school.hero.gradesNotListed')) })}
              </span>
            </div>
            <ul style={{ margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                stateGrade(s.state_grade),
                tuition(s.tuition),
                online
                  ? t('explore.dist.online')
                  : !isMissing(s.distance_mi)
                    ? t(profile.isDemo ? 'school.hero.distDemo' : 'school.hero.distYou', {
                        miles: miles(s.distance_mi),
                      })
                    : null,
              ]
                .filter(Boolean)
                .map((c) => (
                  <li
                    key={c}
                    style={{
                      listStyle: 'none',
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: 'var(--glass3)',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {c}
                  </li>
                ))}
            </ul>
          </>
        )}
        {row.status === 'loading' && (
          <p role="status" style={{ margin: 0, color: 'var(--ink2)' }}>
            {t('saved.card.loading')}
          </p>
        )}
        {(row.status === 'gone' || row.status === 'error') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, overflowWrap: 'anywhere' }}>{row.id}</h2>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink2)' }}>
              {t(row.status === 'gone' ? 'saved.card.gone' : 'saved.card.failed')}
            </p>
          </div>
        )}

        {row.status !== 'loading' && <Note row={row} signedIn={signedIn} name={name} onSave={onNote} />}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'auto' }}>
          {row.status === 'ok' && s && (
            <Link viewTransition
              to={`/school/${encodeURIComponent(s.id)}`}
              style={{ ...secondaryButton, flex: '1 1 120px', fontSize: 14 }}
            >
              {t('explore.card.details')}
            </Link>
          )}
          {row.status === 'error' && row.retry && (
            <button
              type="button"
              onClick={row.retry}
              style={{ ...secondaryButton, flex: '1 1 120px', fontSize: 14 }}
            >
              {t('saved.card.retry')}
            </button>
          )}
          <button
            type="button"
            aria-label={t('saved.btn.remove', { name })}
            onClick={onRemove}
            style={{ ...secondaryButton, flex: '1 1 120px', fontSize: 14 }}
          >
            {t('saved.card.remove')}
          </button>
        </div>
      </article>
    </li>
  );
}
