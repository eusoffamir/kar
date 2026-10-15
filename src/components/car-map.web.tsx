import 'maplibre-gl/dist/maplibre-gl.css';

import * as maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { MapTypeToggle } from '@/components/map-type-toggle';
import { C } from '@/constants/theme';
import { useMapType } from '@/lib/stores';

import { isSpot, SPOT_COLOR, type MapPin } from './map-pins';

import type { CarMapProps } from './car-map';

export type { CarMapProps, MapPin } from './car-map';

// Web map: MapLibre GL + OpenFreeMap vector tiles — free, no API key, commercial use allowed.
// Crisp at any zoom, and the "liberty" style is close to the Google-like look Airbnb uses.
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// Satellite imagery (Esri World Imagery). Free for prototypes with attribution;
// for commercial launch use a keyed provider (Esri/MapTiler free tiers).
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics';

// Material "directions_car" icon (Apache 2.0) for single-spot markers.
const CAR_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>';

export function CarMap({ center, pins, selectedId, onSelect, onDeselect, onCenterChange, hideToggle, height = 260, zoom = 15, rounded = true, labels, route, framePadding }: CarMapProps) {
  const full = height === 'fill';
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef(new Map<string, { marker: maplibregl.Marker; el: HTMLElement; pin: MapPin }>());
  const handlers = useRef({ onSelect, onDeselect, onCenterChange });
  const mapType = useMapType();
  const mapTypeRef = useRef(mapType);
  const routeRef = useRef(route);
  /** Which set of cars the map was last framed for: moving pins don't re-zoom the map. */
  const framedFor = useRef('');

  useEffect(() => {
    handlers.current = { onSelect, onDeselect, onCenterChange };
  }, [onSelect, onDeselect, onCenterChange]);

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: STYLE,
      center: [center.lng, center.lat],
      zoom,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      scrollZoom: full,
      cooperativeGestures: false,
    });
    m.touchZoomRotate.disableRotation();
    m.on('click', () => handlers.current.onDeselect?.());
    m.on('moveend', (e) => {
      // Only user drags/zooms, not our own fitBounds/jumpTo.
      if (!(e as { originalEvent?: unknown }).originalEvent) return;
      const c = m.getCenter();
      handlers.current.onCenterChange?.({ lat: c.lat, lng: c.lng });
    });
    m.on('load', () => {
      const layers = m.getStyle().layers ?? [];
      // Airbnb-style calm map: hide shop/bus/parking icons so price pins stand out.
      for (const layer of layers) {
        if (layer.id.startsWith('poi')) m.setLayoutProperty(layer.id, 'visibility', 'none');
      }
      // Satellite sits under the first label layer, so street names stay on top (hybrid view).
      m.addSource('satellite', {
        type: 'raster',
        tiles: [SATELLITE_TILES],
        tileSize: 256,
        maxzoom: 19,
        attribution: SATELLITE_ATTRIBUTION,
      });
      const firstLabel = layers.find((l) => l.type === 'symbol')?.id;
      m.addLayer({ id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } }, firstLabel);
      applyMapType(m, mapTypeRef.current);
      m.addSource('route', { type: 'geojson', data: routeGeoJson(routeRef.current) });
      m.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': C.brand, 'line-width': 4, 'line-opacity': 0.9 },
      });
      // Keep the (required) attribution as a small "i" button until tapped.
      container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    });
    // The container can be laid out after the map is created (and changes size in map mode).
    const resize = new ResizeObserver(() => m.resize());
    resize.observe(container.current);
    map.current = m;
    const current = markers.current;
    return () => {
      resize.disconnect();
      current.clear();
      m.remove();
      map.current = null;
    };
    // Map is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers and frame them whenever the set of pins changes.
  const pinKey = pins.map((p) => `${p.id}:${p.lat},${p.lng}:${p.label}:${p.kind ?? ''}`).join('|');
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach(({ marker }) => marker.remove());
    markers.current.clear();
    for (const pin of pins) {
      const el = pinElement(pin, !!labels);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.current.onSelect?.(pin.id);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([pin.lng, pin.lat]).addTo(m);
      markers.current.set(pin.id, { marker, el, pin });
    }
    // Re-frame when cars are added or removed, a car's state changes, or a car moves ~1 km (keeps cars on a trip in view).
    const idKey = pins.map((p) => `${p.id}:${p.kind ?? ''}:${Math.round(p.lat * 100)},${Math.round(p.lng * 100)}`).join();
    if (pins.length > 1) {
      if (framedFor.current === idKey) return;
      framedFor.current = idKey;
      const bounds = new maplibregl.LngLatBounds();
      pins.forEach((p) => bounds.extend([p.lng, p.lat]));
      m.fitBounds(bounds, {
        padding: { top: framePadding?.top ?? 70, bottom: framePadding?.bottom ?? (full ? 190 : 50), left: 50, right: 50 },
        maxZoom: 16,
        duration: 0,
      });
    } else if (framedFor.current !== idKey) {
      framedFor.current = idKey;
      m.jumpTo({ center: [center.lng, center.lat], zoom });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinKey]);

  // Follow `center` for single-spot maps (e.g. "Use my location" in the pin picker).
  useEffect(() => {
    const m = map.current;
    if (!m || pins.length > 1) return;
    const c = m.getCenter();
    if (Math.abs(c.lat - center.lat) > 1e-6 || Math.abs(c.lng - center.lng) > 1e-6) {
      m.jumpTo({ center: [center.lng, center.lat] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng]);

  // Trip route line.
  const routeKey = route ? `${route.length}:${route.at(-1)?.lat},${route.at(-1)?.lng}` : '';
  useEffect(() => {
    routeRef.current = route;
    const src = map.current?.getSource('route') as maplibregl.GeoJSONSource | undefined;
    src?.setData(routeGeoJson(route));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  // Map / Satellite switch.
  useEffect(() => {
    mapTypeRef.current = mapType;
    const m = map.current;
    if (m?.getLayer('satellite')) applyMapType(m, mapType);
  }, [mapType]);

  // Highlight the selected price pin.
  useEffect(() => {
    markers.current.forEach(({ el, pin }, id) => {
      if (isSpot(pin.kind)) return;
      styleSelected(el, id === selectedId);
    });
  }, [selectedId, pinKey]);

  return (
    <View style={[full ? { flex: 1 } : { height }, rounded && { borderRadius: 16, overflow: 'hidden' }, { backgroundColor: '#F2EFE9' }]}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {hideToggle ? null : <MapTypeToggle />}
    </View>
  );
}

/** Show the satellite layer and hide building blocks (they'd cover the photo), or the reverse. */
function applyMapType(m: maplibregl.Map, type: 'map' | 'satellite') {
  const sat = type === 'satellite';
  m.setLayoutProperty('satellite', 'visibility', sat ? 'visible' : 'none');
  for (const layer of m.getStyle().layers ?? []) {
    if (layer.type === 'fill-extrusion' || layer.id.startsWith('building')) {
      m.setLayoutProperty(layer.id, 'visibility', sat ? 'none' : 'visible');
    }
  }
}

function routeGeoJson(route: { lat: number; lng: number }[] | undefined): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: (route ?? []).map((r) => [r.lng, r.lat]) },
  };
}

function pinElement(pin: MapPin, showLabel: boolean): HTMLElement {
  const el = document.createElement('div');
  if (isSpot(pin.kind)) {
    const color = SPOT_COLOR[pin.kind as keyof typeof SPOT_COLOR];
    el.style.cssText = 'position:relative;width:60px;height:60px;cursor:pointer';
    el.innerHTML =
      `<div style="width:60px;height:60px;border-radius:30px;background:${color}2E;display:flex;align-items:center;justify-content:center">` +
      `<div style="width:40px;height:40px;border-radius:20px;background:${color};border:3px solid #fff;box-sizing:border-box;` +
      `display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.25)">${CAR_SVG}</div></div>`;
    if (showLabel && pin.label) {
      const tag = document.createElement('div');
      tag.textContent = pin.label;
      tag.style.cssText =
        'position:absolute;top:52px;left:50%;transform:translateX(-50%);background:#fff;border-radius:999px;padding:3px 8px;' +
        `white-space:nowrap;font:700 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;color:${C.ink};box-shadow:0 2px 6px rgba(0,0,0,.18)`;
      el.appendChild(tag);
    }
    return el;
  }
  el.textContent = pin.label;
  el.style.cssText = [
    'border-radius:999px',
    'padding:7px 12px',
    'font:700 14px/1 system-ui,-apple-system,"Segoe UI",sans-serif',
    'white-space:nowrap',
    'box-shadow:0 2px 6px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.04)',
    'cursor:pointer',
    'transition:background .15s,color .15s',
  ].join(';');
  styleSelected(el, false);
  return el;
}

function styleSelected(el: HTMLElement, selected: boolean) {
  el.style.background = selected ? C.ink : '#fff';
  el.style.color = selected ? '#fff' : C.ink;
  // MapLibre positions markers with `transform`, so scale the inner box via zIndex + padding instead.
  el.style.zIndex = selected ? '2' : '1';
  el.style.padding = selected ? '8px 14px' : '7px 12px';
}
