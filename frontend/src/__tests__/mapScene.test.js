import { describe, expect, it } from 'vitest';
import { METERS_PER_MILE } from '../utils/mapStyle';
import { beamFeatures, beamHeight, buildStyle, circleRing, ringFeature, zoneFeatures } from '../utils/mapScene';

const home = { lat: 25.7617, lon: -80.1918 };
const pin = (id, rank, extra = {}) => ({ id, rank, lat: 25.77, lon: -80.2, active: false, inCmp: false, ...extra });

describe('3D map scene', () => {
  it('draws a closed ring of the right size around a point', () => {
    const ring = circleRing(home.lon, home.lat, METERS_PER_MILE, 64);
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring[64]);
    const north = Math.max(...ring.map(([, lat]) => lat));
    expect((north - home.lat) * 111320).toBeCloseTo(METERS_PER_MILE, -1); // within ~5 m of one mile
  });

  it('turns the travel radius into a one-polygon collection', () => {
    const fc = ringFeature(home, 3);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.type).toBe('Polygon');
  });

  it('draws no travel ring until the family has an address', () => {
    expect(ringFeature(null, 3).features).toEqual([]);
  });

  it('keeps only the zone levels that are switched on', () => {
    const zones = { features: ['elementary', 'middle', 'high'].map((level) => ({ type: 'Feature', properties: { level } })) };
    expect(zoneFeatures(zones, ['middle']).features.map((f) => f.properties.level)).toEqual(['middle']);
    expect(zoneFeatures(null, ['high']).features).toEqual([]);
  });

  it('stands the best match tallest and gives the selected school its own colour', () => {
    expect(beamHeight(1, false)).toBeGreaterThan(beamHeight(5, false));
    expect(beamHeight(50, false)).toBeGreaterThan(0);
    expect(beamHeight(9, true)).toBeGreaterThan(beamHeight(1, false));
    const f = beamFeatures([pin('a', 1), pin('b', 2, { active: true }), pin('c', 3, { inCmp: true })], true).features;
    expect(new Set(f.map((x) => x.properties.color)).size).toBe(3);
    expect(f[0].geometry.coordinates[0]).toHaveLength(13);
  });

  it('builds a style whose layers all point at a defined source, in both themes', () => {
    for (const dark of [true, false]) {
      const style = buildStyle(dark, {});
      const ids = style.layers.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const l of style.layers) if (l.source) expect(style.sources).toHaveProperty(l.source);
      expect(ids).toEqual(expect.arrayContaining(['buildings', 'beams', 'zones-fill', 'ring-line']));
      expect(style.layers[0].paint['background-color']).not.toBe(buildStyle(!dark, {}).layers[0].paint['background-color']);
    }
  });
});
