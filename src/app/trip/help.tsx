import { useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { EvidencePicker, type EvidencePhoto } from '@/components/evidence';
import { ContactButtons, currentCoords } from '@/components/trip-parts';
import { Button, Card, Empty, ErrorText, Ionicons, Loading, Row, Screen, Txt, type IconName } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api, keys, useAction } from '@/lib/api';
import { POLICY } from '@/lib/policy';
import type { IncidentKind } from '@/lib/types';

const KINDS: { kind: IncidentKind; title: string; sub: string; icon: IconName }[] = [
  { kind: 'accident', title: 'Accident', sub: 'Collision, someone hurt, police needed', icon: 'warning-outline' },
  { kind: 'breakdown', title: 'Breakdown', sub: "Won't start, flat tyre, warning light", icon: 'construct-outline' },
  { kind: 'cant_find', title: "Can't find the car / not ready", sub: 'Not at the pin, owner not there', icon: 'search-outline' },
  { kind: 'other', title: 'Something else', sub: 'Lost item, dirty car, anything', icon: 'chatbubble-ellipses-outline' },
];

const ACCIDENT_STEPS = [
  'Get everyone to safety. Turn on hazard lights.',
  'Anyone hurt? Call 999 now.',
  'Take photos of all cars, plates and the scene.',
  'Swap details with the other driver. Do not admit fault.',
  'Make a police report within 24 hours.',
];

/** Get help / SOS during a trip. Reports go to the owner and Kar with location and photos. */
export default function Help() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: b, isLoading } = useQuery({ queryKey: keys.booking(id), queryFn: () => api.getBooking(id) });
  const [kind, setKind] = useState<IncidentKind | null>(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<EvidencePhoto[]>([]);

  const send = useAction(async () => {
    if (!kind) return;
    const coords = await currentCoords();
    await api.reportIncident(id, kind, note.trim(), coords, photos.map((p) => p.path));
  });

  if (isLoading) return <Loading />;
  if (!b) return <Screen edges={[]}><ErrorText error="Trip not found" /></Screen>;

  if (send.isSuccess) {
    return (
      <Screen edges={['bottom']}>
        <Empty icon="checkmark-circle" title="Report sent" body="The owner and Kar have your report, location and photos." />
        <ContactButtons bookingId={id} />
        <SupportCard />
        <Button title="Back to trip" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (!kind) {
    return (
      <Screen edges={['bottom']}>
        <Txt v="h1">What happened?</Txt>
        <View style={{ gap: S.md }}>
          {KINDS.map((k) => (
            <Pressable key={k.kind} onPress={() => setKind(k.kind)} style={[styles.kind, k.kind === 'accident' && styles.kindUrgent]}>
              <Ionicons name={k.icon} size={26} color={k.kind === 'accident' ? C.danger : C.ink} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="h3">{k.title}</Txt>
                <Txt v="small">{k.sub}</Txt>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </Pressable>
          ))}
        </View>
        <SupportCard />
      </Screen>
    );
  }

  const current = KINDS.find((k) => k.kind === kind)!;
  return (
    <Screen
      edges={['bottom']}
      footer={<Button title="Send report" icon="send" loading={send.isPending} onPress={() => send.mutate(undefined)} />}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h1">{current.title}</Txt>
        <Button title="Change" variant="ghost" onPress={() => setKind(null)} />
      </Row>

      {kind === 'accident' ? (
        <Card style={{ borderColor: C.danger }}>
          {ACCIDENT_STEPS.map((step, i) => (
            <Row key={step} gap={S.md} style={{ alignItems: 'flex-start' }}>
              <View style={styles.stepNum}><Txt v="tiny" color="#fff" style={{ fontWeight: '700' }}>{i + 1}</Txt></View>
              <Txt style={{ flex: 1 }}>{step}</Txt>
            </Row>
          ))}
          <Button title="Call 999" icon="call" variant="danger" onPress={() => Linking.openURL('tel:999')} />
          <Txt v="tiny" style={{ textAlign: 'center' }}>Emergency number: 999 (112 from a mobile)</Txt>
        </Card>
      ) : null}

      <View style={{ gap: S.sm }}>
        <Txt v="h3">Details</Txt>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={kind === 'cant_find' ? 'e.g. Not at V5A car park, owner not answering' : 'What happened?'}
          placeholderTextColor={C.muted}
          multiline
          style={styles.note}
        />
      </View>
      <View style={{ gap: S.sm }}>
        <Txt v="h3">Photos</Txt>
        <EvidencePicker bookingId={id} photos={photos} onChange={setPhotos} />
      </View>
      <Txt v="small">Your location is attached automatically.</Txt>
      <ErrorText error={send.error} />
    </Screen>
  );
}

function SupportCard() {
  return (
    <Card>
      <Txt v="h3">Kar support</Txt>
      <Txt v="small">WhatsApp {POLICY.supportWhatsApp.replace(/^60/, '+60 ')}</Txt>
      <Button title="WhatsApp Kar" icon="logo-whatsapp" variant="outline" size="md" onPress={() => Linking.openURL(`https://wa.me/${POLICY.supportWhatsApp}`)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  kind: { flexDirection: 'row', alignItems: 'center', gap: S.lg, padding: S.lg, borderRadius: R.lg, borderWidth: 1, borderColor: C.lineStrong },
  kindUrgent: { borderColor: C.danger, backgroundColor: C.dangerSoft },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  note: {
    borderWidth: 1,
    borderColor: C.lineStrong,
    borderRadius: R.md,
    padding: S.md,
    fontSize: 16,
    color: C.ink,
    minHeight: 90,
    textAlignVertical: 'top',
  },
});
