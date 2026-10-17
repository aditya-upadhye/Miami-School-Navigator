import { provenance, STATUS_LABEL } from '../api/fields';

const TONE = {
  official: { bg: 'rgba(86,176,120,0.20)', fg: 'var(--ink)' },
  derived: { bg: 'var(--track)', fg: 'var(--ink2)' },
  reported_by_school: { bg: 'rgba(246,195,67,0.28)', fg: 'var(--ink)' },
  curated: { bg: 'var(--accent-tint)', fg: 'var(--accent-ink)' },
  not_available: { bg: 'rgba(220,38,38,0.14)', fg: 'var(--ink2)' },
};

/** Small status pill. Hover (title) shows where the value came from, how it was derived and its date. */
export default function FieldBadge({ field, label }) {
  if (!field) return null;
  const tone = TONE[field.status] ?? TONE.derived;
  return (
    <span
      title={provenance(field)}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        background: tone.bg,
        color: tone.fg,
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: '0.02em',
        verticalAlign: 'middle',
        cursor: 'help',
      }}
    >
      {label ?? STATUS_LABEL[field.status] ?? field.status}
    </span>
  );
}
