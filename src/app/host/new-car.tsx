import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { carSchema, Choice, Field, Money, PhotoPicker, PinPicker, priceSchema, validKeybox } from '@/components/car-form';
import { checkDocs, type DocsDraft, emptyDocs, OperatorDocsFields, submitDocs } from '@/components/operator-docs';
import { useZones } from '@/components/zone-picker';
import { Button, ErrorText, Loading, Row, Screen, Toggle, Txt } from '@/components/ui';
import { C, S } from '@/constants/theme';
import { api, useAction, useMe } from '@/lib/api';

// Airbnb-style host onboarding: one short question per step.

const CAR_STEPS = ['Your car', 'Photos', 'Price', 'Location', 'Handover'] as const;

/**
 * "Register your car" (after host/register picks who) and "Add car" for owners. A rental operator Kar hasn't
 * approved yet sends their business documents as the last step, in the same flow. Every new car waits for Kar.
 */
export default function NewCar() {
  const { as } = useLocalSearchParams<{ as?: 'student' | 'operator' }>();
  const { data: me, isLoading } = useMe();
  const docsQuery = useQuery({ queryKey: ['operator-docs'], queryFn: () => api.myOperatorDocs(), enabled: !!me });
  const needsDocs = as === 'operator' && api.mode !== 'demo' && !me?.is_owner && docsQuery.data?.status !== 'pending';
  const STEPS = needsDocs ? [...CAR_STEPS, 'Your business' as const] : CAR_STEPS;
  const [docs, setDocs] = useState<DocsDraft>(emptyDocs);
  const [docsSent, setDocsSent] = useState(false);
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ make: '', model: '', year: '', plate: '', price_per_hour: '8', price_per_day: '70', note: '', keybox: '' });
  const [transmission, setTransmission] = useState<'auto' | 'manual'>('auto');
  const [handover, setHandover] = useState<'manual' | 'keybox'>('manual');
  const [instant, setInstant] = useState(true);
  const [photos, setPhotos] = useState<string[]>([]);
  const { zones, zone: browsing } = useZones();
  const [zoneId, setZoneId] = useState(browsing.id);
  const zone = zones.find((z) => z.id === zoneId) ?? browsing;
  const [spot, setSpot] = useState({ lat: browsing.center_lat, lng: browsing.center_lng });
  const [error, setError] = useState<string | null>(null);
  const [mapTouch, setMapTouch] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const save = useAction(async () => {
    // Documents first: if the car then fails, a retry doesn't send them twice.
    if (needsDocs && !docsSent) {
      await submitDocs(docs);
      setDocsSent(true);
    }
    const car = carSchema.parse(f);
    const price = priceSchema.parse(f);
    await api.createCar(
      {
        ...car,
        ...price,
        zone_id: zone.id,
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
      case 'Your business':
        return checkDocs(docs);
    }
  };

  const next = () => {
    const problem = check();
    setError(problem);
    if (problem) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else save.mutate(undefined, { onSuccess: () => router.back() });
  };

  if (isLoading || docsQuery.isLoading) return <Loading />;
  const name = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <Screen
      edges={['bottom']}
      scrollEnabled={!mapTouch}
      footer={
        <View style={{ gap: S.md }}>
          <ErrorText error={error ?? save.error} />
          <View style={styles.progress}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.progressBar, i <= step && { backgroundColor: C.brand }]} />
            ))}
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            {step > 0 ? <Button title="Back" variant="ghost" onPress={() => { setError(null); setStep(step - 1); }} /> : <View />}
            <Button
              title={!last ? 'Next' : needsDocs ? 'Send to Kar' : as ? 'Register car' : 'List car'}
              variant={last ? 'primary' : 'dark'}
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
          <Txt v="small">Most cars on Kar: RM8–10 / hour</Txt>
          <Money label="Per hour" value={f.price_per_hour} onChange={set('price_per_hour')} />
          <Money label="Per day" value={f.price_per_day} onChange={set('price_per_day')} />
        </>
      ) : null}

      {name === 'Location' ? (
        <>
          <Txt v="h1">Where&apos;s it parked?</Txt>
          {zones.length > 1 ? (
            <View style={{ gap: S.sm }}>
              <Txt v="h3">Area</Txt>
              <Row style={{ flexWrap: 'wrap' }}>
                {zones.map((z) => (
                  <Button
                    key={z.id}
                    title={z.name}
                    size="md"
                    variant={z.id === zone.id ? 'dark' : 'outline'}
                    onPress={() => {
                      setZoneId(z.id);
                      setSpot({ lat: z.center_lat, lng: z.center_lng });
                    }}
                  />
                ))}
              </Row>
            </View>
          ) : null}
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

      {name === 'Your business' ? (
        <>
          <Txt v="h1">Your rental business</Txt>
          <Txt v="small">Kar checks your permit and insurance, usually within a day, then approves your car.</Txt>
          <OperatorDocsFields value={docs} onChange={setDocs} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: 4 },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.line },
});
