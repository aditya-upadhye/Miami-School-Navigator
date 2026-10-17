// maplibre-gl 6 finds its worker with a URL built at runtime, which a bundler cannot see; building the worker ourselves and handing the URL over
// works the same in dev and in the production build.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { METERS_PER_MILE, milesToMeters, pinHtml } from '../utils/mapStyle';
import {
  BASE,
  beamFeatures,
  buildStyle,
  COUNTY_CENTER,
  COUNTY_ZOOM,
  HOME_VIEW,
  ringFeature,
  zoneFeatures,
} from '../utils/mapScene';

const TILE_GRACE_MS = 6000;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ms = (n) => (reducedMotion() ? 0 : n);

/**
 * 3D map (MapLibre GL over free OpenFreeMap vector tiles): tilted camera, extruded buildings, the family's home, a travel-distance ring,
 * numbered school pins standing on light beams, and attendance zones raised in tiers. Imperative under the hood; React props drive it.
 * Exposes zoomIn / zoomOut / recenter / toggleTilt / toggleOrbit / resetNorth through a ref.
 *
 * props: home {lat, lon} | null (until an address is entered: the whole county, no marker or ring), radiusMi, pins [{id, rank, lat, lon, bg, fg, shadow, aria, active, inCmp}], pinsKey (changes when pins change),
 *        fitKey (changes when the view should be re-framed: new location, radius or result set; not on selection),
 *        zones (GeoJSON FeatureCollection | null), zoneLevels (levels to draw), onPick(id), onTilesFailed(bool),
 *        onView({ bearing, tilted, orbiting }) (camera state, for the controls)
 */
