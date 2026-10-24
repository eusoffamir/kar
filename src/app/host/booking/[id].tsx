import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { CarMap } from '@/components/car-map';
import { ClaimsList, DepositCard, ReportDamage, useClaims } from '@/components/claims';
import { ContactButtons, CustomerLine, PhotoCompare } from '@/components/trip-parts';
import { Badge, Button, Card, Divider, ErrorText, Ionicons, Line, Loading, Row, Screen, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api, keys, useAction } from '@/lib/api';
import { useNow } from '@/lib/use-now';
import { STATUS, carName, fmtDateTime, fmtRange, personName } from '@/lib/format';
import { canMarkNoShow, lateExtraOwed, POLICY } from '@/lib/policy';
import { rm } from '@/lib/pricing';
import type { BookingDetail, IncidentKind } from '@/lib/types';

const INCIDENT_LABEL: Record<IncidentKind, string> = {
  accident: 'Accident',
  breakdown: 'Breakdown',
  cant_find: "Can't find car / not ready",
  other: 'Other issue',
};

// Owner's view of one booking: who has the car, evidence, deposit, claims, issues and actions.
export default function HostBooking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: b, isLoading, error } = useQuery({ queryKey: keys.booking(id), queryFn: () => api.getBooking(id) });
  const { data: incidents } = useQuery({ queryKey: ['incidents', id], queryFn: () => api.incidentsFor(id) });
  // Takes the id as an argument: `b` is undefined until the booking loads.
  const block = useAction((customerId: string) => api.blockCustomer(customerId, 'Blocked by owner after trip'));
  const { data: claims } = useClaims(id);
  const claimFees = (claims ?? []).filter((c) => c.status === 'approved').reduce((t, c) => t + c.handling_fee, 0);
  const now = useNow();

  if (isLoading) return <Loading />;
  if (!b) return <Screen edges={[]}><ErrorText error={error ?? 'Booking not found'} /></Screen>;

  const st = STATUS[b.status];
  const returned = ['returned', 'closed'].includes(b.status);
  const overdueHours = b.status === 'active' ? (now - new Date(b.ends_at).getTime()) / 3_600_000 : 0;

  return (
    <Screen edges={['bottom']}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="h2">{carName(b.car)}</Txt>
          <Badge label={st.label} tone={st.tone} />
        </Row>
        <View style={{ gap: 4 }}>
          <Txt v="small">{fmtRange(b.starts_at, b.ends_at)}</Txt>
          {b.picked_up_at ? <Txt v="small">Picked up {fmtDateTime(b.picked_up_at)}</Txt> : null}
          {b.returned_at ? <Txt v="small">Returned {fmtDateTime(b.returned_at)}</Txt> : null}
        </View>
        <CustomerLine b={b} />
        <ContactButtons bookingId={b.id} />
        {b.status === 'active' || returned ? (
          <Button
            title={b.status === 'active' ? 'See where the car is now' : 'See the trip route'}
            icon="radio-outline"
            variant={b.status === 'active' ? 'primary' : 'outline'}
            size="md"
            onPress={() => router.push({ pathname: '/host/track/[id]', params: { id: b.id } })}
          />
        ) : null}
      </Card>

      {['confirmed', 'active'].includes(b.status) ? <RenterCheck b={b} /> : null}

      {overdueHours >= 2 ? (
        <Card style={{ borderColor: C.danger, backgroundColor: C.dangerSoft }}>
          <Row><Ionicons name="alarm" size={20} color={C.danger} /><Txt v="h3">Overdue by {Math.floor(overdueHours)}h</Txt></Row>
          <Txt v="small">Call the customer now. No reply after 6h overdue: make a police report and tell Kar.</Txt>
        </Card>
      ) : null}

      {incidents?.map((inc) => (
        <Card key={inc.id} style={{ borderColor: C.danger }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="h3">{INCIDENT_LABEL[inc.kind]}</Txt>
            <Badge label="Issue reported" tone="danger" />
          </Row>
          {inc.note ? <Txt>{inc.note}</Txt> : null}
          <Txt v="tiny">{fmtDateTime(inc.created_at)}</Txt>
          {inc.photos.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
              {inc.photos.map((uri) => (
                <Image key={uri} source={{ uri }} style={{ width: 96, height: 76, borderRadius: R.md }} contentFit="cover" />
              ))}
            </ScrollView>
          ) : null}
          {inc.lat != null && inc.lng != null ? (
            <CarMap center={{ lat: inc.lat, lng: inc.lng }} zoom={16} height={150} pins={[{ id: inc.id, lat: inc.lat, lng: inc.lng, label: '!', kind: 'pickup' }]} />
          ) : null}
        </Card>
      ))}

      {returned ? <ParkedCard carId={b.car_id} /> : null}
      {b.late_fee_due > b.deposit && returned ? <LateExtraCard b={b} /> : null}

      <ReportDamage b={b} />
      {returned ? <ClaimsList b={b} role="owner" /> : null}
      {['confirmed', 'active', 'returned', 'closed'].includes(b.status) ? <DepositCard b={b} role="owner" /> : null}

      <Card>
        <Txt v="label">Photo evidence</Txt>
        {b.photos.length ? <PhotoCompare photos={b.photos} /> : <Txt v="small">No photos yet</Txt>}
      </Card>

      <Card>
        <Txt v="label">Your earnings</Txt>
        <Line label="Trip price" value={rm(b.trip_amount)} />
        <Line label="Kar commission" value={b.owner_commission ? `-${rm(b.owner_commission)}` : 'Free (pilot)'} />
        <Divider />
        {b.deposit_to_owner ? <Line label="From the deposit (late fee, damage)" value={`+${rm(b.deposit_to_owner)}`} /> : null}
        {claimFees > 0 ? <Line label="Claim handling fee" value={`-${rm(claimFees)}`} /> : null}
        <Line label="Payout" value={rm(b.owner_payout + (b.deposit_to_owner ?? 0) - claimFees)} strong />
        {b.late_fee_due > 0 ? <Line label="Late return fee" value={rm(b.late_fee_due)} /> : null}
        {b.cancellation_fee > 0 ? <Line label="Late cancellation / no-show" value={rm(b.cancellation_fee)} /> : null}
      </Card>

      {canMarkNoShow(b, now) ? <NoShow b={b} /> : null}
      {['requested', 'confirmed'].includes(b.status) ? <OwnerCancel b={b} /> : null}

      {returned ? (
        <Card>
          <Txt v="label">Problem with this customer?</Txt>
          <Txt v="small">They can&apos;t book your cars again.</Txt>
          {block.isSuccess ? (
            <Txt v="small" color={C.danger}>Customer blocked.</Txt>
          ) : (
            <Button title="Block this customer" icon="ban" variant="danger" loading={block.isPending} onPress={() => block.mutate(b.customer_id)} />
          )}
          <ErrorText error={block.error} />
        </Card>
      ) : null}
    </Screen>
  );
}

