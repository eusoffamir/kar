import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';

import {
  Badge,
  Button,
  CarThumb,
  Card,
  Empty,
  ErrorText,
  Feature,
  type IconName,
  Ionicons,
  Loading,
  Row,
  Screen,
  Toggle,
  Txt,
} from '@/components/ui';
import { CustomerLine } from '@/components/trip-parts';
import { C, S } from '@/constants/theme';
import { api, keys, useAction, useMe } from '@/lib/api';
import { STATUS, carName, fmtDateTime, fmtRange } from '@/lib/format';
import { rm } from '@/lib/pricing';
import type { BookingDetail, CarWithOwner } from '@/lib/types';

export default function Host() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Loading />;
  if (!me?.is_owner) return <HostPitch signedIn={!!me} />;
  return <OwnerDashboard />;
}

function HostPitch({ signedIn }: { signedIn: boolean }) {
  return (
    <Screen>
      <Txt v="h1">Earn from your car</Txt>
      {[
        ['card-outline', 'Paid upfront'],
        ['camera-outline', 'Photos every trip'],
        ['location-outline', 'Always know where it is'],
        ['shield-checkmark-outline', 'Verified customers'],
      ].map(([icon, title]) => (
        <Feature key={title} icon={icon as IconName} title={title} />
      ))}
      <Button
        title={signedIn ? 'List your car' : 'Log in to list your car'}
        icon="add-circle"
        onPress={() => router.push(signedIn ? '/host/new-car' : '/sign-in')}
      />
      <Txt v="small" style={{ textAlign: 'center' }}>Free during the pilot</Txt>
    </Screen>
  );
}

function OwnerDashboard() {
  const cars = useQuery({ queryKey: keys.ownerCars, queryFn: () => api.ownerCars() });
  const bookings = useQuery({ queryKey: keys.ownerBookings, queryFn: () => api.ownerBookings() });
  const all = bookings.data ?? [];

  const needsAction = all.filter((b) => b.status === 'requested');
  const live = all.filter((b) => ['confirmed', 'active'].includes(b.status));
  const recent = all.filter((b) => ['returned', 'closed'].includes(b.status)).slice(0, 5);
  const earned = all
    .filter((b) => ['confirmed', 'active', 'returned', 'closed'].includes(b.status))
    .reduce((sum, b) => sum + b.owner_payout, 0);

  return (
    <Screen>
      <Txt v="h1">My cars</Txt>
      <Row>
        <Card style={{ flex: 1 }}>
          <Txt v="small">Earnings</Txt>
          <Txt v="h1">{rm(earned)}</Txt>
          <Txt v="small">Paid out weekly</Txt>
        </Card>
        <Card style={{ flex: 1 }}>
          <Txt v="small">Active trips</Txt>
          <Txt v="h1">{live.length}</Txt>
          <Txt v="small">{needsAction.length} awaiting you</Txt>
        </Card>
      </Row>
      <ErrorText error={cars.error ?? bookings.error} />

      {needsAction.length ? <Txt v="label">Needs your reply</Txt> : null}
      {needsAction.map((b) => <RequestCard key={b.id} b={b} />)}

      <Txt v="label">Cars</Txt>
      {cars.isLoading ? <Loading /> : null}
      {cars.data?.map((c) => <CarRow key={c.id} car={c} bookings={all} />)}
      <Button title="Add another car" icon="add" variant="outline" onPress={() => router.push('/host/new-car')} />

      {live.length ? <Txt v="label">Upcoming & on trip</Txt> : null}
      {live.map((b) => <BookingRow key={b.id} b={b} />)}

      {recent.length ? <Txt v="label">Recent returns</Txt> : null}
      {recent.map((b) => <BookingRow key={b.id} b={b} />)}

      {!cars.isLoading && !cars.data?.length ? (
        <Empty icon="car-outline" title="No cars yet" body="Takes 2 minutes." />
      ) : null}
    </Screen>
  );
}

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

function CarRow({ car, bookings }: { car: CarWithOwner; bookings: BookingDetail[] }) {
  const toggle = useAction((listed: boolean) => api.updateCar(car.id, { is_listed: listed }));
  const onTrip = bookings.find((b) => b.car_id === car.id && b.status === 'active');
  const next = bookings
    .filter((b) => b.car_id === car.id && b.status === 'confirmed')
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const status = !car.is_approved
    ? { label: 'Pending Kar approval', tone: 'warning' as const }
    : onTrip
      ? { label: 'On trip', tone: 'success' as const }
      : car.is_listed
        ? { label: 'Available', tone: 'success' as const }
        : { label: 'Hidden', tone: 'muted' as const };

  return (
    <Card onPress={() => router.push({ pathname: '/host/car/[id]', params: { id: car.id } })}>
      <Row gap={S.md}>
        <View style={{ width: 72 }}>
          <CarThumb car={car} height={56} radius={8} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h3" numberOfLines={1}>{carName(car)}</Txt>
          <Txt v="small">{car.plate}</Txt>
          <Txt v="small">{rm(car.price_per_hour)}/h · {rm(car.price_per_day)}/day</Txt>
        </View>
        <Badge label={status.label} tone={status.tone} />
      </Row>
      <View style={{ gap: 4 }}>
        <Row gap={6}>
          <Ionicons name="location" size={14} color={car.last_location ? C.success : C.muted} />
          <Txt v="small" style={{ flex: 1 }}>{car.last_location?.note ?? car.pickup_note}</Txt>
        </Row>
        {onTrip ? <Txt v="small">With {onTrip.customer.full_name} until {fmtDateTime(onTrip.ends_at)}</Txt> : null}
        {!onTrip && next ? <Txt v="small">Next: {fmtRange(next.starts_at, next.ends_at)}</Txt> : null}
      </View>
      {car.is_approved ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="small">Accepting bookings</Txt>
          <Toggle value={car.is_listed} onChange={(v) => toggle.mutate(v)} />
        </Row>
      ) : null}
      <Button title="Edit car" icon="create-outline" variant="outline" size="md" onPress={() => router.push({ pathname: '/host/car/[id]', params: { id: car.id } })} />
    </Card>
  );
}

function BookingRow({ b }: { b: BookingDetail }) {
  const st = STATUS[b.status];
  return (
    <Card onPress={() => router.push(`/host/booking/${b.id}`)}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h3">{carName(b.car)}</Txt>
        <Badge label={st.label} tone={st.tone} />
      </Row>
      <Txt v="small">{fmtRange(b.starts_at, b.ends_at)} · you earn {rm(b.owner_payout)}</Txt>
      <CustomerLine b={b} />
    </Card>
  );
}
