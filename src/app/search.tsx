import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayStrip } from '@/components/day-strip';
import { Button, IconButton, Ionicons, Row, Txt } from '@/components/ui';
import { C, MaxContentWidth, R, S, PageX } from '@/constants/theme';
import { api, keys } from '@/lib/api';
import { overlaps } from '@/lib/backend';
import { fmtDay, fmtDuration, fmtTime } from '@/lib/format';
import { quote, rm } from '@/lib/pricing';
import { setTripWindow, useTripWindow } from '@/lib/stores';

// "When do you need it?": pick a start (day + time row), then how long (2h, 4h, 1 day…).
// Students think "2 hours tonight", not two exact times; "Other…" still allows an exact return time.

const HOUR = 3_600_000;
const SLOTS = Array.from({ length: 48 }, (_, i) => i * 30); // minutes from midnight, 30-min steps
const LENGTHS = [2, 4, 8, 24, 48, 72]; // hours

const atMinutes = (day: Date, mins: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, mins);
const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
/** "Now", rounded up to the next 5 minutes so the time reads cleanly. */
const roundedNow = (now: number) => new Date(Math.ceil(now / (5 * 60_000)) * 5 * 60_000);

export default function Search() {
  const { carId } = useLocalSearchParams<{ carId?: string }>();
  const { data: car } = useQuery({ queryKey: keys.car(carId ?? ''), queryFn: () => api.getCar(carId!), enabled: !!carId });
  const current = useTripWindow();

  // Captured once when the picker opens (render must stay pure).
  const [now] = useState(() => Date.now());
  const [start, setStart] = useState(() => current?.start ?? roundedNow(now));
  // Trip length in hours from a chip, or null when the renter picked an exact return time ("Other…").
  const [length, setLength] = useState<number | null>(() => {
    if (!current) return 2;
    const h = (current.end.getTime() - current.start.getTime()) / HOUR;
    return LENGTHS.includes(h) ? h : null;
  });
  const [customEnd, setCustomEnd] = useState(() => current?.end ?? new Date(roundedNow(now).getTime() + 2 * HOUR));
  const minHours = car?.min_hours ?? 1;
  // A car with a longer minimum (e.g. 4 hours) doesn't offer the shorter chips: use the shortest one it allows.
  const len = length !== null && length < minHours ? (LENGTHS.find((h) => h >= minHours) ?? null) : length;
  const end = len ? new Date(start.getTime() + len * HOUR) : customEnd;

  const hours = Math.ceil((end.getTime() - start.getTime()) / HOUR);
  const tooShort = hours < minHours;
  const inPast = start.getTime() < now - 15 * 60_000;
  const clash = car ? car.busy.some((b) => overlaps(b, start, end)) : false;
  const problem = inPast ? 'Start is in the past' : tooShort ? `Minimum ${minHours} hour${minHours > 1 ? 's' : ''}` : clash ? 'Booked at this time' : null;
  const price = car && !problem ? quote(car, start, end).trip : null;

  // Start times: today only from now on (first one is "Now"), other days every 30 minutes.
  const startSlots = sameDay(start, new Date(now))
    ? [{ at: roundedNow(now), label: 'Now' }, ...SLOTS.map((m) => ({ at: atMinutes(start, m), label: '' })).filter((s) => s.at.getTime() > roundedNow(now).getTime())]
    : SLOTS.map((m) => ({ at: atMinutes(start, m), label: '' }));
  const setStartDay = (day: Date) => {
    const today = sameDay(day, new Date(now));
    const next = atMinutes(day, minutesOf(start));
    setStart(today && next.getTime() < now ? roundedNow(now) : next);
  };

  // "Other…": exact return time, at least the minimum after the start.
  const endSlots = SLOTS.map((m) => ({ at: atMinutes(customEnd, m), label: '' })).filter((s) => s.at.getTime() >= start.getTime() + minHours * HOUR);
  const chooseOther = () => {
    setCustomEnd(end);
    setLength(null);
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
        <View style={styles.block}>
          <Txt v="label">Start</Txt>
          <DayStrip value={start} onChange={setStartDay} from={now} />
          <TimeRow slots={startSlots} value={start} onChange={setStart} />
        </View>

        <View style={styles.block}>
          <Txt v="label">How long?</Txt>
          <View style={styles.chips}>
            {LENGTHS.filter((h) => h >= minHours).map((h) => (
              <Chip key={h} label={h < 24 ? `${h}h` : `${h / 24} day${h > 24 ? 's' : ''}`} on={len === h} onPress={() => setLength(h)} />
            ))}
            <Chip label="Other…" on={len === null} onPress={chooseOther} />
          </View>
          {len === null ? (
            <View style={{ gap: S.md, marginTop: S.sm }}>
              <Txt v="small">Return</Txt>
              <DayStrip value={customEnd} onChange={(d) => setCustomEnd(atMinutes(d, minutesOf(customEnd)))} from={start.getTime()} />
              <TimeRow slots={endSlots} value={customEnd} onChange={setCustomEnd} />
            </View>
          ) : null}
        </View>

        {/* The whole trip in plain words, with the price when picking for one car. */}
        <View style={styles.summary}>
          {problem ? (
            <Row gap={4}>
              <Ionicons name="alert-circle" size={14} color={C.danger} />
              <Txt v="small" color={C.danger}>{problem}</Txt>
            </Row>
          ) : (
            <>
              <Txt v="h3">
                {fmtDay(start)}, {fmtTime(start)} → {sameDay(start, end) ? '' : `${fmtDay(end)}, `}
                {fmtTime(end)}
              </Txt>
              {price !== null ? <Txt v="small">{rm(price)} for {fmtDuration(hours)}</Txt> : null}
            </>
          )}
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
          <Button title={`Confirm (${fmtDuration(Math.max(hours, 0))})`} disabled={!!problem} onPress={confirm} style={{ minWidth: 170 }} />
        </Row>
      </View>
    </SafeAreaView>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
      <Text style={[styles.chipText, on && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const SLOT_W = 76;

/** One swipeable row of times; scrolls so the chosen one is in view. */
function TimeRow({ slots, value, onChange }: { slots: { at: Date; label: string }[]; value: Date; onChange: (d: Date) => void }) {
  const ref = useRef<ScrollViewInstance>(null);
  const index = Math.max(0, slots.findIndex((s) => s.at.getTime() === value.getTime()));
  const dayKey = slots[0]?.at.toDateString();
  useEffect(() => {
    ref.current?.scrollTo({ x: Math.max(0, index * (SLOT_W + S.sm) - SLOT_W), animated: false });
    // Only when the day changes or the row opens, not on every tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey]);
  return (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
      {slots.map((s) => {
        const on = s.at.getTime() === value.getTime();
        return (
          <Pressable key={s.at.getTime()} onPress={() => onChange(s.at)} style={[styles.slot, on && styles.chipOn]}>
            <Text style={[styles.chipText, on && { color: '#fff' }]}>{s.label || fmtTime(s.at)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
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
  body: { paddingHorizontal: PageX, paddingVertical: S.xl, gap: S.xl, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  block: { gap: S.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  chip: { borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.pill, paddingHorizontal: S.lg, paddingVertical: 10 },
  slot: { width: SLOT_W, alignItems: 'center', borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.pill, paddingVertical: 10 },
  chipOn: { backgroundColor: C.brand, borderColor: C.brand },
  chipText: { fontSize: 14, fontWeight: '600', color: C.ink },
  summary: { gap: 2, padding: S.lg, borderRadius: R.lg, backgroundColor: C.soft },
  footer: { borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: PageX, paddingVertical: S.md, backgroundColor: C.bg },
  footerInner: { justifyContent: 'space-between', width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
});
