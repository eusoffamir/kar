import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';

import { isSpot, SPOT_COLOR, type MapPin } from '@/components/map-pins';
import { MapTypeToggle } from '@/components/map-type-toggle';
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
};

// Native map (Google Maps on Android, Apple Maps on iOS). Web uses car-map.web.tsx (MapLibre).
// Android maps are Google Maps, which need an API key in the build (react-native-maps plugin). Until a build has
// one, Android shows MapFallback instead of crashing. Set EXPO_PUBLIC_ANDROID_MAPS=1 (EAS env) with the key.
const ANDROID_MAPS_READY = process.env.EXPO_PUBLIC_ANDROID_MAPS === '1';

export function CarMap(props: CarMapProps) {
  if (Platform.OS === 'android' && !ANDROID_MAPS_READY) return <MapFallback {...props} />;
  return <NativeMap {...props} />;
}

/** No in-app map: the spots as a list, each opening the phone's own maps app (free for Kar). */
function MapFallback({ center, pins, onSelect, height = 260, rounded = true }: CarMapProps) {
  const open = (lat: number, lng: number) => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
  const many = pins.length > 1;
  return (
    <View style={[height === 'fill' ? { flex: 1 } : { minHeight: Math.min(height, 200) }, rounded && styles.rounded, styles.fallback]}>
      <Ionicons name="map-outline" size={28} color={C.muted} />
      {many ? (
        pins.slice(0, 8).map((p) => (
          <Pressable key={p.id} onPress={() => (onSelect ? onSelect(p.id) : open(p.lat, p.lng))} style={styles.fallbackRow}>
            <Ionicons name="location" size={16} color={SPOT_COLOR[(p.kind as keyof typeof SPOT_COLOR) ?? 'pickup'] ?? C.brand} />
            <Text style={styles.fallbackText} numberOfLines={1}>{p.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.muted} />
          </Pressable>
        ))
      ) : (
        <Pressable onPress={() => open(pins[0]?.lat ?? center.lat, pins[0]?.lng ?? center.lng)} style={styles.fallbackButton}>
          <Ionicons name="navigate" size={16} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '600' }}>Open in Google Maps</Text>
        </Pressable>
      )}
    </View>
  );
}

function NativeMap({ center, pins, selectedId, onSelect, onDeselect, onCenterChange, hideToggle, height = 260, zoom = 15, rounded = true, labels, route }: CarMapProps) {
  const ref = useRef<MapView>(null);
  const mapType = useMapType();
  const delta = 0.012 * Math.pow(2, 15 - zoom);
  // Re-frame when cars are added or removed, or a car's state changes (e.g. its first live location arrives).
  const priceKey = pins.map((p) => `${p.id}:${p.kind ?? ''}`).join();

  // Frame all cars once they're known, like Airbnb's map does on load.
  useEffect(() => {
    if (pins.length < 2) return;
    ref.current?.fitToCoordinates(
      pins.map((p) => ({ latitude: p.lat, longitude: p.lng })),
      { edgePadding: { top: 80, right: 60, bottom: 160, left: 60 }, animated: false },
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
              anchor={{ x: 0.5, y: labels && color ? 0.35 : 0.5 }}
              zIndex={selected ? 10 : p.kind === 'live' ? 5 : 1}
              tracksViewChanges={false}>
              {color ? (
                <View style={{ alignItems: 'center' }}>
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
    </View>
  );
}

// Google Maps style: hide business POIs and transit clutter so the price pins stand out.
const CLEAN_STYLE = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

const styles = StyleSheet.create({
  rounded: { borderRadius: 16, overflow: 'hidden', backgroundColor: C.soft },
  fallback: { backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 },
  fallbackRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  fallbackText: { flex: 1, fontWeight: '600', color: C.ink },
  fallbackButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.ink, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  pill: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    margin: 6,
  },
  pillSelected: { backgroundColor: C.ink, transform: [{ scale: 1.08 }] },
  pillText: { fontWeight: '700', fontSize: 14, color: C.ink },
  spotHalo: { padding: 10, borderRadius: 40, backgroundColor: 'rgba(15,91,255,0.18)' },
  spotLabel: { marginTop: -6, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 140 },
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
