import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { PhotoCompare } from '@/components/trip-parts';
import { Badge, Button, CarThumb, Card, Empty, ErrorText, Loading, Row, Screen, Section, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api, useAction, useMe } from '@/lib/api';
import { STATUS, carName, fmtDateTime, fmtRange } from '@/lib/format';
import { rm } from '@/lib/pricing';
import type { BookingDetail, CarWithOwner, Claim, OwnerSummary, PayoutDue, PendingRefund, VerificationReview } from '@/lib/types';

/** Kar team: ID checks, new listings, disputed claims, and the refunds and payouts to send by bank transfer. */
export default function Admin() {
  const { data: me, isLoading } = useMe();
  const enabled = !!me?.is_admin;
  const ids = useQuery({ queryKey: ['admin', 'ids'], queryFn: () => api.adminPendingVerifications(), enabled });
  const cars = useQuery({ queryKey: ['admin', 'cars'], queryFn: () => api.adminPendingCars(), enabled });
  const claims = useQuery({ queryKey: ['admin', 'claims'], queryFn: () => api.adminDisputedClaims(), enabled });
  const refunds = useQuery({ queryKey: ['admin', 'refunds'], queryFn: () => api.adminPendingRefunds(), enabled });
  const payouts = useQuery({ queryKey: ['admin', 'payouts'], queryFn: () => api.adminPayoutsDue(), enabled });
  const sendRefunds = useAction(() => api.processRefunds());
  const owners = useQuery({ queryKey: ['admin', 'owners'], queryFn: () => api.adminOwners(), enabled });

  if (isLoading) return <Loading />;
  if (!me?.is_admin) {
    return (
      <Screen edges={['bottom']}>
        <Empty icon="lock-closed-outline" title="Kar team only" />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <Section title={`ID checks (${ids.data?.length ?? 0})`}>
        <ErrorText error={ids.error} />
        {ids.data?.length === 0 ? <Txt v="small">Nothing waiting.</Txt> : null}
        {ids.data?.map((v) => <IdReview key={v.id} v={v} />)}
      </Section>
      <Section title={`Cars to approve (${cars.data?.length ?? 0})`}>
        <ErrorText error={cars.error} />
        {cars.data?.length === 0 ? <Txt v="small">Nothing waiting.</Txt> : null}
        {cars.data?.map((c) => <CarReview key={c.id} car={c} />)}
      </Section>
      <Section title={`Disputed claims (${claims.data?.length ?? 0})`}>
        <ErrorText error={claims.error} />
        {claims.data?.length === 0 ? <Txt v="small">Nothing waiting.</Txt> : null}
        {claims.data?.map((c) => <ClaimReview key={c.id} c={c} />)}
      </Section>
      <Section title={`Refunds to send (${refunds.data?.length ?? 0})`}>
        <ErrorText error={refunds.error} />
        {refunds.data?.length === 0 ? <Txt v="small">Nothing waiting.</Txt> : null}
        {refunds.data?.length ? (
          <>
            <Txt v="small">Refunds go back through CHIP automatically. If one is stuck, retry here, or send it by bank transfer and record the reference.</Txt>
            <Button title="Send refunds now" icon="refresh" variant="dark" onPress={() => sendRefunds.mutate(undefined)} loading={sendRefunds.isPending} />
            {sendRefunds.data ? <Txt v="small">Sent {sendRefunds.data.refunded}, failed {sendRefunds.data.failed}.</Txt> : null}
            <ErrorText error={sendRefunds.error} />
          </>
        ) : null}
        {refunds.data?.map((r) => <RefundRow key={r.id} r={r} />)}
      </Section>
      <Section title={`Owners (${owners.data?.length ?? 0})`}>
        <Txt v="small">Only licensed rental operators you have vetted. They log in to Kar once with their email, then you add them here.</Txt>
        <AddOwner />
        <ErrorText error={owners.error} />
        {owners.data?.map((o) => <OwnerRow key={o.id} o={o} />)}
      </Section>
      <Section title={`Owner payouts due (${payouts.data?.length ?? 0})`} last>
        <Txt v="small">Finished trips after the 48-hour claim window, plus cancellation and no-show fees.</Txt>
        <ErrorText error={payouts.error} />
        {payouts.data?.length === 0 ? <Txt v="small">Nothing due.</Txt> : null}
        {payouts.data?.map((p) => <PayoutRow key={p.owner_id} p={p} />)}
      </Section>
    </Screen>
  );
}

function IdReview({ v }: { v: VerificationReview }) {
  const review = useAction((approve: boolean) => api.adminReviewVerification(v.id, approve, approve ? 'Approved' : 'Documents unclear'));
  return (
    <Card>
      <Txt v="h3">{v.user.full_name}</Txt>
      <Txt v="small">
        Licence {v.licence_class ?? '–'} · expires {v.licence_expiry ?? '–'} · sent {fmtDateTime(v.created_at)}
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
        {[
          ['IC / student ID', v.ic],
          ['Licence', v.licence],
          ['Selfie', v.selfie],
        ].map(([label, uri]) => (
          <View key={label} style={{ gap: 4 }}>
            <Image source={{ uri }} style={styles.doc} contentFit="cover" />
            <Txt v="tiny">{label}</Txt>
          </View>
        ))}
      </ScrollView>
      <Row>
        <Button title="Reject" variant="danger" style={{ flex: 1 }} onPress={() => review.mutate(false)} disabled={review.isPending} />
        <Button title="Approve" variant="dark" style={{ flex: 1 }} onPress={() => review.mutate(true)} loading={review.isPending} />
      </Row>
      <ErrorText error={review.error} />
    </Card>
  );
}

function ClaimReview({ c }: { c: Claim & { booking: BookingDetail } }) {
  const [note, setNote] = useState('');
  const resolve = useAction((approve: boolean) => api.adminResolveClaim(c.id, approve, note.trim() || (approve ? 'Damage confirmed by photos' : 'Not supported by photos')));
  const b = c.booking;
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h3">{carName(b.car)} · {rm(c.amount)}</Txt>
      </Row>
      <Txt v="small">{fmtRange(b.starts_at, b.ends_at)} · {b.customer.full_name} vs {b.owner.full_name}</Txt>
      <Txt>{c.description}</Txt>
      {c.evidence.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
          {c.evidence.map((uri) => <Image key={uri} source={{ uri }} style={styles.doc} contentFit="cover" />)}
        </ScrollView>
      ) : null}
      <Txt v="label">Before vs after</Txt>
      {b.photos.length ? <PhotoCompare photos={b.photos} /> : <Txt v="small">No trip photos.</Txt>}
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Decision note (shown to both)"
        placeholderTextColor={C.muted}
        style={styles.note}
      />
      <Row>
        <Button title="Reject claim" variant="outline" style={{ flex: 1 }} onPress={() => resolve.mutate(false)} disabled={resolve.isPending} />
        <Button title="Approve" variant="dark" style={{ flex: 1 }} onPress={() => resolve.mutate(true)} loading={resolve.isPending} />
      </Row>
      <ErrorText error={resolve.error} />
    </Card>
  );
}

