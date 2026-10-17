// Tile provider for <Map> (src/lib/map.tsx). apg resolves `@/config/map` through the page's import map; in this
// template it is a plain module. With no URL configured <Map> shows its "unavailable" note and the list of its places.
export interface MapTiles {
  url: string
  attribution?: string
  maxZoom?: number
  subdomains?: string | string[]
}

const tiles: MapTiles = {
  url: import.meta.env.VITE_MAP_TILES_URL ?? "",
  attribution: import.meta.env.VITE_MAP_TILES_ATTRIBUTION ?? "",
  maxZoom: 19,
}

export default tiles
