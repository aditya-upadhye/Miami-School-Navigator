import { useMemo } from 'react';
import { useProfile } from '../profile/ProfileProvider';
import { formatDate, formatDays, formatMonthDay, translate } from './messages';

export { LANGS, LANG_NAMES, formatDate, formatDays, formatMonthDay, translate } from './messages';

/** `const { t, lang, date, days } = useI18n()`: translation helpers bound to the family's chosen language. */
export function useI18n() {
  const { profile, setLang } = useProfile();
  const lang = profile.lang ?? 'en';
  return useMemo(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      date: (iso) => formatDate(iso, lang),
      monthDay: (iso) => formatMonthDay(iso, lang),
      days: (n) => formatDays(lang, n),
      /** plural-aware: uses `key.one` when n is 1, otherwise `key.other` */
      tp: (key, n, vars) => translate(lang, `${key}.${n === 1 ? 'one' : 'other'}`, { n, ...vars }),
      /** locale number formatting */
      nf: (n) => Number(n).toLocaleString(lang === 'es' ? 'es-US' : 'en-US'),
    }),
    [lang, setLang],
  );
}
