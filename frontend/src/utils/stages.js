import { getLang } from '../i18n/current';
import { translate } from '../i18n/messages';

// Same age -> stage rules as the backend (backend/app/domain.py).
export function stageForAge(age) {
  if (age < 0) return null;
  if (age < 3) return 'infant_toddler';
  if (age < 5) return 'pre_k';
  if (age < 11) return 'elementary';
  if (age < 14) return 'middle';
  if (age < 18) return 'high';
  return null;
}

/** The grade a child of this age enters next, in `lang` (defaults to the language currently shown). */
export function gradeLabelForAge(age, lang = getLang()) {
  const t = (key, vars) => translate(lang, `onboarding.grade.${key}`, vars);
  if (age < 1) return t('infant');
  if (age < 3) return t('toddler');
  if (age === 3) return t('pre3');
  if (age === 4) return t('vpk');
  if (age === 5) return t('kinder');
  if (age <= 17) return t('grade', { n: age - 5 });
  return t('past');
}

/** The child's own name, or "Child 2" in `lang` (defaults to the language currently shown). */
export const childName = (c, i, lang = getLang()) => c.name?.trim() || translate(lang, 'child', { n: i + 1 });

/** Whole years between an ISO birth date and `today` (a Date), or null for a missing or invalid date. */
export function ageFromBirth(iso, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const birth = new Date(y, mo - 1, d);
  if (birth.getFullYear() !== y || birth.getMonth() !== mo - 1 || birth > today) return null;
  let age = today.getFullYear() - y;
  if (today.getMonth() < mo - 1 || (today.getMonth() === mo - 1 && today.getDate() < d)) age -= 1;
  return age;
}