const Map3D = forwardRef(function Map3D(
  { home, radiusMi, pins, pinsKey, fitKey, zones, zoneLevels, onPick, onTilesFailed, onView },
  ref,
) {
  const { t, lang } = useI18n();
  const { dark } = useTheme();
  const el = useRef(null);
  const tip = useRef(null);
  const map = useRef(null);
  const lib = useRef(null);
  const markers = useRef([]);
  const homeMarker = useRef(null);
  const orbit = useRef(false);
  const [ready, setReady] = useState(false);
  const [noGl, setNoGl] = useState(false);

  const latest = useRef({});
  latest.current = { home, radiusMi, pins, zones, zoneLevels, onPick, onTilesFailed, onView, dark, t };
  const data = () => {
    const c = latest.current;
    return { ring: ringFeature(c.home, c.radiusMi), zones: zoneFeatures(c.zones, c.zoneLevels), beams: beamFeatures(c.pins, c.dark) };
  };
  const emitView = () => {
    const m = map.current;
    if (m) latest.current.onView?.({ bearing: m.getBearing(), tilted: m.getPitch() > 10, orbiting: orbit.current });
  };
  const setOrbit = (on) => {
    orbit.current = on;
    emitView();
  };

  // ---- create / destroy ----
  useEffect(() => {
    let disposed = false;
    let m = null;
    let timer;
    let tilesLoaded = false;
    (async () => {
      let maplibre;
      try {
        const [mod] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]);
        maplibre = mod.Map ? mod : mod.default; // named exports in v5+, a default object in older builds
        maplibre.setWorkerUrl(workerUrl);
        if (disposed || !el.current) return;
        const c = latest.current;
        m = new maplibre.Map({
          container: el.current,
          style: buildStyle(c.dark, data()),
          center: [(c.home ?? COUNTY_CENTER).lon, (c.home ?? COUNTY_CENTER).lat],
          zoom: c.home ? 12 : COUNTY_ZOOM,
          ...HOME_VIEW,
          minZoom: 8,
          maxZoom: 19,
          maxPitch: 75,
          attributionControl: false,
          canvasContextAttributes: { antialias: true },
        });
      } catch (err) {
        console.warn('3D map unavailable:', err);
        if (!disposed) {
          setNoGl(true); // no WebGL (or the library failed to load): say so, the pins list below the map still works
          latest.current.onTilesFailed?.(true);
        }
        return;
      }
      lib.current = maplibre;
      map.current = m;
      m.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-right');

      m.on('sourcedata', (e) => {
        if (e.sourceId !== BASE || !e.isSourceLoaded) return;
        tilesLoaded = true;
        clearTimeout(timer);
        timer = undefined;
        latest.current.onTilesFailed?.(false);
      });
      m.on('error', (e) => {
        if (e.sourceId !== BASE || tilesLoaded || timer) return;
        timer = setTimeout(() => {
          if (!tilesLoaded) latest.current.onTilesFailed?.(true);
        }, TILE_GRACE_MS);
      });
      m.once('load', () => !disposed && setReady(true));
      m.on('rotate', emitView);
      m.on('pitch', emitView);
      m.on('dragstart', () => orbit.current && setOrbit(false)); // a manual drag ends the auto-rotation

      // Zone names on hover (pins are real buttons with their own labels).
      const hide = () => {
        if (tip.current) tip.current.hidden = true;
        m.getCanvas().style.cursor = '';
      };
      m.on('mousemove', (e) => {
        if (!m.getLayer('zones-fill')) return;
        const tops = m.queryRenderedFeatures(e.point, { layers: ['zones-fill'] });
        const f = tops[tops.length - 1];
        if (!f || !tip.current) return hide();
        const { level, school_name: school } = f.properties;
        const tt = latest.current.t;
        tip.current.textContent = tt('explore.zone.label', { level: tt(`explore.zone.${level}`), school: school ?? tt('explore.zone.school') });
        tip.current.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`;
        tip.current.hidden = false;
      });
      m.on('mouseout', hide);
    })();

    return () => {
      disposed = true;
      clearTimeout(timer);
      markers.current.forEach((k) => k.remove());
      markers.current = [];
      homeMarker.current?.remove();
      homeMarker.current = null;
      m?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- theme: a whole new style (our sources and layers are part of it); the HTML markers stay ----
  const styledDark = useRef(dark);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || styledDark.current === dark) return;
    styledDark.current = dark;
    m.setStyle(buildStyle(dark, data()), { diff: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, ready]);

  // ---- data: ring, zones, beams ----
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const d = data();
    m.getSource('ring')?.setData(d.ring);
    m.getSource('zones')?.setData(d.zones);
    m.getSource('beams')?.setData(d.beams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, home?.lat, home?.lon, radiusMi, zones, zoneLevels, pinsKey, dark]);

  // ---- home marker ----
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    homeMarker.current?.remove();
    homeMarker.current = null;
    if (!home) return; // no address yet: no home marker
    const wrap = document.createElement('div');
    wrap.className = 'sn-home-icon';
    wrap.title = t('explore.map.homeTitle');
    const label = document.createElement('span');
    label.className = 'sn-home';
    label.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/></svg>';
    const text = document.createElement('span');
    text.className = 'sn-home-label';
    text.textContent = t('explore.map.homeLabel');
    label.appendChild(text);
    wrap.appendChild(label);
    homeMarker.current = new lib.current.Marker({ element: wrap, anchor: 'center' }).setLngLat([home.lon, home.lat]).addTo(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, home?.lat, home?.lon, lang]);

  // ---- framing: the home plus the schools actually shown (at least ~1 mile across), or the whole radius when there are none ----
  const framed = useRef(null);
  const fit = (duration) => {
    const m = map.current;
    if (!m) return;
    const { pins: ps, home: h, radiusMi: r } = latest.current;
    if (!h) {
      m.easeTo({ center: [COUNTY_CENTER.lon, COUNTY_CENTER.lat], zoom: COUNTY_ZOOM, duration });
      return;
    }
    const half = ps.length ? METERS_PER_MILE / 2 : milesToMeters(r);
    const dLat = half / 111320;
    const dLon = dLat / Math.cos((h.lat * Math.PI) / 180);
    const lats = [h.lat - dLat, h.lat + dLat, ...ps.map((p) => p.lat)];
    const lons = [h.lon - dLon, h.lon + dLon, ...ps.map((p) => p.lon)];
    m.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: 64, maxZoom: 15, pitch: m.getPitch(), bearing: m.getBearing(), duration },
    );
  };
  useEffect(() => {
    if (!ready) return;
    const first = framed.current === null;
    framed.current = fitKey;
    fit(first ? 0 : ms(1300));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey]);

  // ---- pins: real buttons (keyboard + screen readers) standing on the map ----
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    markers.current.forEach((k) => k.remove());
    markers.current = pins.map((p) => {
      const size = p.active ? 44 : 36;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `sn-pin3d${p.active ? ' active' : ''}`;
      btn.style.width = btn.style.height = `${size}px`;
      btn.style.zIndex = p.active ? '2' : '1';
      btn.setAttribute('aria-label', p.aria);
      btn.title = p.aria;
      btn.innerHTML = pinHtml(p);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        latest.current.onPick?.(p.id);
      });
      return new lib.current.Marker({ element: btn, anchor: 'center' }).setLngLat([p.lon, p.lat]).addTo(m);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pinsKey]);

  // ---- bring the selected school into view (clear of the details card on wide screens) ----
  const activeId = pins.find((p) => p.active)?.id ?? null;
  const shownActive = useRef(undefined);
  const selFit = useRef(fitKey);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const prev = shownActive.current;
    shownActive.current = activeId;
    const p = latest.current.pins.find((x) => x.id === activeId);
    const refit = selFit.current !== fitKey; // the result set changed: the framing effect owns the camera
    selFit.current = fitKey;
    if (prev === undefined || !p || refit) return;
    const wide = m.getContainer().clientWidth > 760;
    m.easeTo({
      center: [p.lon, p.lat],
      zoom: Math.max(m.getZoom(), 13.4),
      padding: { left: wide ? 340 : 0, top: 0, right: 0, bottom: 0 },
      duration: ms(1200),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, activeId]);

  // ---- slow auto-rotation ----
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      if (orbit.current && map.current) map.current.setBearing(map.current.getBearing() + ((now - last) / 1000) * 7);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => map.current?.zoomIn({ duration: ms(300) }),
    zoomOut: () => map.current?.zoomOut({ duration: ms(300) }),
    recenter: () => fit(ms(1000)),
    resetNorth: () => map.current?.easeTo({ bearing: 0, duration: ms(600) }),
    toggleTilt: () => {
      const m = map.current;
      if (m) m.easeTo({ pitch: m.getPitch() > 10 ? 0 : 60, duration: ms(800) });
    },
    toggleOrbit: () => setOrbit(!orbit.current),
  }));

  return (
    <div className="sn-gl" role="application" aria-label={t('explore.map.interactive')}>
      <div ref={el} className="sn-gl-canvas" />
      <div ref={tip} className="sn-gl-tip" hidden />
      {!ready && !noGl && <div className="sn-gl-loading">{t('explore.map.loading')}</div>}
      {noGl && <div className="sn-gl-loading">{t('explore.map.webgl')}</div>}
    </div>
  );
});

export default Map3D;
