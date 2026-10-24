import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  carSchema,
  Choice,
  extrasSchema,
  Field,
  Money,
  PhotoPicker,
  PinPicker,
  priceSchema,
} from '@/components/car-form';
import { Button, ErrorText, Ionicons, Loading, Row, Screen, Section, Toggle, Txt } from '@/components/ui';
import { C, S } from '@/constants/theme';
import { api, keys, useAction } from '@/lib/api';
import type { CarWithOwner } from '@/lib/types';

// Owner's "Edit car": one scrolling page of sections with a sticky Save (Airbnb's edit-listing pattern).
export default function EditCar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: car, isLoading, error } = useQuery({ queryKey: keys.car(id), queryFn: () => api.getCar(id) });

  if (isLoading) return <Loading />;
  if (!car) {
    return (
      <Screen edges={[]}>
        <ErrorText error={error ?? 'Car not found'} />
      </Screen>
    );
  }
  // Keyed form so state initialises once from the loaded car.
  return <EditForm key={car.id} car={car} />;
}

function EditForm({ car }: { car: CarWithOwner }) {
  const [f, setF] = useState({
    make: car.make,
    model: car.model,
    year: String(car.year),
    plate: car.plate,
    price_per_hour: String(car.price_per_hour),
    price_per_day: String(car.price_per_day),
    late_fee_per_hour: String(car.late_fee_per_hour),
    min_hours: String(car.min_hours),
    note: car.pickup_note,
  });
  const [transmission, setTransmission] = useState(car.transmission);
  const [instant, setInstant] = useState(car.instant_book);
  const [photos, setPhotos] = useState(car.photos);
  const [spot, setSpot] = useState({ lat: car.pickup_lat, lng: car.pickup_lng });
  const [mapTouch, setMapTouch] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const save = useAction(async () => {
    for (const schema of [carSchema, priceSchema, extrasSchema]) {
      const r = schema.safeParse(f);
      if (!r.success) throw new Error(r.error.issues[0].message);
    }
    if (!photos.length) throw new Error('Keep at least 1 photo');
    if (f.note.trim().length < 3) throw new Error('Add a pickup note');
    await api.updateCar(
      car.id,
      {
        ...carSchema.parse(f),
        ...priceSchema.parse(f),
        ...extrasSchema.parse(f),
        transmission,
        handover: 'manual',
        instant_book: instant,
        photos,
        pickup_lat: spot.lat,
        pickup_lng: spot.lng,
        pickup_note: f.note.trim(),
      },
      null,
    );
  });
  const hide = useAction(() => api.updateCar(car.id, { is_listed: false }));

  return (
    <Screen
      edges={['bottom']}
      scrollEnabled={!mapTouch}
      footer={
        <View style={{ gap: 8 }}>
          <ErrorText error={save.error} />
          <Button title="Save" loading={save.isPending} onPress={() => save.mutate(undefined, { onSuccess: () => router.back() })} />
        </View>
      }>
      <Section title="Photos">
        <PhotoPicker photos={photos} onChange={setPhotos} />
      </Section>

      <Section title="Details">
        <Row>
          <Field label="Make" value={f.make} onChange={set('make')} />
          <Field label="Model" value={f.model} onChange={set('model')} />
        </Row>
        <Row>
          <Field label="Year" value={f.year} onChange={set('year')} keyboard="number-pad" />
          <Field label="Plate" value={f.plate} onChange={set('plate')} caps />
        </Row>
        <Row>
          <Choice icon="speedometer-outline" label="Auto" selected={transmission === 'auto'} onPress={() => setTransmission('auto')} />
          <Choice icon="cog-outline" label="Manual" selected={transmission === 'manual'} onPress={() => setTransmission('manual')} />
        </Row>
      </Section>

      <Section title="Price">
        <Money label="Per hour" value={f.price_per_hour} onChange={set('price_per_hour')} />
        <Money label="Per day" value={f.price_per_day} onChange={set('price_per_day')} />
        <Money label="Late fee / hour" value={f.late_fee_per_hour} onChange={set('late_fee_per_hour')} />
        <Money label="Minimum" unit="hrs" value={f.min_hours} onChange={set('min_hours')} />
      </Section>

      <Section title="Location">
        <PinPicker spot={spot} onChange={setSpot} onDragging={setMapTouch} height={260} />
        <Field label="Parking spot" value={f.note} onChange={set('note')} placeholder="e.g. V5A car park" maxLength={30} />
      </Section>

      <Section title="Handover">
        {/* Kar has no key box: owner and renter arrange the key handover themselves (the database keeps every car on 'manual'). */}
        <Row gap={S.sm} style={{ alignItems: 'flex-start' }}>
          <Ionicons name="hand-left-outline" size={20} color={C.ink} />
          <Txt v="small" color={C.ink} style={{ flex: 1 }}>
            You and the renter arrange how the keys are handed over (call or WhatsApp them). Only hand them over once your Kar app shows &quot;On trip&quot;.
          </Txt>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt v="h3">Instant book</Txt>
            <Txt v="small">No approval needed</Txt>
          </View>
          <Toggle value={instant} onChange={setInstant} />
        </Row>
      </Section>

      <Section last>
        {car.is_listed ? (
          <Button
            title="Hide listing"
            icon="eye-off-outline"
            variant="danger"
            loading={hide.isPending}
            onPress={() => hide.mutate(undefined, { onSuccess: () => router.back() })}
          />
        ) : (
          <Txt v="small" style={{ textAlign: 'center' }}>Hidden. Turn on &quot;Accepting bookings&quot; in My cars to show it again.</Txt>
        )}
        <ErrorText error={hide.error} />
      </Section>
    </Screen>
  );
}
