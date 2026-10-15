import Ionicons from '@expo/vector-icons/Ionicons';
import { Camera, GeoJSONSource, Layer, Map, Marker, type CameraRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { isSpot, SPOT_COLOR, type MapPin } from '@/components/map-pins';
import { MapTypeToggle } from '@/components/map-type-toggle';
import { C, shadow } from '@/constants/theme';
import { useMapType } from '@/lib/stores';

import type { CarMapProps } from './car-map';

export type { CarMapProps, MapPin } from './car-map';

// Android map: MapLibre with OpenFreeMap tiles, the same free map the website uses (car-map.web.tsx). Google Maps
// would need a Google Cloud billing account and API key; iPhone keeps Apple Maps (car-map.tsx).
const STREET_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// Satellite imagery (Esri World Imagery), as on the website. Free for prototypes with attribution; for the
// commercial launch use a keyed provider (Esri/MapTiler free tiers).
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
};

export function CarMap({ center, pins, selectedId, onSelect, onDeselect, onCenterChange, hideToggle, height = 260, zoom = 15, rounded = true, labels, route, framePadding }: CarMapProps) {
  const camera = useRef<CameraRef>(null);
  const mapType = useMapType();

  // Frame all pins when cars are added or removed, change state, or move ~1 km (keeps cars on a trip in view).
  const fitKey = pins.map((p) => `${p.id}:${p.kind ?? ''}:${Math.round(p.lat * 100)},${Math.round(p.lng * 100)}`).join();
  useEffect(() => {
    if (pins.length < 2) return;
    const lngs = pins.map((p) => p.lng);
    const lats = pins.map((p) => p.lat);
    camera.current?.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], {
      padding: { top: framePadding?.top ?? 80, right: 60, bottom: framePadding?.bottom ?? 160, left: 60 },
      duration: 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // Follow `center` for single-spot maps (pin picker, a car on a trip).
  useEffect(() => {
    if (pins.length > 1) return;
    camera.current?.easeTo({ center: [center.lng, center.lat], duration: 300 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng]);

  const line = useMemo<GeoJSON.Feature | null>(
    () =>
      route && route.length > 1
        ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.map((r) => [r.lng, r.lat]) } }
        : null,
    [route],
  );

  return (
    <View style={[height === 'fill' ? { flex: 1 } : { height }, rounded && styles.rounded]}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={mapType === 'satellite' ? SATELLITE_STYLE : STREET_STYLE}
        logo={false}
        compass={false}
        touchRotate={false}
        touchPitch={false}
        attributionPosition={{ bottom: 8, left: 8 }}
        onPress={() => onDeselect?.()}
        onRegionDidChange={(e) => {
          // Only the user's own drags (the pin picker), not our camera moves.
          if (!e.nativeEvent.userInteraction) return;
          const [lng, lat] = e.nativeEvent.center;
          onCenterChange?.({ lat, lng });
        }}>
        <Camera ref={camera} initialViewState={{ center: [center.lng, center.lat], zoom }} />
        {line ? (
          <GeoJSONSource id="route" data={line}>
            <Layer type="line" id="route-line" style={{ lineColor: C.brand, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }} />
          </GeoJSONSource>
        ) : null}
        {pins.map((p) => (
          <Marker key={p.id} id={p.id} lngLat={[p.lng, p.lat]} anchor="center" onPress={() => onSelect?.(p.id)}>
            <PinView pin={p} selected={p.id === selectedId} label={!!labels} />
          </Marker>
        ))}
      </Map>
      {hideToggle ? null : <MapTypeToggle />}
    </View>
  );
}

function PinView({ pin, selected, label }: { pin: MapPin; selected: boolean; label: boolean }) {
  if (isSpot(pin.kind)) {
    const color = SPOT_COLOR[pin.kind as keyof typeof SPOT_COLOR];
    return (
      <View style={{ alignItems: 'center' }}>
        {label && pin.label ? <View style={{ height: LABEL_H - 6 }} /> : null}
        <View style={[styles.spotHalo, { backgroundColor: `${color}2E` }]}>
          <View style={[styles.spot, shadow, { backgroundColor: color }]}>
            <Ionicons name="car" size={20} color="#fff" />
          </View>
        </View>
        {label && pin.label ? (
          <View style={[styles.spotLabel, shadow]}>
            <Text style={styles.spotLabelText} numberOfLines={1}>{pin.label}</Text>
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View style={[styles.pill, shadow, selected && styles.pillSelected]}>
      <Text style={[styles.pillText, selected && { color: '#fff' }]}>{pin.label}</Text>
    </View>
  );
}

/** Height of the name tag under a car pin; the same space sits above the icon so the icon stays centred. */
const LABEL_H = 22;

const styles = StyleSheet.create({
  rounded: { borderRadius: 16, overflow: 'hidden', backgroundColor: C.soft },
  pill: { backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, margin: 6 },
  pillSelected: { backgroundColor: C.ink, transform: [{ scale: 1.08 }] },
  pillText: { fontWeight: '700', fontSize: 14, color: C.ink },
  spotHalo: { padding: 10, borderRadius: 40 },
  spot: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  spotLabel: { marginTop: -6, height: LABEL_H, justifyContent: 'center', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 8, maxWidth: 140 },
  spotLabelText: { fontSize: 12, fontWeight: '700', color: C.ink },
});
