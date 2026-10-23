import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvailabilityKey, DayBookings } from '@/components/car-schedule';
import { MonthCalendar } from '@/components/month-calendar';
import { Button, IconButton, Row, Txt } from '@/components/ui';
import { Wheel, Wheels } from '@/components/wheel';
import { C, MaxContentWidth, R, S, PageX } from '@/constants/theme';
import { api, keys } from '@/lib/api';
import { overlaps } from '@/lib/backend';
import { fmtDate, fmtLength, fmtTime } from '@/lib/format';
import { quote, rm, rmDeposit } from '@/lib/pricing';
import { setTripWindow, useTripWindow } from '@/lib/stores';

// "When do you need it?", like the iPhone Calendar: Starts, Ends and How long rows in one card. Tap a pill to open
// its picker under the row: a month calendar for dates, scroll wheels for times, a Timer-style days/hours wheel. Changing the start
// keeps the length; changing How long moves Ends; changing Ends updates How long.

const HOUR = 3_600_000;
const STEP = 15; // minutes
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 / STEP }, (_, i) => i * STEP);
const DAYS = Array.from({ length: 31 }, (_, i) => i);
const HOURS = Array.from({ length: 24 }, (_, i) => i);

type Open = 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'length' | null;

/** Rounded up to the next 15 minutes. */
const roundUp = (t: number) => new Date(Math.ceil(t / (STEP * 60_000)) * STEP * 60_000);
const withDay = (time: Date, day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.getHours(), time.getMinutes());

