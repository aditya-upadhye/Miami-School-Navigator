import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { KIND_LABEL } from '../api/fields';
import { useChat } from '../hooks/useChat';
import { useI18n } from '../i18n';

const STARTER_KEYS = ['shared.navi.starter1', 'shared.navi.starter2', 'shared.navi.starter3'];

// Minimal markdown: **bold** and "* item" bullets. The model's text is never injected as HTML.
function Rich({ text }) {
  return text.split('\n').map((line, i) => {
    const bullet = /^\s*[*-]\s+/.test(line);
    const parts = line.replace(/^\s*[*-]\s+/, '').split(/(\*\*[^*]+\*\*)/g);
    return (
      <span
        key={i}
        style={{
          display: 'block',
          paddingLeft: bullet ? 14 : 0,
          textIndent: bullet ? -14 : 0,
          minHeight: line ? undefined : 8,
        }}
      >
        {bullet && '• '}
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p,
        )}
      </span>
    );
  });
}

function Sources({ citations }) {
  const { t, date } = useI18n();
  if (!citations?.length) return null;
  return (
    <details style={{ fontSize: 13, color: 'var(--ink2)' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
        {t('shared.navi.sources', { n: citations.length })}
      </summary>
      <ol style={{ margin: '6px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {citations.map((c) => (
          <li key={c.id}>
            {c.url ? (
              <a href={c.url} target="_blank" rel="noopener noreferrer">
                {c.source}
              </a>
            ) : (
              c.source
            )}
            {c.as_of ? ` · ${t('shared.navi.asOf', { date: date(c.as_of.slice(0, 10)) })}` : ''}
          </li>
        ))}
      </ol>
    </details>
  );
}

function Message({ m }) {
  const { t } = useI18n();
  if (m.role === 'user') {
    return (
      <p
        style={{
          alignSelf: 'flex-end',
          margin: 0,
          maxWidth: '85%',
          padding: '12px 14px',
          borderRadius: '16px 16px 4px 16px',
          background: 'var(--accent-grad)',
          boxShadow: 'var(--accent-shadow)',
          color: 'var(--on-accent)',
          fontSize: 15,
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
        }}
      >
        {m.content}
      </p>
    );
  }
  return (
    <div
      style={{
        alignSelf: 'flex-start',
        maxWidth: '94%',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 14px',
        borderRadius: '16px 16px 16px 4px',
        background: 'var(--glass3)',
        fontSize: 15,
        lineHeight: 1.45,
      }}
    >
      <div>
        <Rich text={m.content} />
      </div>
      {m.results?.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {m.results.slice(0, 6).map((r) => (
            <li key={r.id}>
              <Link viewTransition
                to={`/school/${r.id}`}
                style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'var(--accent-tint)',
                  color: 'var(--accent-ink)',
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                {r.name} · {KIND_LABEL[r.kind]}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {m.mapApplied && (
        <span style={{ alignSelf: 'flex-start', padding: '3px 10px', borderRadius: 999, background: 'var(--accent-grad)', boxShadow: 'var(--accent-shadow)', color: 'var(--on-accent)', fontSize: 12.5, fontWeight: 700 }}>
          ✓ {t('shared.navi.mapApplied')}
        </span>
      )}
      <Sources citations={m.citations} />
      {m.degraded && (
        <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{t('shared.navi.degraded')}</span>
      )}
      {!m.degraded && m.warnings?.length > 0 && (
        <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
          {t('shared.navi.headsUp', { warnings: m.warnings.join('; ') })}
        </span>
      )}
    </div>
  );
}

/** Message list + input for Jarvis (POST /api/chat). Used by the floating panel on Explore and by the Onboarding chat. */
export default function JarvisConversation({ height = 360, autoFocus = false, mapEnabled = false }) {
  const { messages, send, loading, error, reset } = useChat({ mapEnabled });
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const end = useRef(null);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, loading]);

  const submit = (e) => {
    e?.preventDefault();
    if (!draft.trim() || loading) return;
    send(draft);
    setDraft('');
  };

  return (
    <>
      <div
        aria-live="polite"
        style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, height, overflowY: 'auto' }}
      >
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: 'var(--ink2)' }}>
              {t('shared.navi.intro')}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {STARTER_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => send(t(key))}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 999,
                    border: '1.5px solid var(--line2)',
                    background: 'var(--glass2)',
                    color: 'var(--ink)',
                    font: "600 13.5px 'Figtree', sans-serif",
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.length > 0 && (
          <button type="button" onClick={reset} style={{ alignSelf: 'flex-end', padding: 0, border: 0, background: 'none', color: 'var(--ink3)', font: "600 12.5px 'Figtree', sans-serif", cursor: 'pointer', textDecoration: 'underline' }}>
            {t('shared.navi.clear')}
          </button>
        )}
        {messages.map((m, i) => (
          <Message key={i} m={m} />
        ))}
        {loading && (
          <p style={{ alignSelf: 'flex-start', margin: 0, color: 'var(--ink2)', fontSize: 14 }}>
            {t('shared.navi.thinking')}
          </p>
        )}
        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--ink2)', fontSize: 14 }}>
            {error.message} {error.suggestedAction}
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        onSubmit={submit}
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: '12px 14px 14px',
          borderTop: '1px solid var(--line)',
        }}
      >
        <input
          type="text"
          aria-label={t('shared.navi.messageAria')}
          placeholder={t('shared.navi.placeholder')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus={autoFocus}
          style={{
            flexGrow: 1,
            minWidth: 0,
            height: 46,
            padding: '0 14px',
            border: '1.5px solid var(--line2)',
            borderRadius: 12,
            font: "15px 'Figtree', sans-serif",
            color: 'var(--ink)',
          }}
        />
        <button
          type="submit"
          aria-label={t('shared.navi.send')}
          disabled={loading || !draft.trim()}
          style={{
            flexShrink: 0,
            width: 46,
            height: 46,
            borderRadius: 23,
            border: 0,
            background: 'var(--accent-grad)',
            boxShadow: 'var(--accent-shadow)',
            color: 'var(--on-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            opacity: loading || !draft.trim() ? 0.5 : 1,
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4z" />
          </svg>
        </button>
      </form>
    </>
  );
}