function CarReview({ car }: { car: CarWithOwner }) {
  const decide = useAction((approve: boolean) => api.adminApproveCar(car.id, approve));
  return (
    <Card>
      <Row gap={S.md}>
        <View style={{ width: 96 }}>
          <CarThumb car={car} height={72} radius={R.sm} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h3">{carName(car)} · {car.plate}</Txt>
          <Txt v="small">Owner {car.owner.full_name} · {car.photos.length} photos</Txt>
          <Txt v="small">{rm(car.price_per_hour)}/h · {rm(car.price_per_day)}/day · deposit {rm(car.deposit)}</Txt>
        </View>
      </Row>
      <Txt v="small">{"Check the plate matches the photos and the operator's licence before approving."}</Txt>
      <Row>
        <Button title="Reject" variant="danger" style={{ flex: 1 }} onPress={() => decide.mutate(false)} disabled={decide.isPending} />
        <Button title="Approve" variant="dark" style={{ flex: 1 }} onPress={() => decide.mutate(true)} loading={decide.isPending} />
      </Row>
      <ErrorText error={decide.error} />
    </Card>
  );
}

function AddOwner() {
  const [email, setEmail] = useState('');
  const add = useAction((e: string) => api.adminSetOwner(e, true));
  return (
    <View style={{ gap: S.sm }}>
      <Row>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Operator's Kar login email"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.note, { flex: 1 }]}
        />
        <Button title="Make owner" variant="dark" onPress={() => add.mutate(email.trim())} disabled={!email.includes('@')} loading={add.isPending} />
      </Row>
      {add.data ? <Txt v="small" color={C.success}>{add.data} can now list cars.</Txt> : null}
      <ErrorText error={add.error} />
    </View>
  );
}

