import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, ErrorText, Ionicons, Row, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api, useAction } from '@/lib/api';
import { SLOT_LABEL } from '@/lib/format';
import { PHOTO_SLOTS, REQUIRED_PHOTO_SLOTS, type BookingDetail, type PhotoPhase, type PhotoSlot, type TripPhoto } from '@/lib/types';

/** Best-effort GPS fix; returns null if permission is denied or the device can't get a fix. */
export async function currentCoords() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * The 7-photo checklist (4 sides, interior, fuel, odometer). Photos are timestamped and geotagged:
 * this is the evidence that settles damage disputes between owners and customers.
 */
export function PhotoChecklist({
  bookingId,
  phase,
  photos,
}: {
  bookingId: string;
  phase: PhotoPhase;
  photos: TripPhoto[];
}) {
  const [busySlot, setBusySlot] = useState<PhotoSlot | null>(null);
  const upload = useAction(async ({ slot, uri }: { slot: PhotoSlot; uri: string }) => {
    const coords = await currentCoords();
    await api.uploadTripPhoto(bookingId, phase, slot, uri, coords);
  });

  const take = async (slot: PhotoSlot) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (res.canceled || !res.assets[0]) return;
    setBusySlot(slot);
    try {
      await upload.mutateAsync({ slot, uri: res.assets[0].uri });
    } finally {
      setBusySlot(null);
    }
  };

  const mine = photos.filter((p) => p.phase === phase);
  const done = REQUIRED_PHOTO_SLOTS.filter((s) => mine.some((p) => p.slot === s)).length;
  // Size tiles from the measured width: percentage widths + aspectRatio render squashed on iOS.
  const [gridWidth, setGridWidth] = useState(0);
  const tile = gridWidth ? (gridWidth - GRID_GAP * 2) / 3 : 0;

  return (
    <View style={{ gap: S.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="label">{phase === 'before' ? 'Before photos' : 'After photos'}</Txt>
        <Txt v="small" color={done === REQUIRED_PHOTO_SLOTS.length ? C.success : C.muted}>
          {done}/{REQUIRED_PHOTO_SLOTS.length} required
        </Txt>
      </Row>
      <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
        {tile > 0 && PHOTO_SLOTS.map((slot) => {
          const p = mine.find((x) => x.slot === slot);
          const optional = !REQUIRED_PHOTO_SLOTS.includes(slot);
          return (
            <Pressable
              key={slot}
              disabled={busySlot !== null}
              onPress={() => take(slot)}
              style={[styles.tile, { width: tile, height: tile * 0.9 }, p && styles.tileDone]}>
              {p?.uri ? (
                <>
                  <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  <View style={styles.tileLabel}>
                    <Txt v="tiny" color="#fff" numberOfLines={1}>✓ {SLOT_LABEL[slot]}</Txt>
                  </View>
                </>
              ) : (
                <>
                  {busySlot === slot ? <ActivityIndicator color={C.brand} /> : <Ionicons name="camera-outline" size={24} color={C.ink} />}
                  <Txt v="tiny" color={C.text} numberOfLines={1}>{SLOT_LABEL[slot]}</Txt>
                  {optional ? <Txt v="tiny" color={C.muted}>optional</Txt> : null}
                </>
              )}
            </Pressable>
          );
        })}
      </View>
      <ErrorText error={upload.error} />
    </View>
  );
}

/** Opens Google Maps (app or web) with walking directions to the exact spot. */
export function DirectionsButton({ lat, lng }: { lat: number; lng: number }) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
  return <Button title="Directions" icon="navigate" variant="dark" size="md" onPress={() => Linking.openURL(url)} />;
}

/** Call / WhatsApp the other party. Numbers are only released once the booking is confirmed. */
export function ContactButtons({ bookingId }: { bookingId: string }) {
  const { data: phone } = useQuery({ queryKey: ['phone', bookingId], queryFn: () => api.contactPhone(bookingId) });
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return (
    <Row>
      <Button title="Call" icon="call" variant="outline" size="md" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:+${digits}`)} />
      <Button title="WhatsApp" icon="logo-whatsapp" variant="outline" size="md" style={{ flex: 1 }} onPress={() => Linking.openURL(`https://wa.me/${digits}`)} />
    </Row>
  );
}

export function PhotoCompare({ photos }: { photos: TripPhoto[] }) {
  return (
    <View style={{ gap: S.sm }}>
      {PHOTO_SLOTS.map((slot) => {
        const before = photos.find((p) => p.phase === 'before' && p.slot === slot);
        const after = photos.find((p) => p.phase === 'after' && p.slot === slot);
        if (!before && !after) return null;
        return (
          <View key={slot} style={{ gap: 4 }}>
            <Txt v="small">{SLOT_LABEL[slot]}</Txt>
            <Row>
              {[before, after].map((p, i) => (
                <View key={i} style={[styles.compare, { flex: 1 }]}>
                  {p ? <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Txt v="small">—</Txt>}
                  <View style={styles.compareTag}>
                    <Txt v="small" color="#fff">
                      {i === 0 ? 'Before' : 'After'}
                      {p ? ` · ${new Date(p.taken_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </Txt>
                  </View>
                </View>
              ))}
            </Row>
          </View>
        );
      })}
    </View>
  );
}

/** Customer trust summary shown to owners: verification, rating, trip count. */
export function CustomerLine({ b }: { b: BookingDetail }) {
  const c = b.customer;
  return (
    <Row gap={6} style={{ flexWrap: 'wrap' }}>
      <Ionicons name="person-circle" size={18} color={C.muted} />
      <Txt v="small" color={C.ink}>{c.full_name}</Txt>
      {c.verification === 'verified' ? (
        <Badge label="ID verified" icon="shield-checkmark" tone="success" />
      ) : c.verification === 'pending' ? (
        <Badge label="ID check pending" icon="time-outline" tone="warning" />
      ) : (
        <Badge label="Not verified" tone="danger" />
      )}
      <Txt v="small">
        {c.rating_avg ? `★ ${c.rating_avg.toFixed(1)}` : 'No ratings'} · {c.trips_count} trips
      </Txt>
    </Row>
  );
}

const GRID_GAP = S.sm;

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  tile: {
    borderRadius: R.md,
    borderWidth: 1.5,
    borderColor: C.lineStrong,
    borderStyle: 'dashed',
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  tileDone: { borderColor: C.success, borderStyle: 'solid' },
  tileLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  compare: {
    aspectRatio: 1.3,
    borderRadius: R.sm,
    overflow: 'hidden',
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compareTag: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    backgroundColor: 'rgba(16,24,40,.6)',
    borderRadius: 6,
    paddingHorizontal: 6,
  },
});
