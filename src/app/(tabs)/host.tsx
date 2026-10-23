import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CarMap } from '@/components/car-map';
import { liveStatus, useLatestPositions } from '@/components/live-tracking';
import { MapTypeToggle } from '@/components/map-type-toggle';
import type { MapPin } from '@/components/map-pins';
import { CustomerLine } from '@/components/trip-parts';
import {
  Badge,
  Button,
  CarThumb,
  Card,
  Empty,
  ErrorText,
  Ionicons,
  Loading,
  Row,
  Screen,
  Toggle,
  Txt,
} from '@/components/ui';
import { C, R, S, shadow } from '@/constants/theme';
import { api, keys, useAction, useMe } from '@/lib/api';
import { carName, fmtDateTime, fmtRange, personName } from '@/lib/format';
import { POLICY } from '@/lib/policy';
import { rm } from '@/lib/pricing';
import { isInsured, type BookingDetail, type CarWithOwner, type Profile, type TripLocation } from '@/lib/types';
import { useLayout } from '@/lib/use-layout';
import { useNow } from '@/lib/use-now';

export default function Host() {
  const { data: me, isLoading } = useMe();
  // Someone who registered a car sees it on the map, even while Kar is still checking them.
  const cars = useQuery({ queryKey: keys.ownerCars, queryFn: () => api.ownerCars(), enabled: !!me });
  if (isLoading || cars.isLoading) return <Loading />;
  if (!me?.is_owner && !cars.data?.length) return <HostPitch signedIn={!!me} />;
  return <OwnerDashboard />;
}

/** Not hosting yet: a picture, one line of why, and one button that starts "Register your car". */
function HostPitch({ signedIn }: { signedIn: boolean }) {
  return (
    <Screen>
      <View style={styles.hero}>
        <View style={[styles.heroBubble, { top: 20, left: 24 }]}>
          <Ionicons name="cash-outline" size={17} color={C.brand} />
        </View>
        <View style={[styles.heroBubble, { top: 30, right: 28 }]}>
          <Ionicons name="calendar-outline" size={17} color={C.brand} />
        </View>
        <Ionicons name="car-sport" size={76} color="#fff" />
        <View style={styles.heroRoad} />
      </View>

      <View style={{ gap: S.sm, alignItems: 'center' }}>
        <Txt v="h1" style={{ textAlign: 'center' }}>Have an idle car?</Txt>
        <Txt style={{ textAlign: 'center', color: C.muted }}>Let UTP students rent it on the days you don&apos;t use it.</Txt>
      </View>

      <Button
        title={signedIn ? 'Register your car' : 'Log in to register your car'}
        onPress={() => router.push(signedIn ? '/host/register' : '/sign-in')}
      />

      {POLICY.supportWhatsApp ? (
        <Button
          title="Questions? WhatsApp Kar"
          icon="logo-whatsapp"
          variant="ghost"
          onPress={() => Linking.openURL(`https://wa.me/${POLICY.supportWhatsApp}?text=${encodeURIComponent('Hi Kar, I want to list my car on Kar.')}`)}
        />
      ) : null}
    </Screen>
  );
}

/** What each car is doing, for its pin and its detail panel. */
type CarState = {
  car: CarWithOwner;
  requests: BookingDetail[];
  trip: BookingDetail | undefined;
  upcoming: BookingDetail[];
  status: { label: string; tone: 'success' | 'warning' | 'muted' | 'brand' | 'danger'; kind: NonNullable<MapPin['kind']> };
  at: { lat: number; lng: number };
};

