import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Choice, Field } from '@/components/car-form';
import { useZones } from '@/components/zone-picker';
import { Badge, Button, Card, ErrorText, Loading, Row, Screen, Section, Toggle, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api, useAction, useMe } from '@/lib/api';
import type { WaitlistEntry, WaitlistInput } from '@/lib/types';

const WHOSE: { key: WaitlistEntry['registered_to']; label: string }[] = [
  { key: 'me', label: 'Me' },
  { key: 'family', label: 'Family' },
  { key: 'other', label: 'Someone else' },
];

/**
 * Students who want to earn from their own car. Private cars can't be rented out on Kar until Kar has a P2P
 * insurer, so for now they join a free waitlist (no money taken). Kar uses it to plan supply and to show insurers
 * the demand.
 */
export default function OwnerWaitlist() {
  const { data: me, isLoading } = useMe();
  const entry = useQuery({ queryKey: ['owner-waitlist'], queryFn: () => api.myWaitlistEntry(), enabled: !!me });
  const [editing, setEditing] = useState(false);

  if (isLoading || entry.isLoading) return <Loading />;
  if (!me) {
    return (
      <Screen edges={['bottom']}>
        <Txt>Log in first to join the waitlist.</Txt>
        <Button title="Log in" onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  }
  if (entry.data && !editing) return <OnTheList w={entry.data} onEdit={() => setEditing(true)} />;
  return <WaitlistForm initial={entry.data ?? null} onDone={() => setEditing(false)} />;
}

function OnTheList({ w, onEdit }: { w: WaitlistEntry; onEdit: () => void }) {
  const leave = useAction(() => api.leaveOwnerWaitlist());
  return (
    <Screen edges={['bottom']}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="h2" style={{ flex: 1 }}>{w.car} ({w.car_year})</Txt>
          <Badge label="On the waitlist" tone="success" />
        </Row>
        <Txt v="small">Free about {w.free_days_per_week} day{w.free_days_per_week > 1 ? 's' : ''} a week{w.wants_pro ? ', interested in Pro' : ''}.</Txt>
        <Txt v="small">We&apos;ll message you as soon as student cars can be listed. Nothing to pay until then.</Txt>
      </Card>
      <Notes w={w} />
      <Button title="Change my answers" variant="outline" onPress={onEdit} />
      <Button title="Leave the waitlist" variant="ghost" loading={leave.isPending} onPress={() => leave.mutate(undefined)} />
      <ErrorText error={leave.error} />
    </Screen>
  );
}

/** What the student must sort out before their car can go live. */
function Notes({ w }: { w: Pick<WaitlistEntry, 'registered_to' | 'on_loan'> }) {
  const notes = [
    w.registered_to !== 'me' ? 'The car is not in your name: you will need the owner’s written OK.' : null,
    w.on_loan ? 'The car is still on a loan: the bank must agree before it can be rented out.' : null,
  ].filter(Boolean);
  return notes.map((n) => <Txt key={n} v="small" color={C.warning}>{n}</Txt>);
}

function WaitlistForm({ initial, onDone }: { initial: WaitlistEntry | null; onDone: () => void }) {
  const { zones, zone } = useZones();
  const [zoneId, setZoneId] = useState(initial?.zone_id ?? zone.id);
  const [car, setCar] = useState(initial?.car ?? '');
  const [year, setYear] = useState(initial ? String(initial.car_year) : '');
  const [whose, setWhose] = useState<WaitlistEntry['registered_to'] | null>(initial?.registered_to ?? null);
  const [onLoan, setOnLoan] = useState<boolean | null>(initial?.on_loan ?? null);
  const [days, setDays] = useState<number | null>(initial?.free_days_per_week ?? null);
  const [pro, setPro] = useState(initial?.wants_pro ?? false);

  const join = useAction(async () => {
    if (!whose) throw new Error('Choose whose name the car is in');
    if (onLoan === null) throw new Error('Say whether the car is still on a loan');
    if (!days) throw new Error('Choose how many days a week the car is free');
    const input: WaitlistInput = { zone_id: zoneId, car, car_year: Number(year), registered_to: whose, on_loan: onLoan, free_days_per_week: days, wants_pro: pro };
    await api.joinOwnerWaitlist(input);
    onDone();
  });

  return (
    <Screen
      edges={['bottom']}
      footer={<Button title={initial ? 'Save' : 'Join the waitlist'} loading={join.isPending} onPress={() => join.mutate(undefined)} />}>
      <View style={{ gap: S.xs }}>
        <Txt v="h1">Earn from your own car</Txt>
        <Txt v="small">
          Coming soon. Kar is setting up insurance so students can rent out their own cars safely. Join the waitlist:
          it&apos;s free, and we&apos;ll message you as soon as you can list.
        </Txt>
      </View>

      {zones.length > 1 ? (
        <Section title="Area">
          <View style={styles.pills}>
            {zones.map((z) => (
              <Pill key={z.id} label={z.name} on={z.id === zoneId} onPress={() => setZoneId(z.id)} />
            ))}
          </View>
        </Section>
      ) : null}

      <Section title="Your car">
        <Field label="Make and model" value={car} onChange={setCar} placeholder="Perodua Myvi" maxLength={60} />
        <Field label="Year made" value={year} onChange={(v) => setYear(v.replace(/\D/g, ''))} placeholder="2019" keyboard="number-pad" maxLength={4} />
      </Section>

      <Section title="Whose name is the car in?">
        <Row>
          {WHOSE.map((o) => (
            <Choice key={o.key} icon={o.key === 'me' ? 'person-outline' : 'people-outline'} label={o.label} selected={whose === o.key} onPress={() => setWhose(o.key)} />
          ))}
        </Row>
      </Section>

      <Section title="Is it still on a car loan?">
        <Row>
          <Choice icon="card-outline" label="Yes" selected={onLoan === true} onPress={() => setOnLoan(true)} />
          <Choice icon="checkmark-circle-outline" label="No, paid off" selected={onLoan === false} onPress={() => setOnLoan(false)} />
        </Row>
      </Section>
      {whose && onLoan !== null ? <Notes w={{ registered_to: whose, on_loan: onLoan }} /> : null}

      <Section title="Days a week it sits unused">
        <View style={styles.pills}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <Pill key={d} label={String(d)} on={days === d} onPress={() => setDays(d)} />
          ))}
        </View>
      </Section>

      <Section title="Pro" last>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="h3">I&apos;m interested in Pro</Txt>
            <Txt v="small">A GPS tracker for your car and a lower Kar fee. Prices come before you decide.</Txt>
          </View>
          <Toggle value={pro} onChange={setPro} />
        </Row>
      </Section>

      <ErrorText error={join.error} />
      {initial ? <Button title="Cancel" variant="ghost" onPress={onDone} /> : null}
    </Screen>
  );
}

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, on && styles.pillOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Txt v="h3" color={on ? '#fff' : C.ink}>{label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  pill: { minWidth: 44, alignItems: 'center', paddingHorizontal: S.md, paddingVertical: S.sm, borderRadius: R.pill, borderWidth: 1, borderColor: C.lineStrong },
  pillOn: { backgroundColor: C.brand, borderColor: C.brand },
});
