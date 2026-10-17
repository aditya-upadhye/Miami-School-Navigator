// Options for the onboarding form. Only choices the backend can act on are offered: it has no price list for private schools or
// child care, and no data on class size, sports, aftercare or walking routes, so those are not offered as priorities.

/** Budget choices. Only "free" changes the search; the rest of the market has no public prices. */
export const BUDGET_OPTIONS = [
  { id: 'free', labelKey: 'onboarding.budget.free' },
  { id: 'any', labelKey: 'onboarding.budget.any' },
];

/** What families can prioritize. These match the program keywords and verified magnet themes the backend can score. */
export const PRIORITY_OPTIONS = ['STEM', 'Arts', 'Bilingual / dual language', 'IB', 'Montessori'];

/** Catalog key for each priority's displayed text. The English strings above stay the values sent to the backend. */
export const PRIORITY_LABEL_KEYS = {
  STEM: 'onboarding.priority.STEM',
  Arts: 'onboarding.priority.Arts',
  'Bilingual / dual language': 'onboarding.priority.Bilingual',
  IB: 'onboarding.priority.IB',
  Montessori: 'onboarding.priority.Montessori',
};

/** What a family can say matters most when schools are ranked. Each one counts extra in the match score (backend `values`); none of them
 *  filters anything, and the family's travel limit is always respected. */
export const VALUE_OPTIONS = ['academics', 'programs', 'popularity', 'proximity'];
export const VALUE_LABEL_KEYS = {
  academics: 'values.academics',
  programs: 'values.programs',
  popularity: 'values.popularity',
  proximity: 'values.proximity',
};