function carStates(cars: CarWithOwner[], bookings: BookingDetail[], latest: Map<string, TripLocation>, now: number): CarState[] {
  return cars.map((car) => {
    const mine = bookings.filter((b) => b.car_id === car.id);
    const requests = mine.filter((b) => b.status === 'requested');
    const trip = mine.find((b) => b.status === 'active');
    const upcoming = mine.filter((b) => b.status === 'confirmed').sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const parked = car.last_location ?? { lat: car.pickup_lat, lng: car.pickup_lng };
    const live = trip ? liveStatus(latest.get(trip.id), now) : null;
    const at = live && live.kind !== 'waiting' ? { lat: live.fix.lat, lng: live.fix.lng } : parked;
    const status: CarState['status'] = requests.length
      ? { label: `${requests.length} request${requests.length > 1 ? 's' : ''}`, tone: 'warning', kind: 'request' }
      : trip
        ? live?.kind === 'lost'
          ? { label: 'Signal lost', tone: 'danger', kind: 'stale' }
          : { label: 'On trip', tone: 'success', kind: 'live' }
        : car.rejected_at
          ? { label: 'Not approved', tone: 'muted', kind: 'stale' }
          : !car.is_approved
            ? { label: 'Awaiting Kar', tone: 'muted', kind: 'stale' }
            : !car.is_listed
              ? { label: 'Hidden', tone: 'muted', kind: 'stale' }
              : { label: 'Idle', tone: 'brand', kind: 'parked' };
    return { car, requests, trip, upcoming, status, at };
  });
}

/**
 * My cars, map first: every car is a pin with its name and status (idle, on trip, request waiting). Tapping a car
 * opens its details: requests to answer, the trip in progress, the schedule, and its settings.
 */
function OwnerDashboard() {
  const { data: me } = useMe();
  const cars = useQuery({ queryKey: keys.ownerCars, queryFn: () => api.ownerCars() });
  const bookings = useQuery({ queryKey: keys.ownerBookings, queryFn: () => api.ownerBookings(), refetchInterval: 30_000 });
  const all = bookings.data ?? [];
  const latest = useLatestPositions(all.filter((b) => b.status === 'active'));
  const now = useNow(15_000);
  const [selected, setSelected] = useState<string | null>(null);
  const { split } = useLayout();
  const insets = useSafeAreaInsets();

  if (cars.isLoading) return <Loading />;
  const states = carStates(cars.data ?? [], all, latest, now);
  const picked = states.find((s) => s.car.id === selected) ?? null;
  const waiting = states.filter((s) => s.requests.length);
  const requestCount = waiting.reduce((n, s) => n + s.requests.length, 0);

  // Small print at the bottom: earned = finished trips plus late-cancel / no-show fees; booked = not yet driven.
  const sum = (list: BookingDetail[], amount: (b: BookingDetail) => number) => list.reduce((t, b) => t + amount(b), 0);
  const earned =
    sum(all.filter((b) => ['returned', 'closed'].includes(b.status)), (b) => b.owner_payout) +
    sum(all.filter((b) => ['cancelled', 'no_show'].includes(b.status)), (b) => b.cancellation_fee);
  const booked = sum(all.filter((b) => ['confirmed', 'active'].includes(b.status)), (b) => b.owner_payout);
  const onTrip = states.filter((s) => s.trip).length;

  const pins: MapPin[] = states.map((s) => ({ id: s.car.id, lat: s.at.lat, lng: s.at.lng, label: `${s.car.model}, ${s.status.label.toLowerCase()}`, kind: s.status.kind }));
  const center = states[0]?.at ?? { lat: 4.3845, lng: 100.967 };
  const panel = picked ? <CarPanel s={picked} onClose={() => setSelected(null)} /> : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, flexDirection: split ? 'row' : 'column' }}>
      <View style={{ flex: 1 }}>
        {states.length ? (
          <CarMap
            center={center}
            pins={pins}
            height="fill"
            rounded={false}
            labels
            hideToggle
            framePadding={{ top: insets.top + 150, bottom: 140 }}
            selectedId={selected}
            onSelect={setSelected}
            onDeselect={() => setSelected(null)}
          />
        ) : (
          <Empty icon="car-outline" title="No cars yet" body="Add your first car. Takes 2 minutes." action={<Button title="Add a car" icon="add" onPress={() => router.push('/host/new-car')} />} />
        )}

        {/* Floating top: map switch, Add car, and only what needs the owner right now. */}
        <View style={[styles.top, { paddingTop: insets.top + S.sm }]} pointerEvents="box-none">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }} pointerEvents="box-none">
            <MapTypeToggle inline />
            <Pressable onPress={() => router.push('/host/new-car')} style={({ pressed }) => [styles.addCar, shadow, pressed && { opacity: 0.85 }]} accessibilityRole="button">
              <Ionicons name="add" size={20} color="#fff" />
              <Txt v="h3" color="#fff">Add car</Txt>
            </Pressable>
          </View>
          {requestCount ? (
            <Pressable onPress={() => setSelected(waiting[0].car.id)} style={[styles.alert, shadow]}>
              <Ionicons name="notifications" size={16} color="#fff" />
              <Txt v="h3" color="#fff" style={{ flex: 1 }}>
                {requestCount} request{requestCount > 1 ? 's' : ''} need{requestCount > 1 ? '' : 's'} your reply
              </Txt>
              <Ionicons name="chevron-forward" size={16} color="#fff" />
            </Pressable>
          ) : null}
          {me ? <SetupBanner me={me} /> : null}
          <ErrorText error={cars.error ?? bookings.error} />
        </View>

        {/* Bottom: the car panel on a phone, otherwise one line of earnings. */}
        {!split && panel ? (
          <View style={[styles.sheet, shadow, { paddingBottom: insets.bottom }]}>{panel}</View>
        ) : (
          <View style={[styles.bottom, shadow]}>
            <Stat label="Earned" value={rm(earned)} />
            <View style={styles.statLine} />
            <Stat label="Booked" value={rm(booked)} />
            <View style={styles.statLine} />
            <Stat label="On trip" value={`${onTrip}/${states.length}`} />
          </View>
        )}
      </View>
      {split && panel ? <View style={styles.side}>{panel}</View> : null}
    </View>
  );
}

