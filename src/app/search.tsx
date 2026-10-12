import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayStrip } from '@/components/day-strip';
import { TimeWheel } from '@/components/time-wheel';
import { Button, IconButton, Ionicons, Row, Txt } from '@/components/ui';
import { C, MaxContentWidth, R, S } from '@/constants/theme';
import { api, keys } from '@/lib/api';
import { overlaps } from '@/lib/backend';
import { fmtDay, fmtDuration, fmtTime } from '@/lib/format';
import { quote, rm } from '@/lib/pricing';
import { setTripWindow, useTripWindow } from '@/lib/stores';

// "When do you need it?" — two boxes (Pickup / Return) edited with a day strip + time wheel.

const HOUR = 3_600_000;
const SLOTS = Array.from({ length: 48 }, (_, i) => i * 30); // minutes from midnight, 30-min steps

const atMinutes = (day: Date, mins: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, mins);
const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
const nextHalfHour = (now: number) => new Date(Math.ceil(now / (30 * 60_000)) * 30 * 60_000);

function presets(now: number) {
  const soon = nextHalfHour(now);
  const today = new Date(now);
  const tonight = atMinutes(today, 18 * 60) > new Date(now) ? today : new Date(now + 24 * HOUR);
  const tomorrow = new Date(now + 24 * HOUR);
  return [
    { label: 'Now · 2h', icon: 'flash' as const, start: soon, end: new Date(soon.getTime() + 2 * HOUR) },
    { label: 'Tonight', icon: 'moon' as const, start: atMinutes(tonight, 18 * 60), end: atMinutes(tonight, 23 * 60) },
    { label: 'Tomorrow', icon: 'sunny' as const, start: atMinutes(tomorrow, 8 * 60), end: atMinutes(tomorrow, 20 * 60) },
    { label: '1 day', icon: 'calendar' as const, start: soon, end: new Date(soon.getTime() + 24 * HOUR) },
  ];
}

export default function Search() {
  const { carId } = useLocalSearchParams<{ carId?: string }>();
  const { data: car } = useQuery({ queryKey: keys.car(carId ?? ''), queryFn: () => api.getCar(carId!), enabled: !!carId });
  const current = useTripWindow();

  // Captured once when the picker opens (render must stay pure).
  const [now] = useState(() => Date.now());
  const [start, setStart] = useState(() => current?.start ?? nextHalfHour(now));
  const [end, setEnd] = useState(() => current?.end ?? new Date(nextHalfHour(now).getTime() + 3 * HOUR));
  const [active, setActive] = useState<'pickup' | 'return'>('pickup');

  const minHours = car?.min_hours ?? 1;
  const hours = Math.ceil((end.getTime() - start.getTime()) / HOUR);
  const tooShort = hours < minHours;
  const inPast = start.getTime() < now - 15 * 60_000;
  const clash = car ? car.busy.some((b) => overlaps(b, start, end)) : false;
  const q = car && !tooShort ? quote(car, start, end) : null;
  const problem = inPast ? 'Pickup is in the past' : tooShort ? `Minimum ${minHours} hour${minHours > 1 ? 's' : ''}` : clash ? 'Booked at this time' : null;

  // Moving the pickup keeps the trip length, like Airbnb.
  const movePickup = (next: Date) => {
    const length = end.getTime() - start.getTime();
    setStart(next);
    setEnd(new Date(next.getTime() + length));
  };

  const editing = active === 'pickup' ? start : end;
  const setDay = (day: Date) => {
    const next = atMinutes(day, minutesOf(editing));
    if (active === 'pickup') movePickup(next);
    else setEnd(next);
  };
  const setTime = (mins: number, how: 'scroll' | 'tap') => {
    const next = atMinutes(editing, mins);
    if (active === 'pickup') {
      movePickup(next);
      if (how === 'tap') setActive('return');
    } else {
      setEnd(next);
    }
  };
  const slotDisabled = (mins: number) => {
    const t = atMinutes(editing, mins).getTime();
    return active === 'pickup' ? t < now - 15 * 60_000 : t < start.getTime() + minHours * HOUR;
  };

  const confirm = () => {
    setTripWindow({ start, end });
    router.back();
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton icon="close" onPress={() => router.back()} />
        <Txt v="h3">When do you need it?</Txt>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
          {presets(now).map((p) => (
            <Pressable
              key={p.label}
              onPress={() => {
                setStart(p.start);
                setEnd(p.end);
                setActive('pickup');
              }}
              style={styles.preset}>
              <Ionicons name={p.icon} size={14} color={C.ink} />
              <Txt v="small" color={C.ink} style={{ fontWeight: '600' }}>{p.label}</Txt>
            </Pressable>
          ))}
        </ScrollView>

        <Row gap={S.md}>
          <TimeBox label="Pickup" date={start} active={active === 'pickup'} onPress={() => setActive('pickup')} />
          <TimeBox label="Return" date={end} active={active === 'return'} onPress={() => setActive('return')} />
        </Row>

        <View style={{ alignItems: 'center', gap: 4 }}>
          <Txt v="h3">
            {fmtDuration(Math.max(hours, 0))}
            {q ? ` · ${rm(q.total)} total` : ''}
          </Txt>
          {problem ? (
            <Row gap={4}>
              <Ionicons name="alert-circle" size={14} color={C.danger} />
              <Txt v="small" color={C.danger}>{problem}</Txt>
            </Row>
          ) : null}
        </View>

        <View style={styles.editor}>
          <Txt v="small" style={{ textAlign: 'center' }}>{active === 'pickup' ? 'Pickup' : 'Return'} day & time</Txt>
          <DayStrip value={editing} onChange={setDay} from={now} />
          <TimeWheel
            options={SLOTS}
            value={minutesOf(editing) - (minutesOf(editing) % 30)}
            onChange={setTime}
            format={(m) => fmtTime(atMinutes(editing, m))}
            isDisabled={slotDisabled}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Row style={styles.footerInner}>
          <Pressable
            onPress={() => {
              setTripWindow(null);
              router.back();
            }}>
            <Txt v="h3" underline>Clear</Txt>
          </Pressable>
          <Button title={`Confirm · ${fmtDuration(Math.max(hours, 0))}`} disabled={!!problem} onPress={confirm} style={{ minWidth: 170 }} />
        </Row>
      </View>
    </SafeAreaView>
  );
}

function TimeBox({ label, date, active, onPress }: { label: string; date: Date; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.box, active && styles.boxActive]}>
      <Txt v="tiny" style={{ fontWeight: '700', letterSpacing: 0.6 }}>{label.toUpperCase()}</Txt>
      <Txt v="small" color={C.ink}>{fmtDay(date)}</Txt>
      <Txt v="h2">{fmtTime(date)}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.lg,
    paddingVertical: S.md,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  body: { padding: S.xl, gap: S.xl, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  preset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: C.lineStrong,
    borderRadius: R.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  box: { flex: 1, gap: 2, padding: S.lg, borderRadius: R.lg, borderWidth: 1, borderColor: C.lineStrong },
  boxActive: { borderWidth: 2, borderColor: C.ink, backgroundColor: C.soft },
  editor: { gap: S.md, borderTopWidth: 1, borderTopColor: C.line, paddingTop: S.lg },
  footer: { borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: S.xl, paddingVertical: S.md, backgroundColor: C.bg },
  footerInner: { justifyContent: 'space-between', width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
});
