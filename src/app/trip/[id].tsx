import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { CarMap } from '@/components/car-map';
import { ClaimsList, DepositCard, useClaims } from '@/components/claims';
import { SharingCard } from '@/components/live-tracking';
import { ContactButtons, DirectionsButton, PhotoChecklist, locateMe, locationAlreadyAllowed } from '@/components/trip-parts';
import {
  Badge,
  Button,
  Card,
  CarThumb,
  Divider,
  ErrorText,
  Ionicons,
  Line,
  Loading,
  Row,
  Screen,
  Txt,
} from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api, keys, useAction, useMe } from '@/lib/api';
import { stopTripTracking, useTripTracking } from '@/lib/trip-tracker';
import { useNow } from '@/lib/use-now';
import { STATUS, carName, fmtDateTime, fmtRange, missedLabel, personName } from '@/lib/format';
import { POLICY, cancellationPreview, lateExtraOwed, lateFee } from '@/lib/policy';
import { rm, rmShort } from '@/lib/pricing';
import { requiredPhotosTaken, type BookingDetail } from '@/lib/types';

// The renter's trip, one step at a time: a progress line (Pay → Pickup → Drive → Return) and one card for the step
// they're on, with one main button. Payment, deposit and cancelling are folded under "Trip details".
export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: b, isLoading, error } = useQuery({
    queryKey: keys.booking(id),
    queryFn: () => api.getBooking(id),
    // Coming back from the payment page: CHIP's "paid" message can land a few seconds later, so keep checking.
    refetchInterval: (q) => (q.state.data?.status === 'pending_payment' ? 4000 : false),
  });
  const { data: claims } = useClaims(id);

  if (isLoading) return <Loading />;
  if (!b) return <Screen edges={[]}><ErrorText error={error ?? 'Trip not found'} /></Screen>;

  const st = STATUS[b.status];
  const ended = ['cancelled', 'no_show', 'declined'].includes(b.status);
  const openClaim = claims?.some((c) => c.status === 'open');
  return (
    <Screen edges={['bottom']} tint>
      {/* The car and trip in one box: photo, name, plate and dates (wrap instead of being cut off), status. */}
      <Card style={{ padding: S.md }}>
        <Row gap={S.md}>
          <View style={{ width: 72 }}>
            <CarThumb car={b.car} height={54} radius={R.md} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="h3" numberOfLines={1}>{carName(b.car)} {b.car.year}</Txt>
            <Txt v="small" numberOfLines={1}>{b.car.plate}</Txt>
            <Txt v="small" numberOfLines={2}>{fmtRange(b.starts_at, b.ends_at)}</Txt>
          </View>
          <Badge label={st.label} tone={st.tone} />
        </Row>
      </Card>

      {ended ? null : <Progress status={b.status} />}

      <IdPendingBanner b={b} />
      {/* A damage claim waiting for the renter's answer is the most urgent thing on the screen. */}
      {openClaim ? <ClaimsList b={b} role="customer" /> : null}

      {b.status === 'pending_payment' ? <PayCard b={b} /> : null}
      {b.status === 'requested' ? (
        <Card>
          <Row><Ionicons name="time" size={20} color={C.warning} /><Txt v="h3">Waiting for {personName(b.owner)}</Txt></Row>
          <Txt v="small">Paid. The owner has 2 hours to accept, or you get a full refund.</Txt>
        </Card>
      ) : null}
      {b.status === 'confirmed' ? (missedLabel(b) ? <MissedCard b={b} /> : <PickupCard b={b} />) : null}
      {b.status === 'active' ? <DriveCard b={b} /> : null}
      {b.status === 'returned' || b.status === 'closed' ? <DoneCard b={b} /> : null}
      {ended ? <EndedCard b={b} /> : null}

      {['confirmed', 'active'].includes(b.status) ? (
        <Button
          title="Get help"
          icon="medkit-outline"
          variant="ghost"
          size="md"
          onPress={() => router.push({ pathname: '/trip/help', params: { id: b.id } })}
        />
      ) : null}

      <TripDetails b={b} showClaims={!openClaim} />
    </Screen>
  );
}

const STEPS = ['Pay', 'Pickup', 'Drive', 'Return'] as const;

