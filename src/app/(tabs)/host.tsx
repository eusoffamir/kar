import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { Field } from '@/components/car-form';

import {
  Badge,
  Button,
  CarThumb,
  Card,
  Empty,
  ErrorText,
  Feature,
  Grid,
  type IconName,
  Ionicons,
  Loading,
  Row,
  Screen,
  Toggle,
  Txt,
} from '@/components/ui';
import { FleetMap } from '@/components/live-tracking';
import { CustomerLine } from '@/components/trip-parts';
import { C, S } from '@/constants/theme';
import { api, keys, useAction, useMe } from '@/lib/api';
import { STATUS, carName, fmtDateTime, fmtRange, personName } from '@/lib/format';
import { POLICY } from '@/lib/policy';
import { rm } from '@/lib/pricing';
import { isInsured, type BookingDetail, type CarWithOwner, type Profile } from '@/lib/types';
import { useLayout } from '@/lib/use-layout';
import { useNow } from '@/lib/use-now';

export default function Host() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Loading />;
  if (!me?.is_owner) return <HostPitch signedIn={!!me} />;
  return <OwnerDashboard />;
}

function HostPitch({ signedIn }: { signedIn: boolean }) {
  // Someone who already applied sees where their application is.
  const { data: application } = useQuery({ queryKey: ['operator-docs'], queryFn: () => api.myOperatorDocs(), enabled: signedIn });
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
      {api.mode === 'demo' ? (
        <Button
          title={signedIn ? 'List your car' : 'Log in to list your car'}
          icon="add-circle"
          onPress={() => router.push(signedIn ? '/host/new-car' : '/sign-in')}
        />
      ) : (
        // Pilot: only licensed rental operators. They apply in the app with their permit and insurance, and
        // Kar's approval makes them an owner (no manual account setup).
        <>
          {application?.status === 'pending' ? (
            <Card>
              <Txt v="h3">Application received</Txt>
              <Txt v="small">Kar is checking {application.business_name}&apos;s permit and insurance, usually within a day.</Txt>
            </Card>
          ) : (
            <Button
              title={application?.status === 'rejected' ? 'Apply again' : 'Apply as a rental operator'}
              icon="document-text-outline"
              onPress={() => router.push(signedIn ? '/host/documents' : '/sign-in')}
            />
          )}
          {application?.status === 'rejected' && application.reviewer_note ? (
            <Txt v="small" color={C.danger}>Kar: {application.reviewer_note}</Txt>
          ) : null}
          <Txt v="small" style={{ textAlign: 'center' }}>
            During the pilot Kar works with licensed, insured rental operators. Have your SSM number, rental permit and insurance certificate ready.
          </Txt>
          {POLICY.supportWhatsApp ? (
            <Button
              title="Questions? WhatsApp Kar"
              icon="logo-whatsapp"
              variant="ghost"
              onPress={() => Linking.openURL(`https://wa.me/${POLICY.supportWhatsApp}?text=${encodeURIComponent('Hi Kar, I run a car rental and want to list on Kar.')}`)}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

function OwnerDashboard() {
  const { data: me } = useMe();
  const cars = useQuery({ queryKey: keys.ownerCars, queryFn: () => api.ownerCars() });
  const bookings = useQuery({ queryKey: keys.ownerBookings, queryFn: () => api.ownerBookings() });
  const all = bookings.data ?? [];

  const needsAction = all.filter((b) => b.status === 'requested');
  const live = all.filter((b) => ['confirmed', 'active'].includes(b.status));
  const recent = all.filter((b) => ['returned', 'closed'].includes(b.status)).slice(0, 5);
  // Earned = finished trips plus late-cancellation and no-show fees; upcoming = booked trips not yet returned.
  const sum = (list: BookingDetail[], amount: (b: BookingDetail) => number) => list.reduce((t, b) => t + amount(b), 0);
  const earned =
    sum(all.filter((b) => ['returned', 'closed'].includes(b.status)), (b) => b.owner_payout) +
    sum(all.filter((b) => ['cancelled', 'no_show'].includes(b.status)), (b) => b.cancellation_fee);
  const upcoming = sum(live, (b) => b.owner_payout);

  // Laptop: the live map stays in view on the right while the owner works through cars and bookings.
  const { split } = useLayout();
  const fleet = cars.data ? <FleetMap cars={cars.data} bookings={all} /> : null;

  const main = (
    <>
      <Row>
        <Card style={{ flex: 1 }}>
          <Txt v="small">Earned</Txt>
          <Txt v="h1">{rm(earned)}</Txt>
          <Txt v="small">{upcoming > 0 ? `+${rm(upcoming)} booked` : 'From finished trips'}</Txt>
        </Card>
        <Card style={{ flex: 1 }}>
          <Txt v="small">Active trips</Txt>
          <Txt v="h1">{live.length}</Txt>
          <Txt v="small">{needsAction.length} awaiting you</Txt>
        </Card>
      </Row>
      <ErrorText error={cars.error ?? bookings.error} />

      {me ? <OwnerSetup me={me} /> : null}

      {needsAction.length ? <Txt v="label">Needs your reply</Txt> : null}
      {needsAction.map((b) => <RequestCard key={b.id} b={b} />)}

      {split ? null : fleet}

      <Txt v="label">Cars</Txt>
      {cars.isLoading ? <Loading /> : null}
      <Grid min={320}>{cars.data?.map((c) => <CarRow key={c.id} car={c} bookings={all} />)}</Grid>
      <Button title="Add another car" icon="add" variant="outline" onPress={() => router.push('/host/new-car')} />

      {live.length ? <Txt v="label">Upcoming & on trip</Txt> : null}
      <Grid min={320}>{live.map((b) => <BookingRow key={b.id} b={b} />)}</Grid>

      {recent.length ? <Txt v="label">Recent returns</Txt> : null}
      <Grid min={320}>{recent.map((b) => <BookingRow key={b.id} b={b} />)}</Grid>

      {!cars.isLoading && !cars.data?.length ? (
        <Empty icon="car-outline" title="No cars yet" body="Takes 2 minutes." />
      ) : null}
    </>
  );

  return (
    <Screen wide={split}>
      <Txt v="h1">My cars</Txt>
      {split ? (
        <View style={{ flexDirection: 'row', gap: 32, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 24 }}>{main}</View>
          <View style={[{ width: 440 }, Platform.OS === 'web' && ({ position: 'sticky', top: 24 } as object)]}>{fleet}</View>
        </View>
      ) : (
        main
      )}
    </Screen>
  );
}

const DAY = 86_400_000;

/**
 * What an owner still needs before renters can book: a business name, then the rental permit and insurance
 * (Kar approves cars only for insured operators). Also warns 30 days before the insurance expires.
 */
function OwnerSetup({ me }: { me: Profile }) {
  const { data: docs, isLoading } = useQuery({ queryKey: ['operator-docs'], queryFn: () => api.myOperatorDocs() });
  const [name, setName] = useState('');
  const saveName = useAction(() => api.updateMyName(name));
  const now = useNow();
  if (isLoading) return null;

  if (!me.full_name.trim() && !docs) {
    return (
      <Card style={{ borderColor: C.warning }}>
        <Txt v="h3">Add your business name</Txt>
        <Txt v="small">Renters see this on your cars and bookings.</Txt>
        <Field label="Business name" value={name} onChange={setName} placeholder="Siti Car Rental" maxLength={80} />
        <Button title="Save" size="md" variant="dark" onPress={() => saveName.mutate(undefined)} loading={saveName.isPending} />
        <ErrorText error={saveName.error} />
      </Card>
    );
  }

  const open = () => router.push('/host/documents');
  const insured = isInsured(me);
  const daysLeft = me.operator_insured_until ? Math.ceil((new Date(me.operator_insured_until).getTime() - now) / DAY) : null;

  if (!docs || docs.status === 'rejected' || (docs.status === 'approved' && !insured)) {
    const title = !docs ? 'Send your permit and insurance' : docs.status === 'rejected' ? 'Documents not approved' : 'Your insurance has expired';
    return (
      <Card style={{ borderColor: C.danger }}>
        <Txt v="h3">{title}</Txt>
        <Txt v="small">
          {!docs
            ? 'Kar approves cars only for licensed, insured operators. Takes 2 minutes.'
            : docs.status === 'rejected'
              ? `Kar: ${docs.reviewer_note ?? 'please send clearer documents.'}`
              : 'Your cars are hidden until Kar approves your renewed insurance.'}
        </Txt>
        <Button title={!docs ? 'Send documents' : 'Send new documents'} size="md" onPress={open} />
      </Card>
    );
  }
  if (docs.status === 'pending') {
    return (
      <Card>
        <Txt v="h3">Kar is checking your documents</Txt>
        <Txt v="small">Usually within a day. Your cars can be approved once this is done.</Txt>
      </Card>
    );
  }
  if (daysLeft != null && daysLeft <= 30) {
    return (
      <Card style={{ borderColor: C.warning }}>
        <Txt v="h3">Insurance expires in {daysLeft} day{daysLeft === 1 ? '' : 's'}</Txt>
        <Txt v="small">Send the renewal before then, or your cars are hidden automatically.</Txt>
        <Button title="Send renewed insurance" size="md" variant="outline" onPress={open} />
      </Card>
    );
  }
  return null;
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
  const status = car.rejected_at
    ? { label: 'Not approved, contact Kar', tone: 'muted' as const }
    : !car.is_approved
    ? { label: 'Pending Kar approval', tone: 'warning' as const }
    : onTrip
      ? { label: 'On trip', tone: 'success' as const }
      : car.is_listed
        ? { label: 'Available', tone: 'success' as const }
        : { label: 'Hidden', tone: 'muted' as const };

  return (
    <Card onPress={() => router.push({ pathname: '/host/car/[id]', params: { id: car.id } })}>
      <Row gap={S.md} style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 88 }}>
          <CarThumb car={car} height={66} radius={8} />
        </View>
        {/* Status sits under the details so a long badge never squeezes the car name. */}
        <View style={{ flex: 1, gap: 2, alignItems: 'flex-start' }}>
          <Txt v="h3" numberOfLines={1}>{carName(car)} {car.year}</Txt>
          <Txt v="small" numberOfLines={1}>{car.plate} · {rm(car.price_per_hour)}/h · {rm(car.price_per_day)}/day</Txt>
          <View style={{ marginTop: 4 }}>
            <Badge label={status.label} tone={status.tone} />
          </View>
        </View>
      </Row>
      <View style={{ gap: 4 }}>
        <Row gap={6}>
          <Ionicons name="location" size={14} color={car.last_location ? C.success : C.muted} />
          <Txt v="small" style={{ flex: 1 }}>{car.last_location?.note ?? car.pickup_note}</Txt>
        </Row>
        {onTrip ? <Txt v="small">With {personName(onTrip.customer)} until {fmtDateTime(onTrip.ends_at)}</Txt> : null}
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
        <Txt v="h3" numberOfLines={1} style={{ flex: 1 }}>{carName(b.car)}</Txt>
        <Badge label={st.label} tone={st.tone} />
      </Row>
      <Txt v="small">{fmtRange(b.starts_at, b.ends_at)} · you earn {rm(b.owner_payout)}</Txt>
      <CustomerLine b={b} />
    </Card>
  );
}
