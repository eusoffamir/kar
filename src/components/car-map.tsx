import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';

import { isOffCentre, isSpot, SPOT_COLOR, type MapPin } from '@/components/map-pins';
import { MapTypeToggle, RecenterButton } from '@/components/map-type-toggle';
import { C, shadow } from '@/constants/theme';
import { useMapType } from '@/lib/stores';

export type { MapPin } from './map-pins';

export type CarMapProps = {
  center: { lat: number; lng: number };
  pins: MapPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Tapping empty map (closes a preview card). */
  onDeselect?: () => void;
  /** Fires when the user stops moving the map (used by the "move map under the pin" picker). */
  onCenterChange?: (c: { lat: number; lng: number }) => void;
  /** Hide the Map/Satellite switch. */
  hideToggle?: boolean;
  /** Pixel height, or 'fill' to take all available space (full-screen map). */
  height?: number | 'fill';
  zoom?: number;
  rounded?: boolean;
  /** Show each car pin's label under it (several cars on one map, e.g. the owner's fleet). */
  labels?: boolean;
  /** Line through these points, e.g. the route of a trip so far. */
  route?: { lat: number; lng: number }[];
  /** Space kept clear above and below the pins when framing them (floating bars over a full-screen map). */
  framePadding?: { top: number; bottom: number };
};

// Native map (Google Maps on Android, Apple Maps on iOS). Web uses car-map.web.tsx (MapLibre).
// iPhone: Apple Maps (react-native-maps, no key needed). Android uses car-map.android.tsx (MapLibre) and the web
// car-map.web.tsx (MapLibre GL), both with free OpenFreeMap tiles.
export function CarMap({ center, pins, selectedId, onSelect, onDeselect, onCenterChange, hideToggle, height = 260, zoom = 15, rounded = true, labels, route, framePadding }: CarMapProps) {
  const ref = useRef<MapView>(null);
  const [offCentre, setOffCentre] = useState(false);
  const mapType = useMapType();
  const delta = 0.012 * Math.pow(2, 15 - zoom);
  // Re-frame when cars are added or removed, a car's state changes, or a car moves ~1 km (keeps cars on a trip in view).
  const priceKey = pins.map((p) => `${p.id}:${p.kind ?? ''}:${Math.round(p.lat * 100)},${Math.round(p.lng * 100)}`).join();

  // Frame all cars once they're known, like Airbnb's map does on load.
  useEffect(() => {
    if (pins.length < 2) return;
    ref.current?.fitToCoordinates(
      pins.map((p) => ({ latitude: p.lat, longitude: p.lng })),
      { edgePadding: { top: framePadding?.top ?? 80, right: 60, bottom: framePadding?.bottom ?? 160, left: 60 }, animated: false },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceKey]);

  // Follow `center` for single-spot maps (e.g. "Use my location" in the pin picker).
  const last = useRef(center);
  useEffect(() => {
    if (pins.length > 1) return;
    const moved = Math.abs(last.current.lat - center.lat) > 1e-5 || Math.abs(last.current.lng - center.lng) > 1e-5;
    last.current = center;
    if (moved) {
      ref.current?.animateToRegion({ latitude: center.lat, longitude: center.lng, latitudeDelta: delta, longitudeDelta: delta }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng]);

  return (
    <View style={[height === 'fill' ? { flex: 1 } : { height }, rounded && styles.rounded]}>
      <MapView
        ref={ref}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: delta, longitudeDelta: delta }}
        mapType={mapType === 'satellite' ? 'hybrid' : 'standard'}
        customMapStyle={mapType === 'satellite' ? undefined : CLEAN_STYLE}
        showsUserLocation
        showsPointsOfInterests={false}
        showsCompass={false}
        toolbarEnabled={false}
        onRegionChangeComplete={(r) => {
          // Always report the centre (iOS doesn't reliably flag user gestures). Our own
          // animateToRegion lands on the same centre, so this can't loop.
          last.current = { lat: r.latitude, lng: r.longitude };
          onCenterChange?.(last.current);
          if (pins.length === 1) setOffCentre(isOffCentre({ lat: r.latitude, lng: r.longitude, latSpan: r.latitudeDelta, lngSpan: r.longitudeDelta }, pins[0]));
        }}
        onPress={(e) => {
          if (e.nativeEvent.action !== 'marker-press') onDeselect?.();
        }}>
        {route && route.length > 1 ? (
          <Polyline
            coordinates={route.map((r) => ({ latitude: r.lat, longitude: r.lng }))}
            strokeColor={C.brand}
            strokeWidth={4}
            lineJoin="round"
            lineCap="round"
          />
        ) : null}
        {pins.map((p) => {
          const selected = p.id === selectedId;
          const color = p.kind && isSpot(p.kind) ? SPOT_COLOR[p.kind as keyof typeof SPOT_COLOR] : null;
          return (
            <Marker
              key={`${p.id}-${selected}-${p.kind}-${p.label}`}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              onPress={() => onSelect?.(p.id)}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={selected ? 10 : p.kind === 'live' ? 5 : 1}
              tracksViewChanges={false}>
              {color ? (
                <View style={{ alignItems: 'center' }}>
                  {labels && p.label ? <View style={{ height: LABEL_H - 6 }} /> : null}
                  <View style={[styles.spotHalo, { backgroundColor: `${color}2E` }]}>
                    <View style={[styles.spot, shadow, { backgroundColor: color }]}>
                      <Ionicons name="car" size={20} color="#fff" />
                    </View>
                  </View>
                  {labels && p.label ? (
                    <View style={[styles.spotLabel, shadow]}>
                      <Text style={styles.spotLabelText} numberOfLines={1}>{p.label}</Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={[styles.pill, shadow, selected && styles.pillSelected]}>
                  <Text style={[styles.pillText, selected && { color: '#fff' }]}>{p.label}</Text>
                </View>
              )}
            </Marker>
          );
        })}
      </MapView>
      {hideToggle ? null : <MapTypeToggle />}
      {/* One car (not the pin picker, where the user moves the map on purpose): button to bring it back to the middle. */}
      {pins.length === 1 && !onCenterChange && offCentre ? (
        <RecenterButton
          onPress={() =>
            ref.current?.animateToRegion({ latitude: pins[0].lat, longitude: pins[0].lng, latitudeDelta: delta, longitudeDelta: delta }, 300)
          }
        />
      ) : null}
    </View>
  );
}

// Google Maps style: hide business POIs and transit clutter so the price pins stand out.
const CLEAN_STYLE = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

/** Height of the name tag under a car pin; the same space sits above the icon so the icon stays centred. */
const LABEL_H = 22;

const styles = StyleSheet.create({
  rounded: { borderRadius: 16, overflow: 'hidden', backgroundColor: C.soft },
  pill: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    margin: 6,
  },
  pillSelected: { backgroundColor: C.brand, transform: [{ scale: 1.08 }] },
  pillText: { fontWeight: '700', fontSize: 14, color: C.ink },
  spotHalo: { padding: 10, borderRadius: 40, backgroundColor: 'rgba(1,49,197,0.18)' },
  spotLabel: { marginTop: -6, height: LABEL_H, justifyContent: 'center', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 8, maxWidth: 140 },
  spotLabelText: { fontSize: 12, fontWeight: '700', color: C.ink },
  spot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.brand,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
