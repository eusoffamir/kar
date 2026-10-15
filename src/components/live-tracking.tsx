import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { CarMap } from '@/components/car-map';
import type { MapPin } from '@/components/map-pins';
import { Badge, Button, Card, Ionicons, Row, Txt } from '@/components/ui';
import { C, S } from '@/constants/theme';
import { api } from '@/lib/api';
import { carName, fmtDateTime } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import type { TrackingState } from '@/lib/trip-tracker';
import type { BookingDetail, CarWithOwner, TripLocation } from '@/lib/types';

// Live tracking for owners: where every car is right now. Cars on a trip move with the customer's phone;
// idle cars sit where the last customer parked them (or the owner's pickup spot).

/** No fix for this long during a trip = signal lost (phone off, no data, or location turned off). */
export const SIGNAL_LOST_MS = 5 * 60_000;
/** How often the owner's screens ask for new positions. */
const REFRESH_MS = 15_000;

export type LiveStatus = { kind: 'waiting' } | { kind: 'live' | 'lost'; fix: TripLocation; ago: number };

export function liveStatus(fix: TripLocation | undefined, now: number): LiveStatus {
  if (!fix) return { kind: 'waiting' };
  const ago = Math.max(0, now - new Date(fix.recorded_at).getTime());
  return { kind: ago > SIGNAL_LOST_MS ? 'lost' : 'live', fix, ago };
}

export function fmtAgo(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m ago` : `${Math.floor(h / 24)}d ago`;
}

/** "Moving 42 km/h" / "Stopped". Speeds under 5 km/h are GPS noise while parked. */
export function fmtMotion(fix: TripLocation) {
  const kmh = fix.speed != null ? Math.round(fix.speed * 3.6) : null;
  return kmh != null && kmh >= 5 ? `Moving ${kmh} km/h` : 'Stopped';
}

/** Latest position of each active trip, refreshed while any car is out. */
export function useLatestPositions(active: BookingDetail[]) {
  const ids = active.map((b) => b.id);
  const { data } = useQuery({
    queryKey: ['live', ...ids],
    queryFn: () => api.latestTripLocations(ids),
    enabled: ids.length > 0,
    refetchInterval: REFRESH_MS,
  });
  return new Map((data ?? []).map((l) => [l.booking_id, l]));
}

/** The whole route of one trip, refreshed while it's active. */
export function useTripRoute(bookingId: string, active: boolean) {
  return useQuery({
    queryKey: ['route', bookingId],
    queryFn: () => api.tripRoute(bookingId),
    refetchInterval: active ? REFRESH_MS : false,
  });
}

/** My cars: a live map of the whole fleet, plus one line per car that's out on a trip. */
export function FleetMap({ cars, bookings }: { cars: CarWithOwner[]; bookings: BookingDetail[] }) {
  const now = useNow(REFRESH_MS);
  const active = bookings.filter((b) => b.status === 'active');
  const latest = useLatestPositions(active);
  if (!cars.length) return null;

  const pins: MapPin[] = cars.map((c) => {
    const trip = active.find((b) => b.car_id === c.id);
    const parked = c.last_location ?? { lat: c.pickup_lat, lng: c.pickup_lng };
    if (!trip) return { id: c.id, lat: parked.lat, lng: parked.lng, label: c.model, kind: c.last_location ? 'parked' : 'pickup' };
    const st = liveStatus(latest.get(trip.id), now);
    const at = st.kind === 'waiting' ? parked : st.fix;
    return { id: c.id, lat: at.lat, lng: at.lng, label: c.model, kind: st.kind === 'live' ? 'live' : 'stale' };
  });
  const onSelect = (carId: string) => {
    const trip = active.find((b) => b.car_id === carId);
    if (trip) router.push({ pathname: '/host/track/[id]', params: { id: trip.id } });
  };
  const idle = cars.length - active.length;

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="label">Live map</Txt>
        {active.length ? <Badge label={`${active.length} on trip`} tone="success" icon="radio-outline" /> : null}
      </Row>
      <CarMap center={pins[0]} pins={pins} height={260} labels onSelect={onSelect} />
      {active.map((b) => (
        <LiveRow key={b.id} b={b} status={liveStatus(latest.get(b.id), now)} />
      ))}
      <Txt v="small">
        {idle > 0 ? `${idle} parked ${idle === 1 ? 'car shows' : 'cars show'} where the last customer left it. ` : ''}
        During a trip you see the car move live.
      </Txt>
    </Card>
  );
}

function LiveRow({ b, status }: { b: BookingDetail; status: LiveStatus }) {
  const lost = status.kind === 'lost';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/host/track/[id]', params: { id: b.id } })}
      style={({ pressed }) => [
        { borderTopWidth: 1, borderTopColor: C.line, paddingTop: S.md, gap: 2 },
        pressed && { opacity: 0.7 },
      ]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6} style={{ flex: 1 }}>
          <Ionicons name="ellipse" size={10} color={status.kind === 'live' ? C.success : lost ? C.danger : C.muted} />
          <Txt v="h3" numberOfLines={1} style={{ flex: 1 }}>{carName(b.car)} · {b.customer.full_name}</Txt>
        </Row>
        <Ionicons name="chevron-forward" size={18} color={C.muted} />
      </Row>
      <Txt v="small" color={lost ? C.danger : undefined}>
        {status.kind === 'waiting'
          ? 'Waiting for the first location from the customer’s phone'
          : lost
            ? `No signal for ${fmtAgo(status.ago).replace(' ago', '')}. Call the customer.`
            : `${fmtMotion(status.fix)} · updated ${fmtAgo(status.ago)}`}
      </Txt>
      <Txt v="tiny">Due back {fmtDateTime(b.ends_at)}</Txt>
    </Pressable>
  );
}

/** Customer's trip screen: tells them the owner can see the car, and fixes a blocked permission. */
export function SharingCard({ state, retry }: { state: TrackingState; retry: () => void }) {
  if (state.kind === 'starting') return null;
  if (state.kind === 'blocked') {
    return (
      <Card style={{ borderColor: C.danger, backgroundColor: C.dangerSoft }}>
        <Row><Ionicons name="location-outline" size={20} color={C.danger} /><Txt v="h3">Location sharing is off</Txt></Row>
        <Txt v="small">{state.message}</Txt>
        <Button title="Try again" variant="outline" size="md" onPress={retry} />
      </Card>
    );
  }
  return (
    <Row gap={S.sm} style={{ paddingHorizontal: S.xs }}>
      <Ionicons name="radio-outline" size={18} color={C.success} />
      <View style={{ flex: 1 }}>
        <Txt v="small" color={C.ink}>
          {state.kind === 'background'
            ? 'Sharing the car’s location with the owner until you return it.'
            : 'Sharing the car’s location with the owner. Keep Kar open during the trip.'}
        </Txt>
      </View>
    </Row>
  );
}