/**
 * One slim line over the map when the owner still has setup to do (business details, permit and insurance,
 * expiring insurance). Tapping opens the operator documents screen, which also sets the business name.
 */
function SetupBanner({ me }: { me: Profile }) {
  const { data: docs, isLoading } = useQuery({ queryKey: ['operator-docs'], queryFn: () => api.myOperatorDocs() });
  const now = useNow();
  // Students who registered a car have no business documents to send.
  if (isLoading || (!me.is_owner && !docs)) return null;
  const insured = isInsured(me);
  const daysLeft = me.operator_insured_until ? Math.ceil((new Date(me.operator_insured_until).getTime() - now) / DAY) : null;
  const text =
    docs?.status === 'pending' ? 'Kar is checking your documents'
    : docs?.status === 'rejected' ? 'Documents not approved: send new ones'
    : insured ? (daysLeft != null && daysLeft <= 30 ? `Insurance expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : null)
    : docs ? 'Insurance expired: your cars are hidden'
    : !me.full_name.trim() ? 'Add your business details'
    : 'Send your permit and insurance';
  if (!text) return null;
  const urgent = !insured && docs?.status !== 'pending';
  return (
    <Pressable onPress={() => router.push('/host/documents')} style={[styles.banner, shadow, urgent && { backgroundColor: C.dangerSoft }]}>
      <Ionicons name={docs?.status === 'pending' ? 'time-outline' : 'document-text-outline'} size={16} color={urgent ? C.danger : C.ink} />
      <Txt v="small" color={urgent ? C.danger : C.ink} style={{ flex: 1, fontWeight: '600' }}>{text}</Txt>
      <Ionicons name="chevron-forward" size={16} color={urgent ? C.danger : C.muted} />
    </Pressable>
  );
}

/** One figure in the bottom bar: small label, big number. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Txt v="tiny">{label}</Txt>
      <Txt v="h2">{value}</Txt>
    </View>
  );
}

/** One car: requests first (they expire in 2 hours), then the trip in progress, the schedule and settings. */
function CarPanel({ s, onClose }: { s: CarState; onClose: () => void }) {
  const { car, requests, trip, upcoming, status } = s;
  const toggle = useAction((listed: boolean) => api.updateCar(car.id, { is_listed: listed }));
  return (
    <ScrollView contentContainerStyle={{ padding: S.xl, gap: S.lg }}>
      <Row gap={S.md}>
        <View style={{ width: 64 }}>
          <CarThumb car={car} height={48} radius={8} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h3" numberOfLines={1}>{carName(car)}</Txt>
          <Txt v="small" numberOfLines={1}>{car.plate}</Txt>
        </View>
        <Badge label={status.label} tone={status.tone} />
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={C.ink} />
        </Pressable>
      </Row>

      {requests.map((b) => <RequestCard key={b.id} b={b} />)}

      {trip ? (
        <Card onPress={() => router.push({ pathname: '/host/track/[id]', params: { id: trip.id } })}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="h3">With {personName(trip.customer)}</Txt>
            <Ionicons name="radio-outline" size={18} color={C.success} />
          </Row>
          <Txt v="small">Back by {fmtDateTime(trip.ends_at)}. Tap to see it live.</Txt>
        </Card>
      ) : null}

      <View style={{ gap: S.sm }}>
        <Txt v="label">Schedule</Txt>
        {upcoming.length ? (
          upcoming.slice(0, 5).map((b) => (
            <Pressable key={b.id} onPress={() => router.push(`/host/booking/${b.id}`)} style={styles.slot}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="h3">{fmtRange(b.starts_at, b.ends_at)}</Txt>
                <Txt v="small">{personName(b.customer)}, you earn {rm(b.owner_payout)}</Txt>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.muted} />
            </Pressable>
          ))
        ) : (
          <Txt v="small">No upcoming bookings.</Txt>
        )}
      </View>

      {car.is_approved ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt>Accepting bookings</Txt>
          <Toggle value={car.is_listed} onChange={(v) => toggle.mutate(v)} />
        </Row>
      ) : (
        <Txt v="small">
          {car.rejected_at
            ? 'Kar did not approve this car. Edit the details, or contact Kar.'
            : `Kar is checking this car before renters can book it.${car.review_flags?.length ? ` Reason: ${car.review_flags.join(', ')}.` : ''}`}
        </Txt>
      )}
      <ErrorText error={toggle.error} />
      <Button title="Edit car" icon="create-outline" variant="outline" size="md" onPress={() => router.push({ pathname: '/host/car/[id]', params: { id: car.id } })} />
    </ScrollView>
  );
}

const DAY = 86_400_000;

function RequestCard({ b }: { b: BookingDetail }) {
  const respond = useAction((accept: boolean) => api.respondToBooking(b.id, accept));
  return (
    <Card style={{ borderColor: C.warning }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h3">{carName(b.car)}</Txt>
        <Txt v="h3">{rm(b.owner_payout)}</Txt>
      </Row>
      <Txt v="small">{fmtRange(b.starts_at, b.ends_at)}</Txt>
      <CustomerLine b={b} />
      <Row>
        <Button title="Decline" variant="danger" style={{ flex: 1 }} onPress={() => respond.mutate(false)} disabled={respond.isPending} />
        <Button title="Accept" icon="checkmark" style={{ flex: 2 }} onPress={() => respond.mutate(true)} loading={respond.isPending} />
      </Row>
      <ErrorText error={respond.error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { height: 160, borderRadius: R.xl, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heroBubble: { position: 'absolute', width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  heroRoad: { position: 'absolute', bottom: 42, width: '60%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: S.lg, gap: S.sm },
  addCar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.brand, borderRadius: R.pill, paddingLeft: S.md, paddingRight: S.lg, paddingVertical: 10 },
  statLine: { width: 1, alignSelf: 'stretch', backgroundColor: C.line },
  banner: { flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.bg, borderRadius: R.lg, paddingHorizontal: S.lg, paddingVertical: S.md },
  alert: { flexDirection: 'row', alignItems: 'center', gap: S.sm, backgroundColor: C.warning, borderRadius: R.lg, paddingHorizontal: S.lg, paddingVertical: S.md },
  bottom: { position: 'absolute', left: S.lg, right: S.lg, bottom: S.lg, flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: R.xl, paddingVertical: S.md },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '62%', backgroundColor: C.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl },
  side: { width: 400, borderLeftWidth: 1, borderLeftColor: C.line, backgroundColor: C.bg },
  slot: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.sm, borderBottomWidth: 1, borderBottomColor: C.line },
});
