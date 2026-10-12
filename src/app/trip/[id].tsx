import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { CarMap } from '@/components/car-map';
import { ContactButtons, DirectionsButton, PhotoChecklist, currentCoords } from '@/components/trip-parts';
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
import { api, keys, useAction } from '@/lib/api';
import { STATUS, carName, fmtDateTime, fmtRange } from '@/lib/format';
import { rm } from '@/lib/pricing';
import { PHOTO_SLOTS, type BookingDetail } from '@/lib/types';

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: b, isLoading, error } = useQuery({ queryKey: keys.booking(id), queryFn: () => api.getBooking(id) });

  if (isLoading) return <Loading />;
  if (!b) return <Screen edges={[]}><ErrorText error={error ?? 'Trip not found'} /></Screen>;

  const st = STATUS[b.status];
  return (
    <Screen edges={['bottom']}>
      <View style={{ gap: S.sm }}>
        <CarThumb car={b.car} height={180} radius={R.lg} />
        <Row style={{ justifyContent: 'space-between', marginTop: S.sm }}>
          <Txt v="h1">{carName(b.car)}</Txt>
          <Badge label={st.label} tone={st.tone} />
        </Row>
        <Txt v="body">{b.car.plate} · {fmtRange(b.starts_at, b.ends_at)}</Txt>
      </View>

      {b.status === 'pending_payment' ? <PayCard b={b} /> : null}
      {b.status === 'requested' ? (
        <Card>
          <Row><Ionicons name="time" size={20} color={C.warning} /><Txt v="h3">Waiting for {b.owner.full_name}</Txt></Row>
          <Txt v="small">Paid. Full refund if declined.</Txt>
        </Card>
      ) : null}
      {b.status === 'confirmed' ? <PickupCard b={b} /> : null}
      {b.status === 'active' ? <ReturnCard b={b} /> : null}
      {b.status === 'returned' || b.status === 'closed' ? <DoneCard b={b} /> : null}

      <Card>
        <Txt v="label">Payment</Txt>
        <Line label="Trip" value={rm(b.trip_amount)} />
        <Line label="Kar booking fee" value={rm(b.customer_fee)} />
        <Line label="Refundable deposit" value={rm(b.deposit)} />
        <Divider />
        <Line label="Total" value={rm(b.total_charged)} strong />
      </Card>

      {['pending_payment', 'requested', 'confirmed'].includes(b.status) ? <CancelButton id={b.id} /> : null}
    </Screen>
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
      <Txt v="small">Held for 15 min · FPX, DuitNow, e-wallet</Txt>
      <Button title={`Pay ${rm(b.total_charged)}`} icon="card" onPress={() => pay.mutate(undefined)} loading={pay.isPending} />
      <ErrorText error={pay.error} />
    </Card>
  );
}

function PickupCard({ b }: { b: BookingDetail }) {
  const { data: code } = useQuery({
    queryKey: ['keybox', b.id],
    queryFn: () => api.keyboxCode(b.id),
    enabled: b.car.handover === 'keybox',
  });
  const start = useAction(() => api.startTrip(b.id));
  const before = b.photos.filter((p) => p.phase === 'before').length;
  // Where the car actually is: the last customer's return pin, else the owner's usual spot.
  const { data: live } = useQuery({ queryKey: keys.car(b.car_id), queryFn: () => api.getCar(b.car_id) });
  const parked = live?.last_location;
  const spot = parked ? { lat: parked.lat, lng: parked.lng } : { lat: b.car.pickup_lat, lng: b.car.pickup_lng };
  const note = parked?.note || b.car.pickup_note;

  return (
    <>
      <Card>
        <Txt v="label">Pickup</Txt>
        <CarMap center={spot} zoom={17} height={200} pins={[{ id: 'p', ...spot, label: 'Car', kind: parked ? 'parked' : 'pickup' }]} />
        <View style={{ gap: 4 }}>
          <Txt v="h3">{note}</Txt>
          <Txt v="small">
            From {fmtDateTime(b.starts_at)}
            {b.car.handover === 'manual' ? ` · meet ${b.owner.full_name.replace(/\(.*?\)/, '').trim()} here` : ''}
          </Txt>
        </View>
        <DirectionsButton {...spot} />
        {b.car.handover === 'keybox' ? (
          <View style={{ backgroundColor: C.brandSoft, borderRadius: R.md, padding: S.md, alignItems: 'center' }}>
            <Txt v="small" color={C.brandDark}>Key box code</Txt>
            <Txt v="h1" color={C.brandDark} style={{ letterSpacing: 8 }}>{code ?? '• • • •'}</Txt>
            {!code ? <Txt v="small">Shown 30 minutes before pickup</Txt> : null}
          </View>
        ) : null}
        <ContactButtons bookingId={b.id} />
      </Card>
      <Card>
        <PhotoChecklist bookingId={b.id} phase="before" photos={b.photos} />
        <Button
          title="Start trip"
          icon="play"
          onPress={() => start.mutate(undefined)}
          loading={start.isPending}
          disabled={before < PHOTO_SLOTS.length}
        />
        <ErrorText error={start.error} />
      </Card>
    </>
  );
}

