import { GLYPHS_URL, METERS_PER_MILE, TILE_ATTRIBUTION, VECTOR_TILES_URL, ZONE_STYLE } from './mapStyle';

// Pure helpers for the 3D map: the vector style (one palette per theme, matching the app's violet look) and the GeoJSON
// the map draws on top of it (travel ring, attendance zones, a light beam under every school pin).

export const BASE = 'omt';
export const HOME_VIEW = { pitch: 58, bearing: -20 };
// The whole county, shown until the family enters where they live.
export const COUNTY_CENTER = { lat: 25.7617, lon: -80.1918 };
export const COUNTY_ZOOM = 9.6;

const PALETTE = {
  dark: {
    land: '#16132e', park: '#1c2748', water: '#0b0920', waterLine: '#2b2263',
    roadMinor: '#2a2556', roadMajor: '#3d3578', roadHighway: '#7a63d9',
    bldgLow: '#2b2560', bldgMid: '#473b96', bldgHigh: '#9b7df0',
    label: '#d3ccf7', halo: '#100d24', water_label: '#6f64b8',
    skyTop: '#07061a', skyHorizon: '#3b2b80', fog: '#16132e',
    lightColor: '#b9a8ff', lightIntensity: 0.55,
    ring: '#c9bbff', beam: '#b79cff', beamActive: '#ffffff',
  },
  light: {
    land: '#f1edfa', park: '#d9ece1', water: '#c3d6f4', waterLine: '#a9c3ea',
    roadMinor: '#ffffff', roadMajor: '#ffffff', roadHighway: '#f3d28a',
    bldgLow: '#e5e0f3', bldgMid: '#d0c8ec', bldgHigh: '#b4a6e2',
    label: '#47426b', halo: '#ffffff', water_label: '#6a8bbd',
    skyTop: '#a9c3f0', skyHorizon: '#f1edfa', fog: '#f1edfa',
    lightColor: '#fff3df', lightIntensity: 0.5,
    ring: '#6b54c9', beam: '#6b54c9', beamActive: '#1b1830',
  },
};
const COMPARE_GOLD = '#F6C343';

export const EMPTY = { type: 'FeatureCollection', features: [] };

/** A closed polygon ring approximating a circle of `meters` around [lon, lat] (flat-earth, fine for a few miles). */
export function circleRing(lon, lat, meters, steps = 64) {
  const dLat = meters / 111320;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const pts = Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return [lon + Math.cos(a) * dLon, lat + Math.sin(a) * dLat];
  });
  return [...pts, pts[0]];
}

export const ringFeature = (home, radiusMi) =>
  home
    ? {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [circleRing(home.lon, home.lat, radiusMi * METERS_PER_MILE, 96)] },
          },
        ],
      }
    : EMPTY; // no address yet: no travel ring

/** Zone polygons for the levels switched on. */
export const zoneFeatures = (zones, levels) => ({
  type: 'FeatureCollection',
  features: (zones?.features ?? []).filter((f) => levels.includes(f.properties?.level)),
});

/** Beam height in metres: the best match is the tallest, the selected school stands out. */
export const beamHeight = (rank, active) => (active ? 900 : 700 - Math.min(rank - 1, 9) * 45);

export function beamFeatures(pins, dark) {
  const pal = dark ? PALETTE.dark : PALETTE.light;
  return {
    type: 'FeatureCollection',
    features: pins.map((p) => ({
      type: 'Feature',
      properties: {
        id: p.id,
        height: beamHeight(p.rank, p.active),
        color: p.active ? pal.beamActive : p.inCmp ? COMPARE_GOLD : pal.beam,
      },
      geometry: { type: 'Polygon', coordinates: [circleRing(p.lon, p.lat, p.active ? 30 : 24, 12)] },
    })),
  };
}

const ZONE_COLOR = ['match', ['get', 'level'], ...Object.entries(ZONE_STYLE).flatMap(([k, v]) => [k, v.color]), '#7C5CE0'];
// Zone slabs and beams are tall when you see the whole area and shrink as you zoom in, so up close they stay markers, not towers.
const zoneHeight = (k) => ['match', ['get', 'level'], 'elementary', 18 * k, 'middle', 36 * k, 'high', 54 * k, 18 * k];
const ZONE_HEIGHT = ['interpolate', ['linear'], ['zoom'], 11, zoneHeight(1), 14, zoneHeight(0.12)];
const BEAM_HEIGHT = ['interpolate', ['linear'], ['zoom'], 11, ['get', 'height'], 14, ['*', ['get', 'height'], 0.3], 16, ['*', ['get', 'height'], 0.08]];

