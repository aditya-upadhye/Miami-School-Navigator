import { describe, expect, it } from 'vitest';
import { translate } from '../i18n/messages';
import { describe as describeOption } from '../pages/Pathway/usePathway';
import { glanceRows } from '../pages/School/AtAGlance';
import { levelLabel } from '../pages/School/useSchool';

const tIn = (lang) => (key, vars) => translate(lang, key, vars);

describe('school page helpers', () => {
  it('translates the zoned level and leaves an unknown one as it came', () => {
    expect(levelLabel(tIn('en'), 'elementary')).toBe('elementary');
    expect(levelLabel(tIn('es'), 'middle')).toBe('intermedia');
    expect(levelLabel(tIn('ht'), 'high')).toBe('segondè');
    expect(levelLabel(tIn('es'), 'sixth')).toBe('sixth');
  });
  it('keeps the English hero and glance copy', () => {
    const t = tIn('en');
    expect(t('school.hero.zoned', { level: 'elementary' })).toBe('Your zoned elementary school');
    expect(t('school.glance.zonedYes', { level: 'middle' })).toBe('Yes, zoned middle');
    expect(t('school.hero.fitNo', { name: 'Leo' })).toBe('Leo: outside its grade range');
    expect(t('school.glance.licenseExpired', { number: 'C1', date: '2026-01-01' })).toBe(
      'C1, expires 2026-01-01 (expired per county record)',
    );
  });
});

describe('pathway option meta line', () => {
  const miles = { kind: 'public', label: { value: 0.5 } };
  const overlap = { kind: 'charter', label: { value: { overlap_pct: 72 } } };
  it('is unchanged in English', () => {
    expect(describeOption(miles, tIn('en'))).toBe('Public · 0.5 mi from your address');
    expect(describeOption(overlap, tIn('en'))).toBe(
      "Charter · about 72% of the earlier zone's area overlaps this zone",
    );
  });
  it('is written in Spanish and Haitian Creole', () => {
    // the kind label follows the app-wide current language, the rest follows `t`
    expect(describeOption(miles, tIn('es'))).toContain('a 0.5 mi de su dirección');
    expect(describeOption(overlap, tIn('ht'))).toContain('72%');
  });
  it('falls back to the kind alone', () => {
    expect(describeOption({ kind: 'private', label: { value: null } }, tIn('en'))).toBe('Private');
  });
  it('pluralizes the key-date countdown', () => {
    expect(translate('en', 'pathway.inDays.one', { n: 1 })).toBe('in 1 day');
    expect(translate('es', 'pathway.daysAgo.other', { n: 3 })).toBe('hace 3 días');
  });
});

describe('At a glance leaves out what is missing', () => {
  const f = (value) => ({ value, status: 'official', source: 's', as_of: '2026-10-17' });
  const gone = { value: null, status: 'not_available', source: 's', as_of: '2026-10-17', why: 'x', suggested_action: 'y' };
  const ctx = { t: tIn('en'), nf: String };
  it('shows only rows that have a value, and never "Not available"', () => {
    const school = { kind: 'public', state_grade: f('A'), gains_ela: gone, gains_math: gone, enrollment: f(600), tuition: f(0), aftercare: gone, is_magnet: gone, specialties: gone, ese: f(true), license: gone };
    const rows = glanceRows(school, ctx);
    expect(rows.map((r) => r.key)).toEqual(['state_grade', 'enrollment', 'tuition', 'ese']);
    expect(rows.every((r) => !/not available/i.test(r.text))).toBe(true);
  });
  it('drops a row whose value renders as nothing, such as care with no before or after flag', () => {
    const school = { kind: 'private', aftercare: f({ before_care: null, after_care: false, hours: null, cost: null, provider: null }), tuition: gone };
    expect(glanceRows(school, ctx)).toEqual([]);
  });
});