function ReturnCard({ b }: { b: BookingDetail }) {
  const [note, setNote] = useState('');
  const finish = useAction(async () => {
    const coords = await currentCoords();
    if (!coords) throw new Error('Allow location so the owner and next customer can find the car.');
    if (!note.trim()) throw new Error('Add where you parked, e.g. "V5A car park".');
    await api.completeReturn(b.id, coords.lat, coords.lng, note.trim());
  });
  const after = b.photos.filter((p) => p.phase === 'after').length;
  const late = useNow() > new Date(b.ends_at).getTime();

  return (
    <>
      <Card style={late ? { borderColor: C.danger } : undefined}>
        <Row><Ionicons name="speedometer" size={20} color={late ? C.danger : C.success} /><Txt v="h3">{late ? 'You are late' : 'Enjoy the drive'}</Txt></Row>
        <Txt v="small">Return by {fmtDateTime(b.ends_at)}. Late returns are charged {rm(b.car.late_fee_per_hour)}/hour.</Txt>
        <ContactButtons bookingId={b.id} />
      </Card>
      <Card>
        <Txt v="h3">Return the car</Txt>
        <Txt v="small">Photos + parking spot</Txt>
        <PhotoChecklist bookingId={b.id} phase="after" photos={b.photos} />
        <Txt v="label" style={{ marginTop: S.sm }}>Where did you park?</Txt>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="e.g. V5A car park"
          maxLength={30}
          placeholderTextColor={C.muted}
          style={{ borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.md, fontSize: 15, color: C.ink, backgroundColor: C.card }}
        />
        <Button
          title="Finish trip & save location"
          icon="flag"
          onPress={() => finish.mutate(undefined)}
          loading={finish.isPending}
          disabled={after < PHOTO_SLOTS.length}
        />
        <ErrorText error={finish.error} />
      </Card>
    </>
  );
}

/** Current time, refreshed every 30s so the late-return warning appears on its own. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function DoneCard({ b }: { b: BookingDetail }) {
  const [rating, setRating] = useState(0);
  const review = useAction(() => api.review(b.id, b.owner_id, rating, ''));
  return (
    <Card>
      <Row><Ionicons name="checkmark-circle" size={22} color={C.success} /><Txt v="h3">Trip complete</Txt></Row>
      <Txt v="small">
        Returned {b.returned_at ? fmtDateTime(b.returned_at) : ''}. Your {rm(b.deposit)} deposit is refunded within 24 hours
        if the owner reports no issues.
      </Txt>
      {review.isSuccess ? (
        <Txt v="small" color={C.success}>Thanks for rating!</Txt>
      ) : (
        <>
          <Txt v="label" style={{ marginTop: S.sm }}>Rate {b.owner.full_name}</Txt>
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

function CancelButton({ id }: { id: string }) {
  const cancel = useAction(() => api.cancelBooking(id));
  return (
    <>
      <Button title="Cancel booking" variant="ghost" onPress={() => cancel.mutate(undefined)} loading={cancel.isPending} />
      <ErrorText error={cancel.error} />
    </>
  );
}
