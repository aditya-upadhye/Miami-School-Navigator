import { describe, expect, it } from 'vitest';
import { setCurrentLang } from '../i18n/current';
import { messages, translate } from '../i18n/messages';
import { knownChildren } from '../pages/School/ChildFit';
import { cellNote, cellText, comparableRows, joinNames, levelText, shortDate, specLabel } from '../pages/Explore/exploreText';

const field = (value) => ({ value, status: 'official', source: 'x', as_of: '2026-10-16' });
const missing = { value: null, status: 'not_available', source: 'x', as_of: '2026-10-16' };
const ctx = (lang) => ({
  t: (k, v) => translate(lang, k, v),
  nf: (n) => Number(n).toLocaleString(lang === 'es' ? 'es-US' : 'en-US'),
});

describe('explore text helpers', () => {
  it('keeps the English copy as it was', () => {
    setCurrentLang('en');
    const c = ctx('en');
    expect(cellText('zoned', field({ zoned: true, level: 'elementary' }), c)).toBe('Zoned elementary school');
    expect(cellText('zoned', field({ zoned: false }), c)).toBe('Not your zoned school');
    expect(cellText('state_grade', field('B'), c)).toBe('Grade B');
    expect(cellText('state_grade', missing, c)).toBe('No state grade yet');
    expect(cellText('tuition', field(0), c)).toBe('Free');
    expect(cellText('programs', missing, c)).toBe('—');
    expect(cellText('gains_ela', missing, c)).toBe('—');
    expect(cellText('zoned', missing, c)).toBe('n/a');
    expect(cellText('enrollment', field(1234), c)).toBe('1,234');
    expect(cellText('kind', field('charter'), c)).toBe('Charter');
    expect(shortDate('2027-01-15', 'en')).toBe('Jan 15');
    expect(translate('en', 'explore.chip.zoned.middle')).toBe('Zoned middle');
    expect(joinNames(['A', 'B'], c.t)).toBe('A & B');
  });
  it('translates cells, level chips and joined names', () => {
    setCurrentLang('es');
    const c = ctx('es');
    expect(cellText('zoned', field({ zoned: true, level: 'high' }), c)).toBe(
      'Escuela secundaria asignada por zona',
    );
    expect(cellText('state_grade', field('A'), c)).toBe('Calificación A');
    expect(cellText('kind', field('public'), c)).toBe('Pública');
    expect(levelText('explore.chip.zoned', 'middle', c.t)).toBe('Intermedia asignada por zona');
    expect(joinNames(['Ana', 'Luis'], c.t)).toBe('Ana y Luis');
    setCurrentLang('ht');
    expect(cellText('programs', missing, ctx('ht'))).toBe('—');
    expect(levelText('explore.cell.zoned', 'elementary', ctx('ht').t)).toBe('Lekòl primè ki asiyen pa zòn');
    setCurrentLang('en');
  });
  it('falls back for an unknown level and unknown specialty names', () => {
    const t = (k, v) => translate('en', k, v);
    expect(levelText('explore.chip.zoned', 'magnet', t)).toBe('Zoned magnet');
    expect(specLabel('Robotics', t)).toBe('Robotics');
    expect(specLabel('Arts', (k, v) => translate('es', k, v))).toBe('Artes');
    expect(specLabel('Bilingual / dual language', (k, v) => translate('ht', k, v))).toBe('Bileng / de lang');
  });
  it('writes a short date badge in each language and survives a bad date', () => {
    expect(shortDate('2027-09-01', 'es')).toBe('1 sep');
    expect(shortDate('2027-01-15', 'ht')).toBe('15 jan');
    expect(shortDate('2027-09-01', 'ht')).toBe('1ye sep');
    expect(shortDate('', 'es')).toBe('');
    expect(shortDate('soon', 'en')).toBe('');
  });
  it('has a name for every zone level in every language', () => {
    for (const lang of ['en', 'es', 'ht'])
      for (const k of ['explore.zone.elementary', 'explore.zone.middle', 'explore.zone.high'])
        expect(messages[lang][k]).toBeTruthy();
  });
});

describe('compare table: rows and missing cells', () => {
  const t = (key) => ({ 'explore.cell.notApplicable': 'Not applicable' })[key] ?? key;
  const val = (value) => ({ value, status: 'official', source: 's', as_of: '2026-10-17' });
  const unknown = { value: null, status: 'not_available', source: 'x', as_of: '2026-10-17', why: 'No data.', suggested_action: 'Ask the school about its magnet program.' };
  const na = { ...unknown, applicable: false, why: 'Magnet programs are an M-DCPS public-school feature.', suggested_action: 'Ask.' };

  it('drops a row when no school has a value, whether unknown or not applicable', () => {
    const rows = [
      { key: 'kind', cells: [val('public'), val('private')] },
      { key: 'magnet_themes', cells: [unknown, unknown] },
      { key: 'is_magnet', cells: [na, na] },
      { key: 'ese', cells: [unknown, na] },
      { key: 'tuition', cells: [val(0), unknown] },
    ];
    expect(comparableRows(rows).map((r) => r.key)).toEqual(['kind', 'tuition']);
  });
  it('keeps a row when at least one school has a value, including a real "no" or zero', () => {
    const rows = [{ key: 'is_magnet', cells: [val(false), na] }, { key: 'tuition', cells: [val(0), unknown] }];
    expect(comparableRows(rows)).toHaveLength(2);
  });
  it('says "Not applicable" and explains why, instead of asking the school', () => {
    expect(cellText('is_magnet', na, { t, nf: String })).toBe('Not applicable');
    expect(cellNote(na)).toBe('Magnet programs are an M-DCPS public-school feature.');
  });
  it('a value that is simply unknown is a plain dash with no message; a real value has no note', () => {
    expect(cellText('ese', unknown, { t, nf: String })).toBe('—');
    expect(cellNote(unknown)).toBe('');
    expect(cellNote(val(true))).toBe('');
  });
});

describe('child fit card only needs a child with an age', () => {
  it('keeps children with a valid age and ignores the rest', () => {
    expect(knownChildren({ children: [{ age: 7, name: 'Leo' }, { age: null }, { name: 'x' }, { age: 0 }, { age: -1 }] })).toEqual([{ age: 7, name: 'Leo' }, { age: 0 }]);
    expect(knownChildren({})).toEqual([]);
  });
});
