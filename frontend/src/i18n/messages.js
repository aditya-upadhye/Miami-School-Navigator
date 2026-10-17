import { account } from './catalog/account';
import { core } from './catalog/core';
import { explore } from './catalog/explore';
import { landing } from './catalog/landing';
import { menu } from './catalog/menu';
import { values } from './catalog/values';
import { onboarding } from './catalog/onboarding';
import { pathway } from './catalog/pathway';
import { saved } from './catalog/saved';
import { school } from './catalog/school';
import { shared } from './catalog/shared';

export const CATALOGS = { core, landing, onboarding, explore, school, pathway, saved, account, menu, values, shared };

/** All catalogs merged per language. A test fails if two catalogs define the same key. */
export const messages = Object.fromEntries(
  ['en', 'es', 'ht'].map((lang) => [lang, Object.assign({}, ...Object.values(CATALOGS).map((c) => c[lang]))]),
);

// Interface text in English, Spanish and Haitian Creole. English is authoritative. The Spanish and Haitian Creole were written by an
// AI assistant and have NOT been reviewed by a native speaker; official names (M-DCPS, VPK, Step Up For Students) stay as written.
// A unit test checks that all three languages have the same keys and the same {placeholders}.
export const LANGS = ['en', 'es', 'ht'];
export const LANG_NAMES = { en: 'English', es: 'Español', ht: 'Kreyòl' };

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ],
  ht: [
    'janvye',
    'fevriye',
    'mas',
    'avril',
    'me',
    'jen',
    'jiyè',
    'out',
    'septanm',
    'oktòb',
    'novanm',
    'desanm',
  ],
};

/** Fill {placeholders}. Unknown placeholders are left as written so a bug is visible rather than silent. */
export const format = (template, vars = {}) =>
  template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** Translate `key` into `lang`; falls back to English, then to the key itself. */
export function translate(lang, key, vars) {
  const text = messages[lang]?.[key] ?? messages.en[key] ?? key;
  return format(text, vars);
}

const parts = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) } : null;
};

/** 'Jan 15, 2027' / '15 de enero de 2027' / '15 janvye 2027' (from an ISO date, without time-zone surprises). */
export function formatDate(iso, lang = 'en') {
  const p = parts(iso);
  if (!p) return '';
  const month = MONTHS[lang]?.[p.mo - 1] ?? MONTHS.en[p.mo - 1];
  if (lang === 'es') return `${p.d} de ${month} de ${p.y}`;
  if (lang === 'ht') return `${p.d === 1 ? '1ye' : p.d} ${month} ${p.y}`;
  return `${month} ${p.d}, ${p.y}`;
}

/** 'September 1' / '1 de septiembre' / '1ye septanm' (the long English month is used so it reads as prose). */
export function formatMonthDay(iso, lang = 'en') {
  const p = parts(iso);
  if (!p) return '';
  const longEn = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  if (lang === 'es') return `${p.d} de ${MONTHS.es[p.mo - 1]}`;
  if (lang === 'ht') return `${p.d === 1 ? '1ye' : p.d} ${MONTHS.ht[p.mo - 1]}`;
  return `${longEn[p.mo - 1]} ${p.d}`;
}

/** '1 day' / '91 days' in the given language. */
export const formatDays = (lang, n) => translate(lang, n === 1 ? 'days.one' : 'days.other', { n });
