import { describe, expect, it } from 'vitest';
import { translate } from '../i18n/messages';
import { describe as describeOption } from '../pages/Pathway/usePathway';
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
