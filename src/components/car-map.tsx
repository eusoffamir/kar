import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';

import { MapTypeToggle } from '@/components/map-type-toggle';
import { C, shadow } from '@/constants/theme';
import { useMapType } from '@/lib/stores';

/** `price` = Airbnb-style price pill; `parked`/`pickup` = round car icon marking one exact spot. */
export type MapPin = { id: string; lat: number; lng: number; label: string; kind?: 'price' | 'parked' | 'pickup' };

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
};

// Native map (Google Maps on Android, Apple Maps on iOS). Web uses car-map.web.tsx (MapLibre).
export function CarMap({ center, pins, selectedId, onSelect, onDeselect, onCenterChange, hideToggle, height = 260, zoom = 15, rounded = true }: CarMapProps) {
  const ref = useRef<MapView>(null);
  const mapType = useMapType();
  const delta = 0.012 * Math.pow(2, 15 - zoom);
  const priceKey = pins.map((p) => p.id).join();

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
        {pins.map((p) => {
          const selected = p.id === selectedId;
          const spot = p.kind === 'parked' || p.kind === 'pickup';
          return (
            <Marker
              key={`${p.id}-${selected}`}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              onPress={() => onSelect?.(p.id)}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={selected ? 10 : 1}
              tracksViewChanges={false}>
              {spot ? (
                <View style={styles.spotHalo}>
                  <View style={[styles.spot, shadow]}>
                    <Ionicons name="car" size={20} color="#fff" />
                  </View>
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
  pill: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    margin: 6,
  },
  pillSelected: { backgroundColor: C.ink, transform: [{ scale: 1.08 }] },
  pillText: { fontWeight: '700', fontSize: 14, color: C.ink },
  spotHalo: { padding: 10, borderRadius: 40, backgroundColor: 'rgba(244,63,94,0.18)' },
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
