import { isMissing, KIND_LABEL, miles, percent, text, tuition } from '../../api/fields';
import { formatMonthDay } from '../../i18n/messages';

const LEVELS = ['elementary', 'middle', 'high'];
const KINDS = ['public', 'charter', 'private', 'early_learning'];
const SPECIALTIES = ['STEM', 'Arts', 'Bilingual', 'International', 'IB', 'Montessori'];

/** 'Jan 15' in English; '15 ene' / '15 jan' in Spanish / Haitian Creole (short enough for the date badge). */
export function shortDate(iso, lang, monthDay = formatMonthDay) {
  if (lang === 'es' || lang === 'ht') {
    const m = /^(\S+)\s+(?:de\s+)?(\S+)$/.exec(monthDay(iso, lang));
    return m ? `${m[1]} ${m[2].slice(0, 3)}` : '';
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return '';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** A specialty or priority name (STEM, Arts, 'Bilingual / dual language', ...) in the family's language; unknown names stay as written. */
export function specLabel(name, t) {
  if (SPECIALTIES.includes(name)) return t(`specialty.${name}`);
  if (name === 'Bilingual / dual language') return t('explore.prio.bilingual');
  return name;
}

/** Translated text for a key that has one entry per school level (elementary / middle / high) plus an `.other` fallback. */
export function levelText(prefix, level, t) {
  return LEVELS.includes(level) ? t(`${prefix}.${level}`) : t(`${prefix}.other`, { level });
}

/** Join names with the language's "and" (' & ', ' y ', ' ak '). */
export const joinNames = (names, t) => names.join(t('explore.and'));

/** Text of one cell in the compare table. Row labels and "not available" reasons come from the backend already translated. */
export function cellText(key, f, { t, nf }) {
  if (isMissing(f)) {
    if (key === 'state_grade') return t('shared.noStateGrade');
    if (key === 'zoned') return t('shared.na');
    return key === 'gains_ela' || key === 'gains_math' || key === 'proficiency_ela' || key === 'proficiency_math'
      ? t('shared.notAvailable')
      : t('explore.cell.notAvailableAsk');
  }
  if (key === 'kind') return KINDS.includes(f.value) ? KIND_LABEL[f.value] : String(f.value);
  if (key === 'distance_mi') return miles(f);
  if (key === 'zoned')
    return f.value.zoned ? levelText('explore.cell.zoned', f.value.level, t) : t('explore.cell.notZoned');
  if (key === 'state_grade') return t('explore.cell.grade', { grade: f.value });
  if (key === 'gains_ela' || key === 'gains_math' || key === 'proficiency_ela' || key === 'proficiency_math')
    return percent(f);
  if (key === 'tuition') return tuition(f);
  if (key === 'enrollment') return nf(f.value);
  return text(f);
}
