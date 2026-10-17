import { describe, expect, it } from 'vitest';
import { BUDGET_OPTIONS, PRIORITY_LABEL_KEYS, PRIORITY_OPTIONS } from '../data/family';
import { messages } from '../i18n/messages';
import { childName, gradeLabelForAge } from '../utils/stages';

describe('gradeLabelForAge', () => {
  it('keeps the English labels identical', () => {
    expect([0, 1, 3, 4, 5, 7, 17, 18].map((a) => gradeLabelForAge(a, 'en'))).toEqual([
      'Infant care',
      'Toddler care',
      'Pre-K 3',
      'VPK (Pre-K 4)',
      'Kindergarten',
      'Grade 2',
      'Grade 12',
      'Past 12th grade',
    ]);
  });
  it('translates to Spanish and Haitian Creole', () => {
    expect(gradeLabelForAge(0, 'es')).toBe('Cuidado de bebés');
    expect(gradeLabelForAge(5, 'es')).toBe('Kínder');
    expect(gradeLabelForAge(7, 'es')).toBe('Grado 2');
    expect(gradeLabelForAge(0, 'ht')).toBe('Swen pou tibebe');
    expect(gradeLabelForAge(7, 'ht')).toBe('Klas 2');
    expect(gradeLabelForAge(4, 'es')).toContain('VPK');
  });
});

describe('childName', () => {
  it('uses the typed name, else "Child n" in the language', () => {
    expect(childName({ name: ' Lia ' }, 0, 'es')).toBe('Lia');
    expect(childName({}, 1, 'en')).toBe('Child 2');
    expect(childName({}, 1, 'es')).toBe('Niño 2');
    expect(childName({ name: '  ' }, 0, 'ht')).toBe('Timoun 1');
  });
});

describe('family options', () => {
  it('has a catalog entry for every budget and priority', () => {
    for (const b of BUDGET_OPTIONS)
      for (const l of ['en', 'es', 'ht']) expect(messages[l][b.labelKey]).toBeTruthy();
    for (const p of PRIORITY_OPTIONS)
      for (const l of ['en', 'es', 'ht']) expect(messages[l][PRIORITY_LABEL_KEYS[p]]).toBeTruthy();
  });
  it('keeps English display text equal to the value sent to the backend', () => {
    for (const p of PRIORITY_OPTIONS) expect(messages.en[PRIORITY_LABEL_KEYS[p]]).toBe(p);
  });
});
