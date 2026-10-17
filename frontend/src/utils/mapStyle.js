// Map configuration. The 3D map draws free OpenFreeMap vector tiles (OpenStreetMap data, no key, no Google). Their public server is meant
// for light use: for real traffic point VITE_MAP_TILES_URL at a hosted TileJSON in the OpenMapTiles schema (see .env.example).
export const VECTOR_TILES_URL = import.meta.env.VITE_MAP_TILES_URL || 'https://tiles.openfreemap.org/planet';
export const GLYPHS_URL =
  import.meta.env.VITE_MAP_GLYPHS_URL || 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION ||
  '<a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';

export const METERS_PER_MILE = 1609.344;
export const milesToMeters = (mi) => mi * METERS_PER_MILE;

// Attendance-zone colours by level; `labelKey` is the i18n key of the zone's name. Fill is light so streets stay readable; the outline carries the colour.
export const ZONE_LEVELS = ['elementary', 'middle', 'high'];
export const ZONE_STYLE = {
  elementary: { labelKey: 'explore.zone.elementary', color: '#7C5CE0' },
  middle: { labelKey: 'explore.zone.middle', color: '#0E9F9D' },
  high: { labelKey: 'explore.zone.high', color: '#D9790F' },
};

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** HTML for a numbered school pin. All values are escaped; colours may be CSS variables like var(--accent-grad). */
export function pinHtml({ rank, bg, fg, shadow, active }) {
  return `<span class="sn-pin-dot${active ? ' active' : ''}" style="background:${esc(bg)};color:${esc(fg)};box-shadow:${esc(shadow)}">${esc(rank)}</span>`;
}

/** HTML for the family's home marker. `label` is already translated text (it is escaped here). */
export const homeHtml = (label) =>
  `<span class="sn-home"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/></svg><span class="sn-home-label">${esc(label)}</span></span>`;