function OwnerRow({ o }: { o: OwnerSummary }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useAction(() => api.adminSetOwner(o.email, false));
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h3">{o.full_name || o.email}</Txt>
          <Txt v="small">{o.email} · {o.cars} car{o.cars === 1 ? '' : 's'}{o.strikes ? ` · ${o.strikes} strike${o.strikes === 1 ? '' : 's'}` : ''}</Txt>
        </View>
        {confirming ? (
          <Button title="Confirm remove" variant="danger" size="md" onPress={() => remove.mutate(undefined)} loading={remove.isPending} />
        ) : (
          <Button title="Remove" variant="ghost" size="md" onPress={() => setConfirming(true)} />
        )}
      </Row>
      {confirming ? <Txt v="small">Their cars will be hidden. Bookings already made stay as they are.</Txt> : null}
      <ErrorText error={remove.error} />
    </Card>
  );
}

/** Bank reference input + "Mark paid": Kar sends the money by bank transfer, then records it here. */
function MarkPaid({ onPaid, pending }: { onPaid: (ref: string) => void; pending: boolean }) {
  const [ref, setRef] = useState('');
  return (
    <Row>
      <TextInput
        value={ref}
        onChangeText={setRef}
        placeholder="Bank transfer reference"
        placeholderTextColor={C.muted}
        style={[styles.note, { flex: 1 }]}
      />
      <Button title="Mark paid" variant="dark" onPress={() => onPaid(ref.trim())} disabled={!ref.trim()} loading={pending} />
    </Row>
  );
}

function RefundRow({ r }: { r: PendingRefund }) {
  const pay = useAction((ref: string) => api.adminMarkRefundPaid(r.id, ref));
  const b = r.booking;
  const st = STATUS[b.status];
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h3">{rm(r.amount)} to {b.customer.full_name}</Txt>
        <Badge label={st.label} tone={st.tone} />
      </Row>
      <Txt v="small">{carName(b.car)} · {fmtRange(b.starts_at, b.ends_at)} · queued {fmtDateTime(r.created_at)}</Txt>
      {r.status === 'processing' ? <Txt v="small" color={C.warning}>Being sent to CHIP. If this stays here, check the CHIP dashboard before paying it manually.</Txt> : null}
      {r.last_error ? <Txt v="small" color={C.danger}>CHIP: {r.last_error}</Txt> : null}
      <MarkPaid onPaid={(ref) => pay.mutate(ref)} pending={pay.isPending} />
      <ErrorText error={pay.error} />
    </Card>
  );
}

function PayoutRow({ p }: { p: PayoutDue }) {
  const pay = useAction((ref: string) => api.adminRecordPayout(p.booking_ids, ref));
  return (
    <Card>
      <Txt v="h3">{rm(p.amount)} to {p.owner_name}</Txt>
      <Txt v="small">{p.booking_ids.length} booking{p.booking_ids.length === 1 ? '' : 's'}</Txt>
      <MarkPaid onPaid={(ref) => pay.mutate(ref)} pending={pay.isPending} />
      <ErrorText error={pay.error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  doc: { width: 120, height: 90, borderRadius: R.md, backgroundColor: C.soft },
  note: { borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.md, padding: S.md, fontSize: 15, color: C.ink },
});
