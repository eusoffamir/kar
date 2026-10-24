import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { GuidedCamera } from '@/components/guided-camera';
import { Avatar, Badge, Button, ErrorText, Ionicons, Row, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api, useAction } from '@/lib/api';
import { SLOT_LABEL, personName } from '@/lib/format';
import { PHOTO_SLOTS, REQUIRED_PHOTO_SLOTS, type BookingDetail, type PhotoPhase, type PhotoSlot, type TripPhoto } from '@/lib/types';

const BLOCKED_WEB =
  'Location is blocked. On iPhone: Settings → Privacy & Security → Location Services → Safari Websites → "While Using", then reload Kar and allow it.';

/** GPS fix, or an error that tells the user how to fix it (shown by "Use my location" and the return step). */
export async function locateMe(): Promise<{ lat: number; lng: number }> {
  if (Platform.OS === 'web') {
    // Ask the browser directly: Safari reliably shows its own "Allow location?" prompt this way.
    if (typeof navigator === 'undefined' || !navigator.geolocation) throw new Error('This browser cannot share your location.');
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? BLOCKED_WEB : 'Could not find your location. Try again in a moment, ideally outdoors.')),
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
      ),
    );
  }
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Allow location for Kar in your phone Settings to use this.');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

/**
 * Whether location is already allowed, without showing a prompt. Only a hint: Safari can report "granted" or
 * "prompt" wrongly, so a real fix (locateMe) is the proof. Returns false when it can't tell.
 */
export async function locationAlreadyAllowed(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !navigator.permissions) return false;
      return (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted';
    }
    return (await Location.getForegroundPermissionsAsync()).status === 'granted';
  } catch {
    return false;
  }
}

/** Best-effort GPS fix for optional uses (photo geotags, incident reports); null if unavailable. */
export async function currentCoords() {
  try {
    return await locateMe();
  } catch {
    return null;
  }
}

/**
 * The photo checklist: the 4 sides and the fuel gauge (interior and odometer slots still exist but aren't asked for). Photos are timestamped and geotagged:
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
  // Slots still uploading, with the shot shown right away so the box fills before the upload finishes.
  const [pending, setPending] = useState<Partial<Record<PhotoSlot, string>>>({});
  const [run, setRun] = useState<PhotoSlot[] | null>(null);
  const upload = useAction(async ({ slot, uri }: { slot: PhotoSlot; uri: string }) => {
    const coords = await currentCoords();
    await api.uploadTripPhoto(bookingId, phase, slot, uri, coords);
  });

  const onShot = (slot: PhotoSlot, uri: string) => {
    setPending((x) => ({ ...x, [slot]: uri }));
    upload
      .mutateAsync({ slot, uri })
      .catch(() => {}) // shown by ErrorText below
      .finally(() => setPending(({ [slot]: _, ...rest }) => rest));
  };

  const mine = photos.filter((p) => p.phase === phase);
  const done = REQUIRED_PHOTO_SLOTS.filter((s) => mine.some((p) => p.slot === s)).length;
  // Size tiles from the measured width: percentage widths + aspectRatio render squashed on iOS.
  const [rowWidth, setRowWidth] = useState(0);
  const tile = rowWidth ? (rowWidth - GRID_GAP * 4) / 5 : 0;

  const shot = (slot: PhotoSlot) => mine.find((x) => x.slot === slot);
  const missing = REQUIRED_PHOTO_SLOTS.filter((x) => !shot(x) && !pending[x]);
  // An empty box starts the guided run there and carries on through the other missing ones; a done box is a single retake.
  const startAt = (slot: PhotoSlot) => {
    if (shot(slot)) return setRun([slot]);
    const i = missing.indexOf(slot);
    setRun([...missing.slice(i), ...missing.slice(0, i)]);
  };

  return (
    <View style={{ gap: S.md }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: S.sm }}>
        <Txt v="label">{phase === 'before' ? 'Before photos' : 'After photos'}</Txt>
        <Txt v="small" color={done === REQUIRED_PHOTO_SLOTS.length ? C.success : C.muted}>
          {done}/{REQUIRED_PHOTO_SLOTS.length}
        </Txt>
      </Row>
      <View style={styles.row} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
        {tile > 0 &&
          REQUIRED_PHOTO_SLOTS.map((slot) => {
            const uri = pending[slot] ?? shot(slot)?.uri;
            return (
              <Pressable
                key={slot}
                onPress={() => startAt(slot)}
                accessibilityLabel={`Take ${SLOT_LABEL[slot]} photo`}
                style={[styles.tile, { width: tile, height: tile }, uri && styles.tileDone]}>
                {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                {pending[slot] ? (
                  <ActivityIndicator color="#fff" />
                ) : uri ? (
                  <View style={styles.tick}>
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  </View>
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={20} color={C.ink} />
                    <Txt v="tiny" color={C.text} numberOfLines={1}>{SHORT_LABEL[slot]}</Txt>
                  </>
                )}
              </Pressable>
            );
          })}
      </View>
      {missing.length ? (
        <Button
          title={missing.length === REQUIRED_PHOTO_SLOTS.length ? 'Take the 5 photos' : `Take the last ${missing.length}`}
          icon="camera"
          variant="outline"
          onPress={() => setRun(missing)}
        />
      ) : null}
      <ErrorText error={upload.error} />
      <GuidedCamera slots={run} onShot={onShot} onClose={() => setRun(null)} />
    </View>
  );
}

/** Short names so five boxes fit in one row. */
const SHORT_LABEL: Record<PhotoSlot, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  fuel: 'Fuel',
  interior: 'Inside',
  odometer: 'Odometer',
};

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
                      {p ? ` ${new Date(p.taken_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
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
      <Avatar name={personName(c)} uri={c.avatar_url} size={28} />
      <Txt v="small" color={C.ink}>{personName(c)}</Txt>
      {c.verification === 'verified' ? (
        <Badge label="ID verified" icon="shield-checkmark" tone="success" />
      ) : c.verification === 'pending' ? (
        <Badge label="ID check pending" icon="time-outline" tone="warning" />
      ) : (
        <Badge label="Not verified" tone="danger" />
      )}
      <Txt v="small">
        {c.renter_rating_avg ? `★ ${c.renter_rating_avg.toFixed(1)} from owners (${c.renter_rating_count})` : 'Not rated yet'}, {c.trips_count} trips
      </Txt>
    </Row>
  );
}

const GRID_GAP = 6;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GRID_GAP },
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
  tick: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.success,
    alignItems: 'center',
    justifyContent: 'center',
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
