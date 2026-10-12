import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { CarMap } from '@/components/car-map';
import { ContactButtons, CustomerLine, PhotoCompare } from '@/components/trip-parts';
import { Badge, Button, Card, Divider, ErrorText, Line, Loading, Row, Screen, Txt } from '@/components/ui';
import { C } from '@/constants/theme';
import { api, keys, useAction } from '@/lib/api';
import { STATUS, carName, fmtDateTime, fmtRange } from '@/lib/format';
import { rm } from '@/lib/pricing';

// Owner's view of one booking: who has the car, the photo evidence and where it was left.
export default function HostBooking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: b, isLoading, error } = useQuery({ queryKey: keys.booking(id), queryFn: () => api.getBooking(id) });
  // Takes the id as an argument: `b` is undefined until the booking loads.
  const block = useAction((customerId: string) => api.blockCustomer(customerId, 'Blocked by owner after trip'));

  if (isLoading) return <Loading />;
  if (!b) return <Screen edges={[]}><ErrorText error={error ?? 'Booking not found'} /></Screen>;

  const st = STATUS[b.status];
  const returned = ['returned', 'closed'].includes(b.status);

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
      </Card>

      {returned ? <ParkedCard carId={b.car_id} /> : null}

      <Card>
        <Txt v="label">Photo evidence</Txt>
        {b.photos.length ? (
          <PhotoCompare photos={b.photos} />
        ) : (
          <Txt v="small">No photos yet</Txt>
        )}
      </Card>

      <Card>
        <Txt v="label">Your earnings</Txt>
        <Line label="Trip price" value={rm(b.trip_amount)} />
        <Line label="Kar commission" value={b.owner_commission ? `-${rm(b.owner_commission)}` : 'Free (pilot)'} />
        <Divider />
        <Line label="Payout" value={rm(b.owner_payout)} strong />
        <Txt v="small">Deposit held: {rm(b.deposit)}</Txt>
      </Card>

      {returned ? (
        <Card>
          <Txt v="label">Problem with this customer?</Txt>
          <Txt v="small">They can&apos;t book your cars again.</Txt>
          {block.isSuccess ? (
            <Txt v="small" color={C.danger}>Customer blocked.</Txt>
          ) : (
            <Button
              title="Block this customer"
              icon="ban"
              variant="danger"
              loading={block.isPending}
              onPress={() => block.mutate(b.customer_id)}
            />
          )}
          <ErrorText error={block.error} />
        </Card>
      ) : null}
    </Screen>
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