/** Pay → Pickup → Drive → Return, with the current step in blue and finished ones ticked. */
function Progress({ status }: { status: BookingDetail['status'] }) {
  const current =
    status === 'pending_payment' || status === 'requested' ? 0
    : status === 'confirmed' ? 1
    : status === 'active' ? 2
    : 4; // returned / closed: all done
  return (
    // Stepper: numbered circles joined by a line. Done = blue with a tick, current = blue ring, next = grey.
    <Row style={{ alignItems: 'flex-start', marginBottom: S.md }}>
      {STEPS.map((label, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <View key={label} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={styles.stepTrack}>
              {i > 0 ? <View style={[styles.stepLink, { left: 0, right: '50%', backgroundColor: i <= current ? C.brand : C.lineStrong }]} /> : null}
              {i < STEPS.length - 1 ? (
                <View style={[styles.stepLink, { left: '50%', right: 0, backgroundColor: i < current ? C.brand : C.lineStrong }]} />
              ) : null}
              <View style={[styles.stepDot, done && styles.stepDone, now && styles.stepNow]}>
                {done ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : (
                  <Txt v="tiny" color={now ? C.brand : C.muted} style={{ fontWeight: '700' }}>{i + 1}</Txt>
                )}
              </View>
            </View>
            <Txt v="tiny" color={now ? C.ink : C.muted} style={now ? { fontWeight: '700' } : undefined}>
              {label}
            </Txt>
          </View>
        );
      })}
    </Row>
  );
}

/** Everything that isn't the next step, folded: payment, deposit, past claims, cancelling. */
function TripDetails({ b, showClaims }: { b: BookingDetail; showClaims: boolean }) {
  const [open, setOpen] = useState(false);
  const canCancel = ['pending_payment', 'requested', 'confirmed'].includes(b.status);
  return (
    <View style={{ gap: S.lg }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.detailsToggle} accessibilityRole="button">
        <Txt v="h3">Trip details</Txt>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.ink} />
      </Pressable>
      {open ? (
        <>
          <Card>
            <Txt v="label">Payment</Txt>
            <Line label="Trip" value={rm(b.trip_amount)} />
            <Line label="Kar booking fee" value={rm(b.customer_fee)} />
            {/* Older bookings paid a deposit to Kar; it's all been refunded, so the receipt says that instead of "deposit". */}
            {b.deposit_status !== 'with_owner' && b.deposit > 0 ? (
              <Line label={b.deposit_status === 'deducted' ? 'Refundable (late fee or damage taken)' : 'Refunded in full'} value={rmShort(b.deposit)} />
            ) : null}
            <Divider />
            <Line label={b.status === 'pending_payment' ? 'Total to pay' : 'Paid'} value={rm(b.total_charged)} strong />
            {b.late_fee_due > 0 ? <Line label="Late return fee" value={rm(b.late_fee_due)} /> : null}
            {b.refund_amount != null ? <Line label="Refund" value={rm(b.refund_amount)} /> : null}
          </Card>
          {['confirmed', 'active', 'returned', 'closed'].includes(b.status) ? <DepositCard b={b} role="customer" /> : null}
          {showClaims && (b.status === 'returned' || b.status === 'closed') ? <ClaimsList b={b} role="customer" /> : null}
          {canCancel ? <CancelButton b={b} /> : null}
        </>
      ) : null}
    </View>
  );
}

function PayCard({ b }: { b: BookingDetail }) {
  const pay = useAction(async () => {
    const { url } = await api.startPayment(b.id);
    if (url) {
      if (Platform.OS === 'web') window.location.assign(url);
      else await WebBrowser.openBrowserAsync(url);
    }
  });
  return (
    <Card>
      <Txt v="h3">Complete payment</Txt>
      <Txt v="small">Held for 15 minutes. Pay by FPX, DuitNow or e-wallet.</Txt>
      <Button title={`Pay ${rm(b.total_charged)}`} icon="card" onPress={() => pay.mutate(undefined)} loading={pay.isPending} />
      <ErrorText error={pay.error} />
    </Card>
  );
}