export default function Search() {
  const { carId } = useLocalSearchParams<{ carId?: string }>();
  const { data: car } = useQuery({ queryKey: keys.car(carId ?? ''), queryFn: () => api.getCar(carId!), enabled: !!carId });
  const current = useTripWindow();
  // Full-screen modal on iPhone: SafeAreaView can measure 0 there, so pad by the phone's own notch / home-bar gaps.
  const insets = useSafeAreaInsets();

  // Captured once when the picker opens (render must stay pure).
  const [now] = useState(() => Date.now());
  const [start, setStartRaw] = useState(() => current?.start ?? roundUp(now));
  const [end, setEnd] = useState(() => current?.end ?? new Date(roundUp(now).getTime() + 2 * HOUR));
  const [open, setOpen] = useState<Open>(null);
  // The day last tapped in the Availability calendar: its booked times show under the calendar.
  const [tapped, setTapped] = useState<Date | null>(null);
  // Airbnb-style range: the first tap picks the start day, the next tap the return day.
  const [pickingEnd, setPickingEnd] = useState(false);
  // Page scrolling pauses while a calendar handle is dragged, so up/down drags move the date instead.
  const [dragging, setDragging] = useState(false);
  // Dragging across the calendar picks both days at once (times stay as set).
  const dragRange = (a: Date, b: Date) => {
    const s0 = withDay(start, a);
    const e0 = withDay(end, b);
    setStartRaw(s0);
    setEnd(e0.getTime() - s0.getTime() >= minHours * HOUR ? e0 : new Date(s0.getTime() + minHours * HOUR));
    setPickingEnd(false);
    setTapped(b);
  };
  const pickRangeDay = (d: Date) => {
    setTapped(d);
    if (pickingEnd && d.getTime() >= new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()) {
      const next = withDay(end, d);
      setEnd(next.getTime() - start.getTime() >= minHours * HOUR ? next : new Date(start.getTime() + minHours * HOUR));
      setPickingEnd(false);
    } else {
      setStart(withDay(start, d));
      setPickingEnd(true);
    }
  };

  const minHours = car?.min_hours ?? 1;
  const hours = Math.max(0, Math.round((end.getTime() - start.getTime()) / HOUR));
  const inPast = start.getTime() < now - 15 * 60_000;
  const tooShort = end.getTime() - start.getTime() < minHours * HOUR;
  const clash = car ? car.busy.some((b) => overlaps(b, start, end)) : false;
  const problem = inPast ? 'Start is in the past' : tooShort ? `Minimum ${minHours} hour${minHours > 1 ? 's' : ''}` : clash ? 'Booked at this time' : null;
  // Same "total" as the car page and checkout: trip price + Kar's service fee + the refundable deposit.
  const q = car && !problem ? quote(car, start, end) : null;

  // Moving the start keeps the trip length, like the iPhone Calendar.
  const setStart = (next: Date) => {
    setEnd(new Date(next.getTime() + (end.getTime() - start.getTime())));
    setStartRaw(next);
  };
  // How long: at least the car's minimum.
  const setLength = (h: number) => setEnd(new Date(start.getTime() + Math.max(h, minHours) * HOUR));
  const toggle = (o: Open) => setOpen(open === o ? null : o);
  // Back to where the picker was opened from; after a page reload there is nothing behind it, so go to the car or Explore.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else if (carId) router.replace({ pathname: '/car/[id]', params: { id: carId } });
    else router.replace('/');
  };

  const confirm = () => {
    setTripWindow({ start, end });
    leave();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <IconButton icon="close" onPress={leave} />
        <Txt v="h3">When do you need it?</Txt>
        <Pressable
          onPress={() => {
            setTripWindow(null);
            leave();
          }}
          hitSlop={8}
          style={{ width: 44, alignItems: 'flex-end' }}>
          <Txt v="small" color={C.ink} underline>Clear</Txt>
        </Pressable>
      </View>

      <ScrollView style={{ backgroundColor: C.soft }} contentContainerStyle={styles.body} scrollEnabled={!dragging}>
        <View style={styles.card}>
          <Line label="Starts" at={start} dateOn={open === 'startDate'} timeOn={open === 'startTime'} onDate={() => toggle('startDate')} onTime={() => toggle('startTime')} />
          {open === 'startDate' ? (
            <View style={styles.panel}>
              <MonthCalendar value={start} rangeEnd={end} min={new Date(now)} busy={car?.busy} onChange={(d) => setStart(withDay(start, d))} />
            </View>
          ) : null}
          {open === 'startTime' ? (
            <View style={styles.panel}>
              <TimeWheels value={start} onChange={setStart} />
            </View>
          ) : null}

          <View style={styles.divider} />

          <Line label="Ends" at={end} dateOn={open === 'endDate'} timeOn={open === 'endTime'} onDate={() => toggle('endDate')} onTime={() => toggle('endTime')} />
          {open === 'endDate' ? (
            <View style={styles.panel}>
              <MonthCalendar value={start} rangeEnd={end} min={start} busy={car?.busy} onChange={(d) => setEnd(withDay(end, d))} />
            </View>
          ) : null}
          {open === 'endTime' ? (
            <View style={styles.panel}>
              <TimeWheels value={end} onChange={setEnd} />
            </View>
          ) : null}

          <View style={styles.divider} />

          {/* How long: tap to open a Timer-style wheel with days and hours. */}
          <View style={styles.line}>
            <Text style={styles.lineLabel}>How long</Text>
            <Pressable onPress={() => toggle('length')} style={[styles.pill, styles.right]}>
              <Text style={[styles.pillText, open === 'length' && { color: C.brand }]}>{fmtLength(hours)}</Text>
            </Pressable>
          </View>
          {open === 'length' ? (
            <View style={styles.panel}>
              <Wheels>
                <Wheel options={DAYS} value={Math.floor(hours / 24)} onChange={(d) => setLength(d * 24 + (hours % 24))} unit={Math.floor(hours / 24) === 1 ? 'day' : 'days'} />
                <Wheel options={HOURS} value={hours % 24} onChange={(h) => setLength(Math.floor(hours / 24) * 24 + h)} unit={hours % 24 === 1 ? 'hour' : 'hours'} />
              </Wheels>
            </View>
          ) : null}
        </View>

        {/* The car's month: booked days marked on the calendar; tap a day to start then (only when picking for one car). */}
        {car ? (
          <View>
            <View style={[styles.card, { paddingVertical: S.lg, gap: S.lg }]}>
              <Txt v="small" style={{ textAlign: 'center' }}>{pickingEnd ? 'Tap return date' : 'Tap start date'}</Txt>
              <MonthCalendar value={start} rangeEnd={end} min={new Date(now)} busy={car.busy} onChange={pickRangeDay} onRange={dragRange} onDragging={setDragging} />
              <AvailabilityKey />
              {tapped ? <DayBookings busy={car.busy} day={tapped} /> : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {/* "Total RM69" on the left (what checkout will charge), Confirm on the right; a problem shows in red instead. */}
        <Row style={styles.footerInner}>
          <View style={{ flex: 1, gap: 6 }}>
            {problem ? (
              <Txt v="small" color={C.danger}>{problem}</Txt>
            ) : q ? (
              <>
                {/* Short trips: "Total RM69 · 2 hours" on one line. A day or more ("7 days 2 hours") goes on its own line below. */}
                <Text style={styles.total}>
                  Total <Text style={styles.totalAmount}>{rm(q.total)}</Text>
                  {hours < 24 ? <Text style={{ color: C.muted }}> · {fmtLength(hours)}</Text> : null}
                </Text>
                {hours >= 24 ? <Text style={[styles.total, { color: C.muted }]}>{fmtLength(hours)}</Text> : null}
                {q.deposit > 0 ? <Txt v="small">incl. {rmDeposit(q.deposit)} deposit</Txt> : null}
              </>
            ) : null}
          </View>
          <Button title="Confirm" disabled={!!problem} onPress={confirm} style={{ minWidth: 120 }} />
        </Row>
      </View>
    </View>
  );
}

/** "Starts   [Sat 24 Oct] [2am]": tap a pill to open its calendar or wheel; the open one turns blue. */
function Line({ label, at, dateOn, timeOn, onDate, onTime }: { label: string; at: Date; dateOn: boolean; timeOn: boolean; onDate: () => void; onTime: () => void }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Pressable onPress={onDate} style={styles.pill}>
        <Text style={[styles.pillText, dateOn && { color: C.brand }]}>{fmtDate(at)}</Text>
      </Pressable>
      <Pressable onPress={onTime} style={[styles.pill, styles.right]}>
        <Text style={[styles.pillText, timeOn && { color: C.brand }]}>{fmtTime(at)}</Text>
      </Pressable>
    </View>
  );
}

/** Hour, minute (15-minute steps) and am/pm wheels for one date. */
function TimeWheels({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const h = value.getHours();
  const pm = h >= 12;
  const hour12 = ((h + 11) % 12) + 1;
  const minute = Math.floor(value.getMinutes() / STEP) * STEP;
  const set = (hr: number, min: number, isPm: boolean) =>
    onChange(new Date(value.getFullYear(), value.getMonth(), value.getDate(), (hr % 12) + (isPm ? 12 : 0), min));
  return (
    <Wheels>
      <Wheel options={HOURS_12} value={hour12} onChange={(v) => set(v, minute, pm)} />
      <Wheel options={MINUTES} value={minute} onChange={(v) => set(hour12, v, pm)} format={(m) => String(m).padStart(2, '0')} />
      <Wheel options={['am', 'pm']} value={pm ? 'pm' : 'am'} onChange={(v) => set(hour12, minute, v === 'pm')} />
    </Wheels>
  );
}

const styles = StyleSheet.create({
  // Light grey middle with white cards, like the iPhone's grouped screens; top and bottom bars (and the notch area) stay white.
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.lg,
    paddingVertical: S.md,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    backgroundColor: C.bg,
  },
  body: { paddingHorizontal: PageX, paddingVertical: S.xl, gap: S.xl, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  // Grouped card like the iPhone Calendar's rows.
  card: { backgroundColor: C.bg, borderRadius: R.lg, paddingHorizontal: S.lg },
  line: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: S.md },
  lineLabel: { flex: 1, fontSize: 16, color: C.ink },
  pill: { backgroundColor: C.soft, borderRadius: R.sm, paddingHorizontal: S.md, paddingVertical: 8 },
  // The right-hand pills (times and How long) share one width so they line up in a column.
  right: { minWidth: 84, alignItems: 'center' },
  pillText: { fontSize: 15, fontWeight: '600', color: C.ink },
  panel: { paddingBottom: S.md },
  divider: { height: 1, backgroundColor: C.line },
  // Roomier bottom bar: more space above and below the total and Confirm.
  footer: { borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: PageX, paddingTop: S.lg, paddingBottom: S.xl, backgroundColor: C.bg },
  total: { fontSize: 15, color: C.ink },
  totalAmount: { fontSize: 18, fontWeight: '700' },
  footerInner: { gap: S.lg, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
});
