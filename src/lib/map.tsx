import { useEffect, useState, type ComponentPropsWithoutRef } from "react"
import type * as ReactLeaflet from "react-leaflet"
import type * as Leaflet from "leaflet"
import { cn } from "@/lib/utils"
import { ClientOnly } from "@/lib/client-only"
import { useChrome } from "@/lib/i18n"
import type { MapTiles } from "@/config/map"

// A map of real places, drawn only in the browser (Leaflet touches `window` on
// load, so it is imported after mount and never on the server). Markers from the rows.
//   <Map center={[lat, lng]} zoom={5} markers={[{ lat, lng, label, href }]} ratio={16/9} />
// Until the map is mounted the same box shows a tinted ground, so layout never shifts.
//
// Tiles come from the environment's provider, not from this library: `@/config/map` exports
// { url, attribution, maxZoom, subdomains }. If tiles do not load (provider down, quota, a domain the
// provider does not allow), the box turns into a note and the list of its places: never a broken map.
export interface MapMarker {
  id?: string | number
  lat: number
  lng: number
  label?: string
  href?: string
}

export interface MapProps extends ComponentPropsWithoutRef<"div"> {
  center?: [number, number]
  zoom?: number
  markers?: MapMarker[]
  ratio?: number
  fit?: boolean
}

export function Map({ center, zoom = 4, markers = [], ratio = 16 / 9, className, fit = true, ...rest }: MapProps) {
  const c: [number, number] = center ?? (markers[0] ? [markers[0].lat, markers[0].lng] : [20, 0])
  const [failed, setFailed] = useState(false)
  if (failed) return <MapUnavailable markers={markers} className={className} {...rest} />
  return (
    <div data-slot="map" className={cn("relative isolate w-full overflow-hidden bg-surface-sunken", className)} style={{ aspectRatio: String(ratio) }} {...rest}>
      <ClientOnly fallback={<div className="absolute inset-0" aria-hidden="true" />}>
        {() => <LeafletMap center={c} zoom={zoom} markers={markers} fit={fit} onFail={() => setFailed(true)} />}
      </ClientOnly>
    </div>
  )
}

// A map that has loaded no tile this long after its first error is unavailable.
const GRACE_MS = 4000

function MapUnavailable({ markers, className, ...rest }: { markers: MapMarker[] } & ComponentPropsWithoutRef<"div">) {
  const chrome = useChrome()
  return (
    <div data-slot="map" data-map-unavailable="true" className={cn("w-full rounded-md border border-border bg-surface-sunken p-4 text-sm", className)} {...rest}>
      <p className="text-text-muted">{chrome("kit.map.unavailable")}</p>
      {markers.length ? (
        <ul className="mt-2 space-y-1">
          {markers.map((m, i) => <li key={m.id ?? i}>{m.href ? <a className="underline underline-offset-2" href={m.href}>{m.label ?? `${m.lat}, ${m.lng}`}</a> : (m.label ?? `${m.lat}, ${m.lng}`)}</li>)}
        </ul>
      ) : null}
    </div>
  )
}

interface LoadedLeaflet {
  rl: typeof ReactLeaflet
  L: typeof Leaflet
  tiles: MapTiles
}

interface LeafletMapProps {
  center: [number, number]
  zoom: number
  markers: MapMarker[]
  fit: boolean
  onFail: () => void
}

function LeafletMap({ center, zoom, markers, fit, onFail }: LeafletMapProps) {
  const [mod, setMod] = useState<LoadedLeaflet | null>(null)
  useEffect(() => {
    let live = true
    Promise.all([
      import("react-leaflet"),
      import("leaflet"),
      // No provider in the library: without the environment's config there is no map, only the note.
      import("@/config/map").then((m) => {
        const t: MapTiles | undefined = m.default ?? (m as unknown as MapTiles)
        if (!t?.url) throw new Error("no tile provider configured")
        return t
      }),
    ]).then(
      ([rl, L, tiles]) => { if (live) setMod({ rl, L: (L as unknown as { default?: typeof Leaflet }).default ?? L, tiles }) },
      () => { if (live) onFail() },
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apg loads once on mount
  }, [])
  if (!mod) return null
  const { MapContainer, TileLayer, Marker, Popup } = mod.rl
  const { tiles } = mod
  const icon = mod.L.divIcon({ className: "", html: '<span style="display:block;width:14px;height:14px;border-radius:50%;background:var(--color-primary);border:2px solid var(--color-background);box-shadow:0 1px 3px rgba(0,0,0,.35)"></span>', iconSize: [14, 14], iconAnchor: [7, 7] })
  const bounds: [number, number][] | undefined = fit && markers.length > 1 ? markers.map((m): [number, number] => [m.lat, m.lng]) : undefined
  return (
    <MapContainer center={center} zoom={zoom} bounds={bounds} scrollWheelZoom={false} style={{ position: "absolute", inset: 0 }}>
      <TileLayer attribution={tiles.attribution} url={tiles.url} maxZoom={tiles.maxZoom ?? 19} {...(tiles.subdomains ? { subdomains: tiles.subdomains } : {})} eventHandlers={tileWatch(onFail)} />
      {markers.map((m, i) => (
        <Marker key={m.id ?? i} position={[m.lat, m.lng]} icon={icon}>
          {m.label ? <Popup>{m.href ? <a href={m.href}>{m.label}</a> : m.label}</Popup> : null}
        </Marker>
      ))}
    </MapContainer>
  )
}

// Tile errors with no tile loaded within the grace period mean the provider is not serving this page.
function tileWatch(onFail: () => void): { tileload: () => void; tileerror: () => void } {
  let loaded = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    tileload: () => { loaded++ },
    tileerror: () => {
      if (loaded || timer) return
      timer = setTimeout(() => { if (!loaded) onFail() }, GRACE_MS)
    },
  }
}
