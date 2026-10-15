import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Linking, View } from 'react-native';

import { CarMap } from '@/components/car-map';
import { fmtAgo, fmtMotion, inPeninsularMalaysia, liveStatus, SPEEDING_MPS, useTripRoute } from '@/components/live-tracking';
import { ContactButtons, CustomerLine, DirectionsButton } from '@/components/trip-parts';
import { Badge, Button, Card, ErrorText, Ionicons, Line, Loading, Row, Screen, Txt } from '@/components/ui';
import { C } from '@/constants/theme';
import { api, keys } from '@/lib/api';
import { carName, fmtDateTime, personName } from '@/lib/format';
import { POLICY } from '@/lib/policy';
import { useNow } from '@/lib/use-now';

// Owner: one car on a trip, live. The route so far, where it is now, how fast it's going, and what to do
// if the signal is lost.
export default function TrackTrip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: b, isLoading, error } = useQuery({ queryKey: keys.booking(id), queryFn: () => api.getBooking(id) });
  const active = b?.status === 'active';
  const { data: route } = useTripRoute(id, active);
  const now = useNow(15_000);

  if (isLoading) return <Loading />;
  if (!b) return <Screen edges={[]}><ErrorText error={error ?? 'Trip not found'} /></Screen>;

  const latest = route?.at(-1);
  const st = liveStatus(latest, now);
  const fallback = { lat: b.car.pickup_lat, lng: b.car.pickup_lng };
  const at = latest ?? fallback;
  const lost = active && st.kind === 'lost';
  // House rules: Peninsular Malaysia only, no racing. The database also sends the owner a notification.
  const outside = active && !!latest && !inPeninsularMalaysia(latest.lat, latest.lng);
  const topSpeed = Math.max(0, ...(route ?? []).map((r) => r.speed ?? 0));

  const headline = !active
    ? b.returned_at ? `Returned ${fmtDateTime(b.returned_at)}` : 'Not on a trip'
    : st.kind === 'waiting' ? 'Waiting for the first location'
    : lost ? `No signal for ${fmtAgo(st.ago).replace(' ago', '')}`
    : fmtMotion(st.fix);

  return (
    <Screen edges={['bottom']}>
      <CarMap
        center={at}
        zoom={15}
        height={360}
        route={route}
        pins={[{ id: 'car', ...at, label: b.car.model, kind: active ? (st.kind === 'live' ? 'live' : 'stale') : 'parked' }]}
      />

      <Card style={lost ? { borderColor: C.danger, backgroundColor: C.dangerSoft } : undefined}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="h2" style={{ flex: 1 }}>{headline}</Txt>
          {active ? <Badge label={lost ? 'Signal lost' : 'Live'} tone={lost ? 'danger' : 'success'} icon="radio-outline" /> : null}
        </Row>
        {st.kind !== 'waiting' ? (
          <Txt v="small">Last location {fmtAgo(st.ago)} ({fmtDateTime(st.fix.recorded_at)})</Txt>
        ) : active ? (
          <Txt v="small">{"The customer's phone sends the car's location every 30 seconds once the trip starts."}</Txt>
        ) : null}
        {lost ? (
          <Txt v="small" color={C.ink}>
            The phone may be off or out of signal. Call the customer first. If you can&apos;t reach them, tell Kar right away.
          </Txt>
        ) : null}
        <DirectionsButton {...at} />
        {lost && POLICY.supportWhatsApp ? (
          <Button
            title="Tell Kar"
            icon="logo-whatsapp"
            variant="danger"
            size="md"
            onPress={() =>
              Linking.openURL(
                `https://wa.me/${POLICY.supportWhatsApp}?text=${encodeURIComponent(
                  `Kar: no signal from ${carName(b.car)} (${b.car.plate}) on trip ${b.id}. Customer: ${personName(b.customer)}.`,
                )}`,
              )
            }
          />
        ) : null}
      </Card>

      {outside || topSpeed > SPEEDING_MPS ? (
        <Card style={{ borderColor: C.danger, backgroundColor: C.dangerSoft }}>
          <Row><Ionicons name="warning" size={20} color={C.danger} /><Txt v="h3">House rules broken?</Txt></Row>
          {outside ? <Txt v="small" color={C.ink}>The car seems to have left Peninsular Malaysia. Call the customer, and tell Kar if you can&apos;t reach them.</Txt> : null}
          {topSpeed > SPEEDING_MPS ? <Txt v="small" color={C.ink}>Top speed on this trip: {Math.round(topSpeed * 3.6)} km/h.</Txt> : null}
        </Card>
      ) : null}

      <Card>
        <Txt v="label">{carName(b.car)}, {b.car.plate}</Txt>
        <CustomerLine b={b} />
        <View style={{ gap: 4 }}>
          {b.picked_up_at ? <Line label="Picked up" value={fmtDateTime(b.picked_up_at)} /> : null}
          <Line label="Due back" value={fmtDateTime(b.ends_at)} />
          {active && now > new Date(b.ends_at).getTime() ? (
            <Row gap={6}>
              <Ionicons name="alarm" size={16} color={C.danger} />
              <Txt v="small" color={C.danger}>Overdue. Late fees apply after 15 minutes.</Txt>
            </Row>
          ) : null}
        </View>
        <ContactButtons bookingId={b.id} />
      </Card>

      <Txt v="tiny" style={{ textAlign: 'center' }}>
        Locations come from the customer&apos;s phone during the trip only, and are deleted after 30 days.
      </Txt>
    </Screen>
  );
}
