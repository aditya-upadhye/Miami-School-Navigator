import { describe, expect, it } from 'vitest';
import { LANGS, format, formatDate, formatDays, formatMonthDay, messages, translate } from '../i18n/messages';

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('message catalogs', () => {
  const keys = Object.keys(messages.en);

  it('has the same keys in English, Spanish and Haitian Creole', () => {
    expect(LANGS).toEqual(['en', 'es', 'ht']);
    for (const lang of ['es', 'ht']) {
      expect(Object.keys(messages[lang]).sort(), lang).toEqual([...keys].sort());
    }
  });
  it('has the same {placeholders} in every language for every key', () => {
    for (const k of keys) {
      for (const lang of ['es', 'ht'])
        expect(placeholders(messages[lang][k]), `${lang}:${k}`).toEqual(placeholders(messages.en[k]));
    }
  });
  it('has no empty strings and is actually translated', () => {
    // Short labels can legitimately be identical (STEM, Pre-K, Charter, Plan). Anything of three or more words must really differ.
    const words = (s) => s.replace(/\{\w+\}/g, '').trim().split(/\s+/).filter(Boolean).length;
    for (const k of keys) {
      for (const lang of ['es', 'ht']) {
        expect(messages[lang][k].trim().length, `${lang}:${k}`).toBeGreaterThan(0);
        if (words(messages.en[k]) >= 3) expect(messages[lang][k], `${lang}:${k} looks untranslated`).not.toBe(messages.en[k]);
      }
    }
  });
  it('covers every verification level the backend can return', () => {
    for (const level of [
      'confirmed_district_source',
      'other_district_policies',
      'single_secondary_source',
      'unconfirmed_project_spec',
    ]) {
      for (const lang of LANGS) {
        expect(messages[lang][`verify.${level}.label`]).toBeTruthy();
        expect(messages[lang][`verify.${level}.note`]).toBeTruthy();
      }
    }
  });
});

describe('translate and format', () => {
  it('fills placeholders and keeps unknown ones visible', () => {
    expect(format('a {x} b {y}', { x: 1 })).toBe('a 1 b {y}');
    expect(translate('es', 'planner.title', { year: '2027-28' })).toBe(
      'Su plan de elección de escuela para 2027-28',
    );
    expect(translate('ht', 'planner.title', { year: '2027-28' })).toBe('Plan chwa lekòl ou pou 2027-28');
  });
  it('falls back to English for an unknown language and to the key for an unknown key', () => {
    expect(translate('fr', 'nav.explore')).toBe('Explore');
    expect(translate('es', 'no.such.key')).toBe('no.such.key');
  });
  it('pluralizes days', () => {
    expect(formatDays('en', 1)).toBe('1 day');
    expect(formatDays('en', 91)).toBe('91 days');
    expect(formatDays('es', 1)).toBe('1 día');
    expect(formatDays('es', 91)).toBe('91 días');
    expect(formatDays('ht', 91)).toBe('91 jou');
  });
});

describe('dates', () => {
  it('formats the local way, with no time-zone drift', () => {
    expect(formatDate('2027-01-15', 'en')).toBe('Jan 15, 2027');
    expect(formatDate('2027-01-15', 'es')).toBe('15 de enero de 2027');
    expect(formatDate('2027-01-15', 'ht')).toBe('15 janvye 2027');
    expect(formatDate('2027-09-01', 'ht')).toBe('1ye septanm 2027');
    expect(formatDate('2026-12-31', 'es')).toBe('31 de diciembre de 2026');
    expect(formatDate('2027-03-01', 'en')).toBe('Mar 1, 2027');
  });
  it('formats month and day as prose', () => {
    expect(formatMonthDay('2027-09-01', 'en')).toBe('September 1');
    expect(formatMonthDay('2027-09-01', 'es')).toBe('1 de septiembre');
    expect(formatMonthDay('2027-09-01', 'ht')).toBe('1ye septanm');
  });
  it('returns an empty string for a bad date instead of "Invalid Date"', () => {
    for (const bad of ['', null, undefined, 'soon', '2027-1-5']) expect(formatDate(bad, 'es')).toBe('');
  });
});

import { CATALOGS } from '../i18n/messages';

describe('catalog modules', () => {
  it('never define the same key twice across modules (a merge would silently drop one)', () => {
    const seen = new Map();
    for (const [name, cat] of Object.entries(CATALOGS)) {
      for (const k of Object.keys(cat.en)) {
        expect(seen.has(k), `${k} is in both "${seen.get(k)}" and "${name}"`).toBe(false);
        seen.set(k, name);
      }
    }
  });
  it('each module has the same keys in every language', () => {
    for (const [name, cat] of Object.entries(CATALOGS)) {
      for (const lang of ['es', 'ht']) expect(Object.keys(cat[lang]).sort(), `${name}:${lang}`).toEqual(Object.keys(cat.en).sort());
    }
  });
});
