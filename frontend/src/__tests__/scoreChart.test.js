import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ScoreChart from '../components/ScoreChart';
import { translate } from '../i18n/messages';

vi.mock('../i18n', () => ({ useI18n: () => ({ t: (k, v) => translate('en', k, v) }) }));

const factor = (factor, points, max_points) => ({ factor, points, max_points, detail: 'd' });
const series = [
  { name: 'A School', match_score: 75, breakdown: [factor('state_grade', 20, 20), factor('distance', 7.5, 15)] },
  { name: 'B School', match_score: 55, breakdown: [factor('state_grade', 15, 20), factor('distance', 15, 15)] },
];

describe('ScoreChart', () => {
  it('draws one donut per school with a coloured slice and a number for each factor', () => {
    const html = renderToStaticMarkup(createElement(ScoreChart, { title: 'T', series }));
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html).toContain('20/20');
    expect(html).toContain('7.5/15');
    expect(html).toContain('A School: 75/100'); // the centre number counts up after mount, the label is exact
    expect(html).toContain('var(--f1)');
    expect(html).toContain('var(--f3)');
  });
  it('has a label for every factor and the centre caption in every language', () => {
    for (const lang of ['en', 'es', 'ht'])
      for (const k of ['factor.state_grade', 'factor.zoned', 'factor.distance', 'factor.priorities', 'factor.popularity', 'factor.scholarship', 'factor.total', 'chart.outOf'])
        expect(translate(lang, `shared.${k}`)).not.toBe(`shared.${k}`);
  });
});
