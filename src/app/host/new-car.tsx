import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { carSchema, Choice, Field, Money, PhotoPicker, PinPicker, priceSchema, UTP, validKeybox } from '@/components/car-form';
import { Button, ErrorText, Row, Screen, Toggle, Txt } from '@/components/ui';
import { C, S } from '@/constants/theme';
import { api, useAction } from '@/lib/api';

// Airbnb-style host onboarding: one short question per step.

const STEPS = ['Your car', 'Photos', 'Price', 'Location', 'Handover'] as const;

export default function NewCar() {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ make: '', model: '', year: '', plate: '', price_per_hour: '8', price_per_day: '70', deposit: '50', note: '', keybox: '' });
  const [transmission, setTransmission] = useState<'auto' | 'manual'>('auto');
  const [handover, setHandover] = useState<'manual' | 'keybox'>('manual');
  const [instant, setInstant] = useState(true);
  const [photos, setPhotos] = useState<string[]>([]);
  const [spot, setSpot] = useState(UTP);
  const [error, setError] = useState<string | null>(null);
  const [mapTouch, setMapTouch] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const save = useAction(async () => {
    const car = carSchema.parse(f);
    const price = priceSchema.parse(f);
    await api.createCar(
      {
        ...car,
        ...price,
        zone_id: 'utp',
        transmission,
        seats: 5,
        fuel: 'petrol',
        photos,
        description: '',
        late_fee_per_hour: 10,
        min_hours: 2,
        instant_book: instant,
        handover,
        pickup_lat: spot.lat,
        pickup_lng: spot.lng,
        pickup_note: f.note.trim(),
      },
      handover === 'keybox' ? f.keybox : null,
    );
  });

  const check = (): string | null => {
    switch (STEPS[step]) {
      case 'Your car': {
        const r = carSchema.safeParse(f);
        return r.success ? null : r.error.issues[0].message;
      }
      case 'Photos':
        return photos.length ? null : 'Add at least 1 photo';
      case 'Price': {
        const r = priceSchema.safeParse(f);
        return r.success ? null : r.error.issues[0].message;
      }
      case 'Location':
        return f.note.trim().length < 3 ? 'Add a short note, e.g. "Block 22 car park"' : null;
      case 'Handover':
        return handover === 'keybox' && !validKeybox(f.keybox) ? 'Key box code: 3–8 digits' : null;
    }
  };

  const next = () => {
    const problem = check();
    setError(problem);
    if (problem) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else save.mutate(undefined, { onSuccess: () => router.back() });
  };

  const name = STEPS[step];

  return (
    <Screen
      edges={['bottom']}
      scrollEnabled={!mapTouch}
      footer={
        <View style={{ gap: S.md }}>
          <ErrorText error={error ?? save.error} />
          <View style={styles.progress}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.progressBar, i <= step && { backgroundColor: C.ink }]} />
            ))}
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            {step > 0 ? <Button title="Back" variant="ghost" onPress={() => { setError(null); setStep(step - 1); }} /> : <View />}
            <Button
              title={step === STEPS.length - 1 ? 'List car' : 'Next'}
              variant={step === STEPS.length - 1 ? 'primary' : 'dark'}
              loading={save.isPending}
              onPress={next}
              style={{ minWidth: 130 }}
            />
          </Row>
        </View>
      }>
      <Stack.Screen options={{ title: name }} />

      {name === 'Your car' ? (
        <>
          <Txt v="h1">What car is it?</Txt>
          <Row>
            <Field label="Make" value={f.make} onChange={set('make')} placeholder="Perodua" />
            <Field label="Model" value={f.model} onChange={set('model')} placeholder="Myvi" />
          </Row>
          <Row>
            <Field label="Year" value={f.year} onChange={set('year')} placeholder="2021" keyboard="number-pad" />
            <Field label="Plate" value={f.plate} onChange={set('plate')} placeholder="AKB 1234" caps />
          </Row>
          <Row>
            <Choice icon="speedometer-outline" label="Auto" selected={transmission === 'auto'} onPress={() => setTransmission('auto')} />
            <Choice icon="cog-outline" label="Manual" selected={transmission === 'manual'} onPress={() => setTransmission('manual')} />
          </Row>
        </>
      ) : null}

      {name === 'Photos' ? (
        <>
          <Txt v="h1">Add some photos</Txt>
          <Txt v="small">Outside and inside. Bright, clear photos get more bookings.</Txt>
          <PhotoPicker photos={photos} onChange={setPhotos} />
        </>
      ) : null}

      {name === 'Price' ? (
        <>
          <Txt v="h1">Set your price</Txt>
          <Txt v="small">UTP average: RM8–10 / hour</Txt>
          <Money label="Per hour" value={f.price_per_hour} onChange={set('price_per_hour')} />
          <Money label="Per day" value={f.price_per_day} onChange={set('price_per_day')} />
          <Money label="Deposit" value={f.deposit} onChange={set('deposit')} />
        </>
      ) : null}

      {name === 'Location' ? (
        <>
          <Txt v="h1">Where&apos;s it parked?</Txt>
          <Field label="Parking spot (what customers look for)" value={f.note} onChange={set('note')} placeholder="e.g. V5A car park" maxLength={30} />
          <Txt v="small">Move the map so the pin sits on the car.</Txt>
          <PinPicker spot={spot} onChange={setSpot} onDragging={setMapTouch} height={260} />
        </>
      ) : null}

      {name === 'Handover' ? (
        <>
          <Txt v="h1">How do they get the key?</Txt>
          <Row>
            <Choice icon="hand-left-outline" label="Meet them" selected={handover === 'manual'} onPress={() => setHandover('manual')} />
            <Choice icon="key-outline" label="Key box" selected={handover === 'keybox'} onPress={() => setHandover('keybox')} />
          </Row>
          {handover === 'keybox' ? (
            <Field label="Key box code" value={f.keybox} onChange={set('keybox')} placeholder="4821" keyboard="number-pad" />
          ) : null}
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt v="h3">Instant book</Txt>
              <Txt v="small">No approval needed</Txt>
            </View>
            <Toggle value={instant} onChange={setInstant} />
          </Row>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: 4 },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.line },
});
