import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Field, PinPicker } from '@/components/car-form';
import { PhotoCompare } from '@/components/trip-parts';
import { Badge, Button, CarThumb, Card, Empty, ErrorText, Loading, Row, Screen, Section, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api, useAction, useMe } from '@/lib/api';
import { STATUS, carName, fmtDateTime, fmtRange, personName } from '@/lib/format';
import { rm } from '@/lib/pricing';
import {
  isInsured,
  type BookingDetail,
  type CarWithOwner,
  type Claim,
  type OperatorReview,
  type OwnerSummary,
  type PayoutDue,
  type PendingRefund,
  type VerificationReview,
} from '@/lib/types';

type Tab = 'todo' | 'owners' | 'payouts' | 'areas';

/** Kar team, in tabs: To do (IDs, operator documents, cars, disputed claims, refunds), Owners, Payouts, Areas. */
export default function Admin() {
  const { data: me, isLoading } = useMe();
  const enabled = !!me?.is_admin;
  const ids = useQuery({ queryKey: ['admin', 'ids'], queryFn: () => api.adminPendingVerifications(), enabled });
  const cars = useQuery({ queryKey: ['admin', 'cars'], queryFn: () => api.adminPendingCars(), enabled });
  const autoCars = useQuery({ queryKey: ['admin', 'auto-cars'], queryFn: () => api.adminAutoApprovedCars(), enabled });
  const claims = useQuery({ queryKey: ['admin', 'claims'], queryFn: () => api.adminDisputedClaims(), enabled });
  const refunds = useQuery({ queryKey: ['admin', 'refunds'], queryFn: () => api.adminPendingRefunds(), enabled });
  const payouts = useQuery({ queryKey: ['admin', 'payouts'], queryFn: () => api.adminPayoutsDue(), enabled });
  const sendRefunds = useAction(() => api.processRefunds());
  const owners = useQuery({ queryKey: ['admin', 'owners'], queryFn: () => api.adminOwners(), enabled });
  const operators = useQuery({ queryKey: ['admin', 'operators'], queryFn: () => api.adminPendingOperators(), enabled });
  const zones = useQuery({ queryKey: ['zones'], queryFn: () => api.zones(), enabled });
  const [tab, setTab] = useState<Tab>('todo');

  if (isLoading) return <Loading />;
  if (!me?.is_admin) {
    return (
      <Screen edges={['bottom']}>
        <Empty icon="lock-closed-outline" title="Kar team only" />
      </Screen>
    );
  }

  const todo = [ids, operators, cars, claims, refunds].reduce((n, q) => n + (q.data?.length ?? 0), 0);
  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'todo', label: 'To do', count: todo },
    { key: 'owners', label: 'Owners', count: owners.data?.length },
    { key: 'payouts', label: 'Payouts', count: payouts.data?.length },
    { key: 'areas', label: 'Areas', count: zones.data?.length },
  ];

  return (
    <Screen edges={['bottom']}>
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, on && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Txt v="h3" color={on ? '#fff' : C.ink}>{t.label}</Txt>
              {t.count ? (
                <View style={[styles.count, on && { backgroundColor: '#fff' }, t.key === 'todo' && !on && { backgroundColor: C.danger }]}>
                  <Txt v="tiny" color={on ? C.ink : '#fff'}>{t.count}</Txt>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {tab === 'todo' ? (
        <>
          {todo === 0 && !ids.isLoading ? <Txt v="small">All clear: nothing is waiting for Kar.</Txt> : null}
        {ids.data?.length || ids.error ? (
          <Section title={`ID checks (${ids.data?.length ?? 0})`}>
            <ErrorText error={ids.error} />
            {ids.data?.length === 0 ? <Txt v="small">Nothing waiting.</Txt> : null}
            {ids.data?.map((v) => <IdReview key={v.id} v={v} />)}
          </Section>
        ) : null}
        {operators.data?.length || operators.error ? (
          <Section title={`Operator documents (${operators.data?.length ?? 0})`}>
            <Txt v="small">Rental permit and insurance. Cars can only be approved for operators with valid, approved insurance.</Txt>
            <ErrorText error={operators.error} />
            {operators.data?.length === 0 ? <Txt v="small">Nothing waiting.</Txt> : null}
            {operators.data?.map((d) => <OperatorReviewCard key={d.id} d={d} />)}
          </Section>
        ) : null}
        {cars.data?.length || cars.error ? (
          <Section title={`Cars to approve (${cars.data?.length ?? 0})`}>
            <ErrorText error={cars.error} />
            {cars.data?.length === 0 ? <Txt v="small">Nothing waiting.</Txt> : null}
            {cars.data?.map((c) => <CarReview key={c.id} car={c} />)}
          </Section>
        ) : null}
        {autoCars.data?.length || autoCars.error ? (
          <Section title={`Auto-approved cars (${autoCars.data?.length ?? 0})`}>
            <Txt v="small">These passed Kar&apos;s checks and are already live. Look when you have time: tap Looks good, or take a car down.</Txt>
            <ErrorText error={autoCars.error} />
            {autoCars.data?.map((c) => <CarReview key={c.id} car={c} live />)}
          </Section>
        ) : null}
        {claims.data?.length || claims.error ? (
          <Section title={`Disputed claims (${claims.data?.length ?? 0})`}>
            <ErrorText error={claims.error} />
            {claims.data?.length === 0 ? <Txt v="small">Nothing waiting.</Txt> : null}
            {claims.data?.map((c) => <ClaimReview key={c.id} c={c} />)}
          </Section>
        ) : null}
        {refunds.data?.length || refunds.error ? (
          <Section title={`Refunds to send (${refunds.data?.length ?? 0})`} last>
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
        ) : null}
        </>
      ) : null}
      {tab === 'owners' ? (
        <Section title={`Owners (${owners.data?.length ?? 0})`} last>
          <Txt v="small">Operators apply in the app, and approving their documents above makes them an owner. You can also add someone by their Kar login email; their cars still need approved documents.</Txt>
          <AddOwner />
          <ErrorText error={owners.error} />
          {owners.data?.map((o) => <OwnerRow key={o.id} o={o} />)}
        </Section>
      ) : null}
      {tab === 'payouts' ? (
        <Section title={`Owner payouts due (${payouts.data?.length ?? 0})`} last>
          <Txt v="small">Finished trips after the 48-hour claim window, plus cancellation and no-show fees.</Txt>
          <ErrorText error={payouts.error} />
          {payouts.data?.length === 0 ? <Txt v="small">Nothing due.</Txt> : null}
          {payouts.data?.map((p) => <PayoutRow key={p.owner_id} p={p} />)}
        </Section>
      ) : null}
      {tab === 'areas' ? (
        <Section title={`Areas (${zones.data?.length ?? 0})`} last>
          <Txt v="small">Each campus or city Kar operates in. Renters pick the area on Explore, owners when listing a car.</Txt>
          {zones.data?.map((z) => <Txt key={z.id}>{z.name} <Txt v="small">({z.id})</Txt></Txt>)}
          <AddZone />
        </Section>
      ) : null}
    </Screen>
  );
}

function IdReview({ v }: { v: VerificationReview }) {
  const review = useAction((approve: boolean) => api.adminReviewVerification(v.id, approve, approve ? 'Approved' : 'Documents unclear'));
  return (
    <Card>
      <Txt v="h3">{personName(v.user)}</Txt>
      <Txt v="small">
        Licence {v.licence_class ?? '–'}, expires {v.licence_expiry ?? '–'}, sent {fmtDateTime(v.created_at)}
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
        <Txt v="h3">{rm(c.amount)} claim on the {carName(b.car)}</Txt>
      </Row>
      <Txt v="small">{fmtRange(b.starts_at, b.ends_at)}, {personName(b.customer)} vs {personName(b.owner)}</Txt>
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

/** A car waiting for Kar, or (`live`) one the automatic check already put live. */
function CarReview({ car, live }: { car: CarWithOwner; live?: boolean }) {
  const decide = useAction((approve: boolean) => api.adminApproveCar(car.id, approve));
  return (
    <Card>
      <Row gap={S.md}>
        <View style={{ width: 96 }}>
          <CarThumb car={car} height={72} radius={R.sm} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h3">{carName(car)}, {car.plate}</Txt>
          <Txt v="small">Owner {personName(car.owner)}, {car.photos.length} photos</Txt>
          <Txt v="small">{rm(car.price_per_hour)}/h, {rm(car.price_per_day)}/day, deposit {rm(car.deposit)}</Txt>
        </View>
      </Row>
      {car.review_flags?.length ? (
        <View style={{ gap: 2 }}>
          <Txt v="label">Flagged by the check</Txt>
          {car.review_flags.map((f) => <Txt key={f} v="small" color={C.warning}>• {f}</Txt>)}
        </View>
      ) : null}
      <Txt v="small">{"Check the plate matches the photos and the operator's licence."}</Txt>
      {!isInsured(car.owner) ? (
        <Txt v="small" color={C.danger}>{"The owner's permit and insurance aren't approved yet, so this car can't be approved."}</Txt>
      ) : null}
      <Row>
        <Button title={live ? 'Take down' : 'Reject'} variant="danger" style={{ flex: 1 }} onPress={() => decide.mutate(false)} disabled={decide.isPending} />
        <Button title={live ? 'Looks good' : 'Approve'} variant="dark" style={{ flex: 1 }} onPress={() => decide.mutate(true)} loading={decide.isPending} />
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
  const reset = useAction(() => api.adminResetStrikes(o.id));
  const insured = isInsured({ operator_insured_until: o.insured_until });
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h3">{o.full_name || o.email}</Txt>
          <Txt v="small">{o.email}, {o.cars} car{o.cars === 1 ? '' : 's'}{o.strikes ? `, ${o.strikes} strike${o.strikes === 1 ? '' : 's'}` : ''}</Txt>
        </View>
        {confirming ? (
          <Button title="Confirm remove" variant="danger" size="md" onPress={() => remove.mutate(undefined)} loading={remove.isPending} />
        ) : (
          <Button title="Remove" variant="ghost" size="md" onPress={() => setConfirming(true)} />
        )}
      </Row>
      <Txt v="small" color={insured ? C.success : C.danger}>
        {insured ? `Insured until ${o.insured_until}` : o.insured_until ? `Insurance expired ${o.insured_until}` : 'No approved permit or insurance'}
      </Txt>
      {o.strikes > 0 ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="small" color={C.danger} style={{ flex: 1 }}>
            {o.strikes} cancellation strike{o.strikes === 1 ? '' : 's'}. At 3 their cars are hidden.
          </Txt>
          <Button title="Reset strikes" variant="outline" size="md" onPress={() => reset.mutate(undefined)} loading={reset.isPending} />
        </Row>
      ) : null}
      {confirming ? <Txt v="small">Their cars will be hidden. Bookings already made stay as they are.</Txt> : null}
      <ErrorText error={remove.error ?? reset.error} />
    </Card>
  );
}

function OperatorReviewCard({ d }: { d: OperatorReview }) {
  const [note, setNote] = useState('');
  const review = useAction((approve: boolean) =>
    api.adminReviewOperator(d.id, approve, note.trim() || (approve ? 'Approved' : 'Documents unclear or expired')),
  );
  return (
    <Card>
      <Txt v="h3">{d.business_name}</Txt>
      <Txt v="small">{d.email}, SSM {d.ssm_no}, permit {d.permit_no}</Txt>
      <Txt v="small">{d.insurer}, policy {d.policy_no}, expires {d.insurance_expiry}</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
        {[
          ['Rental permit', d.permit],
          ['Insurance', d.insurance],
        ].map(([label, uri]) => (
          <View key={label} style={{ gap: 4 }}>
            <Image source={{ uri }} style={styles.doc} contentFit="cover" />
            <Txt v="tiny">{label}</Txt>
          </View>
        ))}
      </ScrollView>
      <Txt v="small">Check the names match SSM, the permit is current, and the insurance covers rental use until the date above.</Txt>
      <TextInput value={note} onChangeText={setNote} placeholder="Note to the owner (shown if rejected)" placeholderTextColor={C.muted} style={styles.note} />
      <Row>
        <Button title="Reject" variant="danger" style={{ flex: 1 }} onPress={() => review.mutate(false)} disabled={review.isPending} />
        <Button title="Approve" variant="dark" style={{ flex: 1 }} onPress={() => review.mutate(true)} loading={review.isPending} />
      </Row>
      <ErrorText error={review.error} />
    </Card>
  );
}

/** Opens Kar in a new campus or city: a short id, a name, and the map centre. */
function AddZone() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [spot, setSpot] = useState({ lat: 4.3845, lng: 100.967 });
  const add = useAction(async () => {
    const slug = id.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,20}$/.test(slug)) throw new Error('Short id: 2–20 lowercase letters, numbers or dashes, e.g. "uitm-shah-alam"');
    if (name.trim().length < 3) throw new Error('Enter the area name, e.g. "UiTM Shah Alam"');
    await api.adminAddZone(slug, name.trim(), spot.lat, spot.lng);
    setOpen(false);
    setName('');
    setId('');
  });
  if (!open) return <Button title="Add an area" icon="add" variant="outline" size="md" onPress={() => setOpen(true)} />;
  return (
    <Card>
      <Field label="Area name" value={name} onChange={setName} placeholder="UiTM Shah Alam" maxLength={60} />
      <Field label="Short id" value={id} onChange={setId} placeholder="uitm-shah-alam" maxLength={20} />
      <Txt v="small">Move the map so the pin is in the middle of the area.</Txt>
      <PinPicker spot={spot} onChange={setSpot} height={220} />
      <Row>
        <Button title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
        <Button title="Add area" variant="dark" style={{ flex: 1 }} onPress={() => add.mutate(undefined)} loading={add.isPending} />
      </Row>
      <ErrorText error={add.error} />
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
        <Txt v="h3">{rm(r.amount)} to {personName(b.customer)}</Txt>
        <Badge label={st.label} tone={st.tone} />
      </Row>
      <Txt v="small">{carName(b.car)}, {fmtRange(b.starts_at, b.ends_at)}, queued {fmtDateTime(r.created_at)}</Txt>
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
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: S.lg, paddingVertical: S.sm, borderRadius: R.pill, borderWidth: 1, borderColor: C.lineStrong },
  tabOn: { backgroundColor: C.ink, borderColor: C.ink },
  count: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: C.muted },
  note: { borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.md, padding: S.md, fontSize: 15, color: C.ink },
});
