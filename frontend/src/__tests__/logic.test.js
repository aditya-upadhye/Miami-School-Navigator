import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api/client';
import { isMissing, miles, nextStep, provenance, stateGrade, text, tuition, zonedLevel } from '../api/fields';
import { tidyAddress } from '../profile/ProfileProvider';
import { METERS_PER_MILE, milesToMeters, pinHtml, ZONE_LEVELS, ZONE_STYLE } from '../utils/mapStyle';
import { gradeLabelForAge, stageForAge } from '../utils/stages';

const missing = {
  value: null,
  status: 'not_available',
  source: 'x',
  as_of: '2026-10-16',
  why: 'No dataset.',
  suggested_action: 'Ask the school.',
};
const official = (value) => ({
  value,
  status: 'official',
  source: 'County GIS',
  as_of: '2026-10-16',
  method: 'as published',
});

describe('field helpers never invent values', () => {
  it('treats not_available and null as missing', () => {
    expect(isMissing(missing)).toBe(true);
    expect(isMissing(official(0))).toBe(false); // 0 is a real value (free tuition)
    expect(isMissing(undefined)).toBe(true);
  });
  it('formats tuition honestly', () => {
    expect(tuition(missing)).toBe('Ask the school');
    expect(tuition(official(0))).toBe('Free');
    expect(tuition(official(12500))).toBe('$12,500 / yr');
  });
  it('shows a missing state grade as missing, not as a letter', () => {
    expect(stateGrade(missing)).toBe('No state grade yet');
    expect(stateGrade(official('B'))).toBe('State grade B');
  });
  it('formats other values and next steps', () => {
    expect(miles(official(0.26))).toBe('0.26 mi');
    expect(text(missing)).toBe('Not available');
    expect(text(official(['elementary', 'pre_k']))).toBe('Elementary, Pre-K');
    expect(nextStep(missing)).toBe('No dataset. Ask the school.');
    expect(nextStep(official(1))).toBe('');
    expect(provenance(official(1))).toContain('County GIS');
  });
  it('reads zoning', () => {
    expect(zonedLevel(official({ zoned: true, level: 'elementary' }))).toBe('elementary');
    expect(zonedLevel(official({ zoned: false, level: null }))).toBe(null);
    expect(zonedLevel(undefined)).toBe(null);
  });
});

describe('stages match the backend', () => {
  it.each([
    [0, 'infant_toddler'],
    [3, 'pre_k'],
    [4, 'pre_k'],
    [5, 'elementary'],
    [10, 'elementary'],
    [11, 'middle'],
    [14, 'high'],
    [18, null],
  ])('age %i -> %s', (age, stage) => {
    expect(stageForAge(age)).toBe(stage);
  });
  it('labels grades', () => {
    expect(gradeLabelForAge(7)).toBe('Grade 2');
    expect(gradeLabelForAge(4)).toBe('VPK (Pre-K 4)');
  });
});

describe('map helpers', () => {
  it('converts the travel-distance radius to meters for the map ring', () => {
    expect(milesToMeters(1)).toBeCloseTo(METERS_PER_MILE, 6);
    expect(milesToMeters(3)).toBeCloseTo(4828.032, 3);
  });
  it('has a colour and label for every attendance-zone level', () => {
    for (const l of ZONE_LEVELS) expect(ZONE_STYLE[l].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(ZONE_LEVELS).toEqual(['elementary', 'middle', 'high']);
  });
  it('builds a numbered pin and escapes anything unsafe', () => {
    const html = pinHtml({ rank: 2, bg: 'var(--accent-grad)', fg: '#fff', shadow: 'none', active: true });
    expect(html).toContain('>2</span>');
    expect(html).toContain('active');
    expect(pinHtml({ rank: '<img onerror=x>', bg: '"><script>', fg: '#fff', shadow: 'none' })).not.toMatch(
      /<img|<script/,
    );
  });
});

describe('addresses', () => {
  it('title-cases shouting county addresses but keeps directions and state', () => {
    expect(tidyAddress('2250 NW 2ND AVE, MIAMI, FL, 33127')).toBe('2250 NW 2nd Ave, Miami, FL, 33127');
    expect(tidyAddress('1 Lincoln Rd, Miami Beach')).toBe('1 Lincoln Rd, Miami Beach'); // already readable
  });
});

describe('api client', () => {
  afterEach(() => vi.restoreAllMocks());
  const ok = (data) => ({ ok: true, status: 200, json: async () => data });

  it('builds query strings: csv arrays, skips empty and false', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ results: [] }));
    await api.schools({
      lat: 25.8,
      lon: -80.2,
      stage: ['pre_k', 'elementary'],
      free_only: true,
      ese: false,
      specialties: [],
      q: '',
    });
    const url = f.mock.calls[0][0];
    expect(url).toBe('/api/schools?lat=25.8&lon=-80.2&stage=pre_k%2Celementary&free_only=true');
  });
  it('posts JSON', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({}));
    await api.compare({ ids: ['a'] });
    expect(f.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"ids":["a"]}' });
  });
  it('turns backend errors into ApiError with a next step', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: { code: 'geocode_not_found', message: 'Nope.', suggested_action: 'Try a ZIP.' },
      }),
    });
    await expect(api.geocode('x')).rejects.toMatchObject({
      code: 'geocode_not_found',
      status: 404,
      suggestedAction: 'Try a ZIP.',
    });
  });
  it('reports an unreachable service plainly', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('failed'));
    const err = await api.dates().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toMatch(/Cannot reach/);
  });
  it('lets aborted requests through untouched', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    );
    await expect(api.dates()).rejects.toMatchObject({ name: 'AbortError' });
  });
});