const road = (id, classes, color, w, minzoom) => ({
  id, type: 'line', source: BASE, 'source-layer': 'transportation', minzoom,
  filter: ['in', ['get', 'class'], ['literal', classes]],
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': color, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, w[0], 14, w[1], 18, w[2]] },
});

/** The whole MapLibre style for a theme. `data` carries the GeoJSON the map starts with: { ring, zones, beams }. */
export function buildStyle(dark, data) {
  const p = dark ? PALETTE.dark : PALETTE.light;
  const font = { 'text-font': ['Noto Sans Regular'], 'text-max-width': 8 };
  const name = ['coalesce', ['get', 'name:latin'], ['get', 'name']];
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      [BASE]: { type: 'vector', url: VECTOR_TILES_URL, attribution: TILE_ATTRIBUTION },
      ring: { type: 'geojson', data: data.ring ?? EMPTY },
      zones: { type: 'geojson', data: data.zones ?? EMPTY },
      beams: { type: 'geojson', data: data.beams ?? EMPTY },
    },
    light: { anchor: 'viewport', color: p.lightColor, intensity: p.lightIntensity, position: [1.4, 210, 45] },
    sky: {
      'sky-color': p.skyTop, 'horizon-color': p.skyHorizon, 'fog-color': p.fog,
      'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.8, 'fog-ground-blend': 0.35,
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': p.land } },
      { id: 'park', type: 'fill', source: BASE, 'source-layer': 'park', paint: { 'fill-color': p.park, 'fill-opacity': 0.9 } },
      {
        id: 'landcover', type: 'fill', source: BASE, 'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass', 'wetland']]],
        paint: { 'fill-color': p.park, 'fill-opacity': 0.55 },
      },
      { id: 'water', type: 'fill', source: BASE, 'source-layer': 'water', paint: { 'fill-color': p.water } },
      { id: 'waterway', type: 'line', source: BASE, 'source-layer': 'waterway', paint: { 'line-color': p.waterLine, 'line-width': 1.2 } },
      road('road-minor', ['minor', 'service', 'track'], p.roadMinor, [0.2, 0.8, 5], 12),
      road('road-major', ['tertiary', 'secondary', 'primary', 'trunk'], p.roadMajor, [0.5, 1.8, 9], 9),
      road('road-highway', ['motorway'], p.roadHighway, [0.8, 2.6, 11], 7),
      { id: 'ring-fill', type: 'fill', source: 'ring', paint: { 'fill-color': p.ring, 'fill-opacity': dark ? 0.07 : 0.06 } },
      { id: 'ring-line', type: 'line', source: 'ring', paint: { 'line-color': p.ring, 'line-width': 2, 'line-dasharray': [2, 2] } },
      {
        id: 'zones-fill', type: 'fill-extrusion', source: 'zones',
        paint: { 'fill-extrusion-color': ZONE_COLOR, 'fill-extrusion-height': ZONE_HEIGHT, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': dark ? 0.32 : 0.26 },
      },
      { id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': ZONE_COLOR, 'line-width': 2.5, 'line-opacity': 0.95 } },
      {
        id: 'buildings', type: 'fill-extrusion', source: BASE, 'source-layer': 'building', minzoom: 12,
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, p.bldgLow, 60, p.bldgMid, 220, p.bldgHigh],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13.5, 0.9],
        },
      },
      {
        id: 'beams', type: 'fill-extrusion', source: 'beams',
        paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': BEAM_HEIGHT, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.75 },
      },
      {
        id: 'water-label', type: 'symbol', source: BASE, 'source-layer': 'water_name', minzoom: 8,
        layout: { ...font, 'text-field': name, 'text-size': 12, 'text-letter-spacing': 0.2 },
        paint: { 'text-color': p.water_label, 'text-halo-color': p.halo, 'text-halo-width': 1 },
      },
      {
        id: 'place-label', type: 'symbol', source: BASE, 'source-layer': 'place', minzoom: 8,
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'suburb', 'neighbourhood', 'village']]],
        layout: {
          ...font, 'text-field': name, 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 14],
          'text-transform': 'uppercase', 'text-letter-spacing': 0.12,
        },
        paint: { 'text-color': p.label, 'text-halo-color': p.halo, 'text-halo-width': 1.4, 'text-opacity': 0.8 },
      },
    ],
  };
}