function PickupCard({ b }: { b: BookingDetail }) {
  // Location first: the owner watches the car during the trip, so no location means no start.
  // locateMe() asks for permission and explains what to do if it's blocked.
  const start = useAction(async () => api.startTrip(b.id, await locateMe()));
  const loc = useLocationCheck();
  // Same window as start_trip(): from 30 minutes before the start time.
  const now = useNow();
  const opensAt = new Date(b.starts_at).getTime() - 30 * 60_000;
  const tooEarly = now < opensAt;
  const { data: me } = useMe();
  const idApproved = me?.verification === 'verified';
  // Where the car actually is: the last customer's return pin, else the owner's usual spot.
  const { data: live } = useQuery({ queryKey: keys.car(b.car_id), queryFn: () => api.getCar(b.car_id) });
  const parked = live?.last_location;
  const spot = parked ? { lat: parked.lat, lng: parked.lng } : { lat: b.car.pickup_lat, lng: b.car.pickup_lng };
  const note = parked?.note || b.car.pickup_note;

  return (
    <Card>
      <Txt v="label">Pick up the car</Txt>
      <CarMap center={spot} zoom={17} height={170} pins={[{ id: 'p', ...spot, label: 'Car', kind: parked ? 'parked' : 'pickup' }]} />
      <View style={{ gap: 2 }}>
        <Txt v="h3">{note}</Txt>
        <Txt v="small">
          From {fmtDateTime(b.starts_at)}
          {b.car.handover === 'manual' ? `. Meet ${personName(b.owner)} here.` : ''}
        </Txt>
      </View>
      <DirectionsButton {...spot} />
      <ContactButtons bookingId={b.id} />

      <Divider />
      <PhotoChecklist bookingId={b.id} phase="before" photos={b.photos} />
      <View style={{ marginTop: S.sm, marginBottom: S.md }}>
        <LocationCheck loc={loc} />
      </View>
      <Button
        title="Start trip"
        icon="play"
        onPress={() => start.mutate(undefined)}
        loading={start.isPending}
        disabled={tooEarly || !requiredPhotosTaken(b.photos, 'before') || !idApproved || loc.state.kind !== 'ok'}
      />
      {tooEarly ? (
        <Txt v="small" style={{ textAlign: 'center' }}>You can start from {fmtDateTime(new Date(opensAt).toISOString())}.</Txt>
      ) : null}
      {!idApproved ? <Txt v="small">You can start once Kar has approved your ID.</Txt> : null}
      <ErrorText error={start.error} />
    </Card>
  );
}

function DriveCard({ b }: { b: BookingDetail }) {
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState('');
  const finish = useAction(async () => {
    // The return pin is how the owner and next customer find the car, so explain any location problem.
    const coords = await locateMe();
    if (!note.trim()) throw new Error('Add where you parked, e.g. "V5A car park".');
    await api.completeReturn(b.id, coords.lat, coords.lng, note.trim());
    await stopTripTracking();
  });
  // The owner watches the car live during the trip (house rules); sharing stops at the return.
  // Only the customer's phone reports: the car is wherever they are.
  const { data: me } = useMe();
  const tracking = useTripTracking(b.id, !!me && me.id === b.customer_id);
  const now = useNow();
  const due = new Date(b.ends_at).getTime();
  const late = now > due;
  const minsLeft = Math.round((due - now) / 60_000);
  const minsLate = -minsLeft;
  const left = late
    ? minsLate < 60 ? `${minsLate} min late` : `${Math.floor(minsLate / 60)}h ${minsLate % 60}m late`
    : minsLeft < 60 ? `${minsLeft} min left` : `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m left`;
  // Same rule the database uses at the return: free grace minutes, then the hourly fee for every started hour.
  const feeSoFar = lateFee(b.ends_at, now, b.car.late_fee_per_hour);

  return (
    <Card style={[{ gap: S.lg, padding: S.xl }, late && { borderColor: C.danger }]}>
      <View style={{ gap: 4 }}>
        <Txt v="small">Back by</Txt>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <Txt v="h1" color={late ? C.danger : C.ink} style={{ fontSize: 22 }}>{fmtDateTime(b.ends_at)}</Txt>
          <Txt v="h3" color={late ? C.danger : minsLeft <= 30 ? C.warning : C.success}>{left}</Txt>
        </Row>
      </View>
      {late ? (
        <View style={styles.lateBox}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="body" color={C.danger}>Late fee so far</Txt>
            <Txt v="h2" color={C.danger}>{rm(feeSoFar)}</Txt>
          </Row>
          <Txt v="small" color={C.danger}>
            {feeSoFar > 0
              ? `Goes up by ${rm(b.car.late_fee_per_hour)} every hour until you return the car. ` +
                (b.deposit <= 0
                  ? `You pay it to the owner directly, and can't book on Kar again until they confirm it's paid.`
                  : feeSoFar > b.deposit
                    ? `That's ${rm(feeSoFar - b.deposit)} more than your ${rmShort(b.deposit)} deposit. You owe that part to the owner directly, and can't book again until they confirm it's paid. Return the car now.`
                    : `Taken from your ${rmShort(b.deposit)} deposit.`)
              : `Free for the first ${POLICY.lateGraceMinutes} minutes. After that ${rm(b.car.late_fee_per_hour)} for every hour, paid to the owner.`}
          </Txt>
        </View>
      ) : null}
      {late ? <NotReturnedWarning b={b} hoursLate={minsLate / 60} /> : null}
      <SharingCard {...tracking} />
      <ContactButtons bookingId={b.id} />

      {!returning ? (
        <Button title="I'm back: return the car" icon="flag" onPress={() => setReturning(true)} />
      ) : (
        <>
          <Divider />
          <Txt v="label">Return the car</Txt>
          <PhotoChecklist bookingId={b.id} phase="after" photos={b.photos} />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Where did you park? e.g. V5A car park"
            maxLength={30}
            placeholderTextColor={C.muted}
            style={{ borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.md, fontSize: 15, color: C.ink, backgroundColor: C.card }}
          />
          <Button
            title="Finish trip"
            icon="flag"
            onPress={() => finish.mutate(undefined)}
            loading={finish.isPending}
            disabled={!requiredPhotosTaken(b.photos, 'after')}
          />
          <ErrorText error={finish.error} />
        </>
      )}
    </Card>
  );
}

