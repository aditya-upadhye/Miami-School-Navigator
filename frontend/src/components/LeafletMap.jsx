import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useI18n } from '../i18n';
import {
  homeHtml,
  METERS_PER_MILE,
  milesToMeters,
  pinHtml,
  TILE_ATTRIBUTION,
  TILE_URL,
  ZONE_STYLE,
} from '../utils/mapStyle';

/**
 * Real map (Leaflet + OpenStreetMap tiles): the family's home, a travel-distance ring, numbered school pins, and attendance-zone
 * polygons. Imperative under the hood; React props drive it. Exposes zoomIn/zoomOut/recenter through a ref.
 *
 * props: home {lat, lon}, radiusMi, pins [{id, rank, lat, lon, bg, fg, shadow, aria, active}], pinsKey (changes when pins change),
 *        fitKey (changes when the view should be re-framed: new location, radius or result set; not on selection),
 *        zones (GeoJSON FeatureCollection | null), zoneLevels (levels to draw), onPick(id), onTilesFailed(bool)
 */
const LeafletMap = forwardRef(function LeafletMap(
  { home, radiusMi, pins, pinsKey, fitKey, zones, zoneLevels, onPick, onTilesFailed },
  ref,
) {
  const { t, lang } = useI18n();
  const el = useRef(null);
  const map = useRef(null);
  const layers = useRef({});
  const latest = useRef({});
  latest.current = {
    pins,
    onPick,
    onTilesFailed,
    home,
    radiusMi,
    homeLabel: t('explore.map.homeLabel'),
    homeTitle: t('explore.map.homeTitle'),
  };

  // ---- create / destroy ----
  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, minZoom: 8, maxZoom: 19, keyboard: true });
    map.current = m;
    m.createPane('zones').style.zIndex = 380; // under the ring (400) and pins (600)
    const tiles = L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(m);
    let failed = false;
    tiles.on('tileerror', () => {
      if (!failed) {
        failed = true;
        latest.current.onTilesFailed?.(true);
      }
    });
    tiles.on('tileload', () => {
      if (failed) {
        failed = false;
        latest.current.onTilesFailed?.(false);
      }
    });
    layers.current = { zones: L.layerGroup().addTo(m), pins: L.layerGroup().addTo(m) };
    m.setView([latest.current.home.lat, latest.current.home.lon], 13);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      layers.current = {};
    };
  }, []);

  // ---- home, ring, and framing ----
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const L_ = layers.current;
    L_.ring?.remove();
    L_.home?.remove();
    const center = [home.lat, home.lon];
    L_.ring = L.circle(center, {
      radius: milesToMeters(radiusMi),
      color: '#7C5CE0',
      weight: 2,
      dashArray: '7 7',
      fillColor: '#7C5CE0',
      fillOpacity: 0.07,
      interactive: false,
    }).addTo(m);
    L_.home = L.marker(center, {
      icon: L.divIcon({
        className: 'sn-home-icon',
        html: homeHtml(latest.current.homeLabel),
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
      title: latest.current.homeTitle,
      keyboard: false,
      zIndexOffset: 500,
    }).addTo(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home.lat, home.lon, radiusMi, lang]);

  // ---- framing: the home plus the schools actually shown (at least ~1 mile across), or the whole radius when there are none ----
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const { pins: ps, home: h, radiusMi: r } = latest.current;
    const center = L.latLng(h.lat, h.lon);
    const bounds = ps.length
      ? L.latLngBounds([center, ...ps.map((p) => L.latLng(p.lat, p.lon))]).extend(
          center.toBounds(METERS_PER_MILE),
        )
      : center.toBounds(2 * milesToMeters(r));
    m.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
  }, [fitKey]);

  // ---- school pins ----
  useEffect(() => {
    const group = layers.current.pins;
    if (!group) return;
    group.clearLayers();
    latest.current.pins.forEach((p) => {
      const size = p.active ? 44 : 36;
      const marker = L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          className: 'sn-pin',
          html: pinHtml(p),
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        title: p.aria,
        alt: p.aria,
        keyboard: true,
        riseOnHover: true,
        zIndexOffset: p.active ? 1000 : 0,
      })
        .on('click', () => latest.current.onPick?.(p.id))
        .addTo(group);
      marker.getElement()?.setAttribute('aria-label', p.aria); // Leaflet only sets a hover title; screen readers need a label
    });
  }, [pinsKey]);

  // ---- attendance zones ----
  useEffect(() => {
    const group = layers.current.zones;
    if (!group) return;
    group.clearLayers();
    (zones?.features ?? [])
      .filter((f) => zoneLevels.includes(f.properties.level))
      .forEach((f) => {
        const st = ZONE_STYLE[f.properties.level];
        L.geoJSON(f, {
          pane: 'zones',
          style: { color: st.color, weight: 2.5, fillColor: st.color, fillOpacity: 0.13 },
        })
          .bindTooltip(
            t('explore.zone.label', {
              level: t(st.labelKey),
              school: f.properties.school_name ?? t('explore.zone.school'),
            }),
            { sticky: true },
          )
          .addTo(group);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, zoneLevels, lang]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => map.current?.zoomIn(),
    zoomOut: () => map.current?.zoomOut(),
    recenter: () => {
      const { home: h, radiusMi: r } = latest.current;
      // latLng.toBounds takes the full width in meters; a circle's own getBounds only works once it is on the map.
      map.current?.fitBounds(L.latLng(h.lat, h.lon).toBounds(2 * milesToMeters(r)), { padding: [28, 28] });
    },
  }));

  return <div ref={el} className="sn-leaflet" role="application" aria-label={t('explore.map.interactive')} />;
});

export default LeafletMap;
