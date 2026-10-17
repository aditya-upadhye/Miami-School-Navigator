import { useI18n } from '../../i18n';

const TONES = {
  good: { bg: 'rgba(86,176,120,0.22)', fg: 'var(--ink)' },
  warn: { bg: 'rgba(246,195,67,0.32)', fg: 'var(--ink)' },
  bad: { bg: 'rgba(220,38,38,0.16)', fg: 'var(--ink)' },
  muted: { bg: 'var(--track)', fg: 'var(--ink2)' },
  info: { bg: 'var(--accent-tint)', fg: 'var(--accent-ink)' },
};

export function Pill({ tone = 'muted', children, title }) {
  const t = TONES[tone];
  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        fontSize: 12.5,
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

/** A caveat for rules that need checking, plus a source link and the date it was checked. */
export function Confidence({ field }) {
  const { t, date } = useI18n();
  return (
    <span
      style={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: 'var(--ink2)',
      }}
    >
      {field.url && (
        <a href={field.url} target="_blank" rel="noopener noreferrer">
          {t('conf.source')}
        </a>
      )}
      {field.as_of && <span>{t('conf.checked', { date: date(field.as_of) })}</span>}
    </span>
  );
}