import { buildIcs, escapeText, fold } from '../utils/ics';
import { verificationInfo } from '../api/fields';
import { ageFromBirth } from '../utils/stages';

describe('calendar (.ics) export', () => {
  const NOW = new Date('2026-10-16T12:00:00Z');
  const ev = {
    uid: 'magnet_closes',
    date: '2027-01-15',
    summary: 'Magnet applications close (2027-28)',
    description: 'From a single source; confirm, with the district',
    alarmDays: 7,
  };

  it('builds a valid all-day event with a reminder and CRLF line endings', () => {
    const ics = buildIcs([ev], { now: NOW });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20270115\r\nDTEND;VALUE=DATE:20270116');
    expect(ics).toContain('DTSTAMP:20261016T120000Z');
    expect(ics).toContain('UID:magnet_closes@school-navigator');
    expect(ics).toContain('TRIGGER:-P7D');
    expect(ics.replace(/\r\n/g, '').includes('\n')).toBe(false);
  });
  it('rolls the end date over month and year boundaries', () => {
    expect(buildIcs([{ ...ev, date: '2026-12-31' }], { now: NOW })).toContain('DTEND;VALUE=DATE:20270101');
    expect(buildIcs([{ ...ev, date: '2028-02-28' }], { now: NOW })).toContain('DTEND;VALUE=DATE:20280229'); // leap year
  });
  it('escapes commas, semicolons, backslashes and newlines', () => {
    expect(escapeText('a, b; c\\d\ne')).toBe('a\\, b\; c\\\\d\\ne');
    expect(buildIcs([ev], { now: NOW })).toContain('confirm\\, with the district');
  });
  it('folds long lines at 75 octets without splitting characters', () => {
    const long = 'DESCRIPTION:' + 'é'.repeat(80);
    const parts = fold(long).split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(long); // unfolding restores it exactly
  });
  it('skips events without a valid date', () => {
    const ics = buildIcs(
      [
        { ...ev, date: 'soon' },
        { ...ev, date: undefined },
      ],
      { now: NOW },
    );
    expect(ics).not.toContain('BEGIN:VEVENT');
    expect(ics).not.toMatch(/undefined|null/);
  });
});

describe('verification labels', () => {
  it('maps each level and returns null for non-rule fields', () => {
    expect(verificationInfo("Curated rule 'x'; verification: unconfirmed_project_spec")).toMatchObject({
      key: 'unconfirmed_project_spec',
      label: 'Not confirmed',
    });
    expect(
      verificationInfo({ method: "Curated rule 'y'; verification: confirmed_district_source" }).label,
    ).toBe('Confirmed');
    expect(verificationInfo({ method: "Curated rule 'k'; verification: other_district_policies" }).tone).toBe(
      'warn',
    );
    expect(verificationInfo({ method: 'County attribute as published' })).toBe(null);
    expect(verificationInfo(undefined)).toBe(null);
  });
});

describe('ageFromBirth', () => {
  const today = new Date(2026, 9, 16); // Oct 16, 2026
  it('counts whole years and handles the birthday', () => {
    expect(ageFromBirth('2019-10-16', today)).toBe(7);
    expect(ageFromBirth('2019-10-17', today)).toBe(6);
    expect(ageFromBirth('2023-09-01', today)).toBe(3);
  });
  it('rejects blanks, junk, impossible dates and the future', () => {
    for (const bad of ['', null, undefined, 'abc', '2019-13-01', '2019-02-30', '2027-01-01'])
      expect(ageFromBirth(bad, today)).toBe(null);
  });
});