function DoneCard({ b }: { b: BookingDetail }) {
  const [rating, setRating] = useState(0);
  const review = useAction(() => api.review(b.id, b.owner_id, rating, ''));
  return (
    <Card>
      <Row><Ionicons name="checkmark-circle" size={22} color={C.success} /><Txt v="h3">Trip complete</Txt></Row>
      <Txt v="small">
        Returned {b.returned_at ? fmtDateTime(b.returned_at) : ''}.{' '}
        {b.deposit_status === 'held'
          ? `Your ${rmShort(b.deposit)} deposit comes back within 48 hours${b.late_fee_due > 0 ? `, minus the ${rm(b.late_fee_due)} late fee` : ''}.`
          : b.deposit_refund != null
            ? `${rm(b.deposit_refund)} of your deposit was refunded.`
            : ''}
      </Txt>
      {lateExtraOwed(b) > 0 ? (
        <View style={styles.lateBox}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="body" color={C.danger}>You owe {personName(b.owner)}</Txt>
            <Txt v="h2" color={C.danger}>{rm(lateExtraOwed(b))}</Txt>
          </Row>
          <Txt v="small" color={C.danger}>
            {b.deposit > 0
              ? `The late fee was ${rm(b.late_fee_due)} and your deposit only covers ${rmShort(b.deposit)}. Pay the rest to the owner directly (call or WhatsApp them).`
              : `Late return fee. Pay it to the owner directly (call or WhatsApp them).`}{' '}
            You can book again once they confirm it in Kar.
          </Txt>
        </View>
      ) : null}
      {review.isSuccess ? (
        <Txt v="small" color={C.success}>Thanks for rating!</Txt>
      ) : (
        <>
          <Txt v="label" style={{ marginTop: S.sm }}>Rate {personName(b.owner)}</Txt>
          <Row gap={S.sm}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
                <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={30} color={C.warning} />
              </Pressable>
            ))}
          </Row>
          <Button title="Submit rating" variant="outline" disabled={!rating} onPress={() => review.mutate(undefined)} loading={review.isPending} />
          <ErrorText error={review.error} />
        </>
      )}
    </Card>
  );
}

type LocState = { kind: 'checking' } | { kind: 'off' } | { kind: 'ok' } | { kind: 'error'; message: string };

/**
 * Is location working before "Start trip"? If it's already allowed, a fix is taken quietly when the page opens;
 * otherwise the renter taps "Turn on location". A real GPS fix is the only proof (Safari's permission state can
 * be wrong), and Start trip stays locked until there is one.
 */
