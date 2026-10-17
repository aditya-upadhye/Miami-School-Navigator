// Helpers for the backend's Field objects: {value, status, source, url, as_of, method, why, suggested_action}.
// Display text is translated through the current language (see i18n/current.js), so these stay plain functions.
import { getLang } from '../i18n/current';
import { translate } from '../i18n/messages';

const tr = (key, vars) => translate(getLang(), key, vars);

/** An object whose properties are looked up and translated on access, so `KIND_LABEL[kind]` keeps working in every language. */
const lookup = (prefix) =>
  new Proxy({}, { get: (_, k) => (typeof k === 'string' ? tr(`${prefix}.${k}`) : undefined) });

export const STATUS_LABEL = lookup('field');
export const KIND_LABEL = lookup('kind');
export const STAGE_LABEL = lookup('stage');

export const isMissing = (f) =>
  !f || f.status === 'not_available' || f.value === null || f.value === undefined;

const titleCase = (s) =>
  String(s)
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());

const SPECIALTIES = new Set(['STEM', 'Arts', 'Bilingual', 'International', 'IB', 'Montessori']);
const STAGES = new Set(['infant_toddler', 'pre_k', 'elementary', 'middle', 'high']);
const tag = (x) =>
  STAGES.has(x) ? STAGE_LABEL[x] : SPECIALTIES.has(x) ? tr(`specialty.${x}`) : titleCase(x);

/** "Before & after school · 6:30am-6:00pm · Fee varies; contact the school": an aftercare value {before_care, after_care, hours, cost, provider}. */
export function aftercareText(v) {
  const label = v.before_care && v.after_care ? tr('shared.aftercare.both') : v.before_care ? tr('shared.aftercare.before') : v.after_care ? tr('shared.aftercare.after') : null;
  const cost = v.cost && (/varies/i.test(v.cost) ? tr('shared.aftercare.costVaries') : v.cost);
  const provider = v.provider && (/^school-run$/i.test(v.provider) ? tr('shared.aftercare.schoolRun') : v.provider);
  return [label, v.hours, cost, provider].filter(Boolean).join(' · ');
}

const APPLY_CODES = new Set(['zoned', 'charter_lottery', 'magnet_application']);

/** Plain-text value of a field; `fallback` is shown when the data is not available. */
export function text(f, fallback = tr('shared.notAvailable')) {
  if (isMissing(f)) return fallback;
  const v = f.value;
  if (Array.isArray(v)) return v.length ? v.map(tag).join(', ') : tr('shared.no'); // an empty list is a verified "none"
  if (v === true) return tr('shared.yes');
  if (typeof v === 'string' && APPLY_CODES.has(v)) return tr(`shared.apply.${v}`);
  if (v && typeof v === 'object' && !Array.isArray(v) && ('after_care' in v || 'before_care' in v || 'hours' in v)) return aftercareText(v);
  if (v === false) return tr('shared.no');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export const miles = (f) => (isMissing(f) ? tr('shared.na') : `${f.value} mi`);
export const percent = (f) => (isMissing(f) ? tr('shared.notAvailable') : `${f.value}%`);
export const tuition = (f) =>
  isMissing(f)
    ? tr('shared.askSchool')
    : f.value === 0
      ? tr('shared.free')
      : tr('shared.perYear', {
          amount: Number(f.value).toLocaleString(getLang() === 'es' ? 'es-US' : 'en-US'),
        });
export const stateGrade = (f) =>
  isMissing(f) ? tr('shared.noStateGrade') : tr('shared.stateGrade', { grade: f.value });

/** One-line provenance for tooltips and footnotes. */
export function provenance(f) {
  if (!f) return '';
  const parts = [
    STATUS_LABEL[f.status] ?? f.status,
    f.source,
    f.as_of && tr('shared.navi.asOf', { date: f.as_of }),
    f.method,
  ].filter(Boolean);
  return parts.join(' · ');
}

/** What to tell the family when a value is missing. */
export function nextStep(f) {
  return f?.status === 'not_available' ? [f.why, f.suggested_action].filter(Boolean).join(' ') : '';
}

export const zonedLevel = (f) => (f && !isMissing(f) && f.value?.zoned ? f.value.level : null);

/** How well a curated rule is confirmed. The backend writes it into a field's method as "verification: <level>". */
export const VERIFICATION = {
  confirmed_district_source: {
    label: 'Confirmed',
    tone: 'good',
  },
  other_district_policies: {
    label: 'Check this',
    tone: 'warn',
  },
  single_secondary_source: {
    label: 'Check this',
    tone: 'warn',
  },
  unconfirmed_project_spec: {
    label: 'Not confirmed',
    tone: 'bad',
  },
};

/** The verification level of a field (or its method string), or null when it is not a curated rule. */
export function verificationInfo(fieldOrMethod) {
  const method = typeof fieldOrMethod === 'string' ? fieldOrMethod : (fieldOrMethod?.method ?? '');
  const key = Object.keys(VERIFICATION).find((k) => method.includes(k));
  return key ? { key, ...VERIFICATION[key] } : null;
}