/** The renter's ID-checked selfie, so the owner can see that the right person collects the car. */
function RenterCheck({ b }: { b: BookingDetail }) {
  const { data: selfie, isLoading } = useQuery({ queryKey: ['selfie', b.id], queryFn: () => api.customerSelfie(b.id) });
  if (isLoading) return null;
  return (
    <Card>
      <Row gap={S.lg} style={{ alignItems: 'flex-start' }}>
        {selfie ? (
          <Image source={{ uri: selfie }} style={{ width: 88, height: 110, borderRadius: R.md, backgroundColor: C.soft }} contentFit="cover" />
        ) : (
          <View style={{ width: 88, height: 110, borderRadius: R.md, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person-outline" size={32} color={C.muted} />
          </View>
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <Txt v="label">Who collects the car</Txt>
          <Txt v="h3">{personName(b.customer)}</Txt>
          <Txt v="small">
            {selfie
              ? "Selfie checked against their IC by Kar. Only hand over the car to this person, and only once your Kar app shows \"On trip\" (they start it with their location on). If someone else turns up, don't hand it over and tell Kar."
              : 'Kar is still checking their ID. They can only start the trip once it is approved.'}
          </Txt>
        </View>
      </Row>
    </Card>
  );
}

function NoShow({ b }: { b: BookingDetail }) {
  const mark = useAction(() => api.markNoShow(b.id));
  return (
    <Card>
      <Txt v="label">Customer didn&apos;t show up?</Txt>
      <Txt v="small">You keep {rm(Math.round(b.trip_amount * POLICY.lateCancelRate * 100) / 100)} (50% of the trip). The car is free again.</Txt>
      <Button title="Mark no-show" variant="outline" size="md" loading={mark.isPending} onPress={() => mark.mutate(undefined)} />
      <ErrorText error={mark.error} />
    </Card>
  );
}

function OwnerCancel({ b }: { b: BookingDetail }) {
  const [confirming, setConfirming] = useState(false);
  const cancel = useAction(() => api.ownerCancelBooking(b.id, 'Cancelled by owner'));
  if (!confirming) return <Button title="Cancel this booking" variant="ghost" onPress={() => setConfirming(true)} />;
  return (
    <Card>
      <Txt v="h3">Cancel this booking?</Txt>
      <Txt v="small">
        The customer gets a full refund and you get a strike. {POLICY.ownerStrikeLimit} strikes hide all your cars.
      </Txt>
      <Row>
        <Button title="Keep" variant="outline" style={{ flex: 1 }} onPress={() => setConfirming(false)} />
        <Button title="Cancel" variant="danger" style={{ flex: 1 }} loading={cancel.isPending} onPress={() => cancel.mutate(undefined)} />
      </Row>
      <ErrorText error={cancel.error} />
    </Card>
  );
}

function ParkedCard({ carId }: { carId: string }) {
  const { data: car } = useQuery({ queryKey: keys.car(carId), queryFn: () => api.getCar(carId) });
  const l = car?.last_location;
  if (!l) return null;
  return (
    <Card>
      <Txt v="label">Where it was left</Txt>
      <CarMap center={l} zoom={17} height={170} pins={[{ id: 'l', lat: l.lat, lng: l.lng, label: 'Parked', kind: 'parked' }]} />
      <Txt>{l.note}</Txt>
      <Txt v="small">Pinned by the customer at {fmtDateTime(l.updated_at)}</Txt>
    </Card>
  );
}


/** Late fee (above any older Kar-held deposit): the renter pays the owner directly; the owner confirms so the renter can book again. */
function LateExtraCard({ b }: { b: BookingDetail }) {
  const paid = useAction(() => api.markLateExtraPaid(b.id));
  const owed = lateExtraOwed(b);
  if (!owed) {
    return (
      <Card>
        <Row><Ionicons name="checkmark-circle" size={20} color={C.success} /><Txt v="h3">Late fee paid</Txt></Row>
        <Txt v="small">You confirmed {personName(b.customer)} paid you {rm(b.late_fee_due - b.deposit)}.</Txt>
      </Card>
    );
  }
  return (
    <Card style={{ borderColor: C.danger }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h3">{personName(b.customer)} owes you</Txt>
        <Txt v="h2" color={C.danger}>{rm(owed)}</Txt>
      </Row>
      <Txt v="small">
        {b.deposit > 0
          ? `The late fee was ${rm(b.late_fee_due)}. Kar pays you the ${rm(b.deposit)} deposit part; the rest is between you and the renter.`
          : `Late return fee. The renter pays you directly; Kar does not collect it.`}{' '}
        They can&apos;t book on Kar again until you confirm they paid.
      </Txt>
      <Button title="They paid me" icon="checkmark" size="md" onPress={() => paid.mutate(undefined)} loading={paid.isPending} />
      <ErrorText error={paid.error} />
    </Card>
  );
}
