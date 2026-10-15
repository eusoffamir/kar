import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import { Button, Card, Ionicons, Row, Txt } from '@/components/ui';
import { C, S } from '@/constants/theme';
import { api } from '@/lib/api';
import type { TrackingState } from '@/lib/trip-tracker';
import type { BookingDetail, TripLocation } from '@/lib/types';

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

/** Rough Peninsular Malaysia box minus Singapore (mirrors in_peninsular_malaysia() in the database). */
export const inPeninsularMalaysia = (lat: number, lng: number) =>
  lat >= 1.25 && lat <= 6.75 && lng >= 99.6 && lng <= 104.6 && !(lat < 1.47 && lng >= 103.6 && lng <= 104.1);

/** Over this the owner is alerted (130 km/h). */
export const SPEEDING_MPS = 36.1;

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