function useLocationCheck() {
  const [state, setState] = useState<LocState>({ kind: 'checking' });
  const test = useCallback(async () => {
    try {
      await locateMe();
      setState({ kind: 'ok' });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Could not find your location.' });
    }
  }, []);
  useEffect(() => {
    let alive = true;
    locationAlreadyAllowed().then((allowed) => {
      if (!alive) return;
      if (allowed) test();
      else setState({ kind: 'off' });
    });
    return () => {
      alive = false;
    };
  }, [test]);
  const retry = () => {
    setState({ kind: 'checking' });
    test();
  };
  return { state, retry };
}

// How to keep sharing during the trip, per platform (phones need "all the time" for the screen-off case).
const KEEP_SHARING =
  Platform.OS === 'web'
    ? 'Keep Kar open during the trip (or use the Kar app).'
    : Platform.OS === 'android'
      ? 'When your phone asks, choose "Allow all the time" so it keeps working with the screen off.'
      : 'When your phone asks, choose "Always" (or "While Using", then "Change to Always") so it keeps working with the screen off.';

function LocationCheck({ loc }: { loc: ReturnType<typeof useLocationCheck> }) {
  const { state, retry } = loc;
  const tone =
    state.kind === 'ok' ? { bg: C.successSoft, fg: C.success, icon: 'checkmark-circle' as const }
    : state.kind === 'error' ? { bg: C.dangerSoft, fg: C.danger, icon: 'location-outline' as const }
    : { bg: C.brandSoft, fg: C.brandDark, icon: 'location-outline' as const };
  return (
    <View style={{ backgroundColor: tone.bg, borderRadius: R.md, padding: S.md, gap: S.sm }}>
      <Row gap={S.sm}>
        {state.kind === 'checking' ? <ActivityIndicator size="small" color={tone.fg} /> : <Ionicons name={tone.icon} size={20} color={tone.fg} />}
        <Txt v="h3" color={tone.fg} style={{ flex: 1 }}>
          {state.kind === 'ok' ? 'Location is working'
            : state.kind === 'error' ? 'Location is not working'
            : state.kind === 'checking' ? 'Checking your location…'
            : 'Turn on location to start'}
        </Txt>
      </Row>
      <Txt v="small" color={C.ink}>
        {state.kind === 'ok'
          ? `Kar shares it with the owner from the start of the trip until you return the car. ${KEEP_SHARING}`
          : state.kind === 'error'
            ? state.message
            : 'Kar needs your location to start the trip, and shares it with the owner until you return the car.'}
      </Txt>
      {state.kind === 'off' || state.kind === 'error' ? (
        <Button title={state.kind === 'off' ? 'Turn on location' : 'Try again'} icon="locate" variant="outline" size="md" onPress={retry} />
      ) : null}
    </View>
  );
}

/**
 * Late: says plainly what happens if the car doesn't come back (the owner's rule: no reply after 6h late,
 * police report). Turns solid red once the owner may report it.
 */
function NotReturnedWarning({ b, hoursLate }: { b: BookingDetail; hoursLate: number }) {
  const reportable = hoursLate >= POLICY.policeReportAfterHours;
  const deadline = fmtDateTime(new Date(new Date(b.ends_at).getTime() + POLICY.policeReportAfterHours * 3_600_000).toISOString());
  const fg = reportable ? '#fff' : C.danger;
  return (
    <View style={[styles.warnBox, reportable && { backgroundColor: C.danger }]}>
      <Row gap={S.sm} style={{ alignItems: 'flex-start' }}>
        <Ionicons name="warning" size={20} color={fg} />
        <Txt v="h3" color={fg} style={{ flex: 1 }}>{reportable ? 'The owner can now report the car to the police' : 'Return the car now'}</Txt>
      </Row>
      <Txt v="small" color={fg}>
        {reportable
          ? 'The car is more than 6 hours late. If the owner cannot reach you, they will make a police report that the car was not returned. '
          : `If the car is not back by ${deadline} and the owner cannot reach you, they will make a police report that the car was not returned. `}
        Kar will give the police your name, ID details, phone number and the car’s location and route, and can block your Kar account.
      </Txt>
      <Txt v="small" color={fg} style={{ fontWeight: '700' }}>Running late? Call or WhatsApp the owner now.</Txt>
    </View>
  );
}

/** Booked while Kar is still checking the customer's ID: pickup waits for approval. */
function IdPendingBanner({ b }: { b: BookingDetail }) {
  const { data: me } = useMe();
  if (me?.id !== b.customer_id || me.verification !== 'pending') return null;
  if (!['pending_payment', 'requested', 'confirmed'].includes(b.status)) return null;
  return (
    <Card>
      <Row><Ionicons name="shield-half-outline" size={20} color={C.warning} /><Txt v="h3">Kar is checking your ID</Txt></Row>
      <Txt v="small">{"Usually within a few hours. You can pick up the car once it's approved. If it isn't, this booking is cancelled with a full refund."}</Txt>
    </Card>
  );
}

/** Confirmed but the end time passed without a pickup: the database won't start it any more. */
function MissedCard({ b }: { b: BookingDetail }) {
  return (
    <Card>
      <Row><Ionicons name="time-outline" size={20} color={C.muted} /><Txt v="h3">Not picked up</Txt></Row>
      <Txt v="small">
        This trip ended {fmtDateTime(b.ends_at)} and the car was not picked up, so it can&apos;t be started any more. Book again for new
        dates, or tap Get help if something went wrong.
      </Txt>
    </Card>
  );
}

function EndedCard({ b }: { b: BookingDetail }) {
  const title =
    b.status === 'no_show' ? 'Marked as no-show'
    : b.status === 'declined' ? (b.cancelled_by === 'system' ? 'Owner did not respond in time' : 'Declined by owner')
    : b.cancel_reason === 'id_rejected' ? 'Cancelled: ID not approved'
    : b.cancel_reason === 'payment_timeout' ? 'Cancelled: not paid in time'
    : b.cancelled_by === 'owner' ? 'Cancelled by owner'
    : 'Cancelled';
  return (
    <Card>
      <Txt v="h3">{title}</Txt>
      <Txt v="small">
        {b.refund_amount != null ? `Refund ${rm(b.refund_amount)}` : 'No charge'}
        {b.cancellation_fee > 0 ? `. ${rm(b.cancellation_fee)} kept by the owner (late cancellation).` : ''}
      </Txt>
    </Card>
  );
}

/** Two-step cancel that shows the refund first (free until 24h before pickup, then 50% of the trip kept). */
function CancelButton({ b }: { b: BookingDetail }) {
  const [confirming, setConfirming] = useState(false);
  const cancel = useAction(() => api.cancelBooking(b.id));
  const preview = cancellationPreview(b);
  if (!confirming) {
    return <Button title="Cancel booking" variant="ghost" onPress={() => setConfirming(true)} />;
  }
  return (
    <Card>
      <Txt v="h3">Cancel this booking?</Txt>
      <Txt v="small">
        {b.status === 'pending_payment'
          ? 'Nothing has been charged.'
          : preview.free
            ? `You get ${rm(preview.refund)} back. The ${rm(preview.bookingFee)} booking fee isn't refunded.`
            : `Less than 24h before pickup: the owner keeps ${rm(preview.fee)} and the ${rm(preview.bookingFee)} booking fee isn't refunded. You get ${rm(preview.refund)} back.`}
      </Txt>
      <Row>
        <Button title="Keep booking" variant="outline" style={{ flex: 1 }} onPress={() => setConfirming(false)} />
        <Button title="Cancel" variant="danger" style={{ flex: 1 }} loading={cancel.isPending} onPress={() => cancel.mutate(undefined)} />
      </Row>
      <ErrorText error={cancel.error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  warnBox: { borderWidth: 2, borderColor: C.danger, borderRadius: R.md, padding: S.lg, gap: S.sm },
  stepTrack: { width: '100%', height: 26, alignItems: 'center', justifyContent: 'center' },
  stepLink: { position: 'absolute', top: 12, height: 2 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: C.lineStrong,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDone: { backgroundColor: C.brand, borderColor: C.brand },
  stepNow: { borderColor: C.brand, backgroundColor: C.brandSoft },
  lateBox: { backgroundColor: C.dangerSoft, borderRadius: R.md, padding: S.lg, gap: S.sm },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: S.md,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
});
