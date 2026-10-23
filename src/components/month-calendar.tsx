import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type HostInstance } from 'react-native';

import { dayStatus, type BusyRange } from '@/components/car-schedule';
import { Ionicons } from '@/components/ui';
import { C, S } from '@/constants/theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const CELL_H = 44;
// Web: the browser would scroll the page on an up/down drag over the grid before we see it.
const WEB_NO_SCROLL = { touchAction: 'none' } as object;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * iPhone Calendar-style month grid: arrows to change month, past days greyed, the chosen day in a filled circle.
 * With `busy`, partly booked days get a light orange circle and fully booked days a grey circle, crossed out.
 * With `rangeEnd`, the days from `value` to `rangeEnd` are joined by a light blue band, like Airbnb's date range.
 * With `onRange`, the range's first and last days are handles: press one and drag to stretch or shrink that end
 * (the other end stays put). Other days are plain taps.
 */
export function MonthCalendar({
  value,
  onChange,
  min,
  busy = [],
  rangeEnd,
  onRange,
  onDragging,
}: {
  value: Date;
  onChange: (day: Date) => void;
  min: Date;
  busy?: BusyRange[];
  rangeEnd?: Date;
  onRange?: (from: Date, to: Date) => void;
  /** True while a handle is being dragged, so the page can stop scrolling (up/down drags would scroll it). */
  onDragging?: (dragging: boolean) => void;
}) {
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const first = startOfDay(min);
  const today = startOfDay(new Date());
  const canGoBack = month > new Date(first.getFullYear(), first.getMonth(), 1);

  // Monday-first grid: blanks before the 1st, then every day of the month.
  const lead = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  while (cells.length % 7) cells.push(null);

  // Dragging a handle: `a` is the end that stays put, `b` the day under the finger (the band follows it).
  // `handle` is false for a press on any other day, which only counts as a tap on release.
  type Drag = { a: number; b: number; handle: boolean };
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const grid = useRef<HostInstance>(null);
  const gridPos = useRef({ x: 0, y: 0, w: 0 });

  const valueDay = startOfDay(value).getTime();
  const endDay = rangeEnd ? startOfDay(rangeEnd).getTime() : valueDay;
  const dragging = drag?.handle ? drag : null;
  const from = dragging ? Math.min(dragging.a, dragging.b) : valueDay;
  const to = dragging ? Math.max(dragging.a, dragging.b) : endDay;

  // Which day is under a point on the screen (null for blanks, past days and outside the grid).
  const dayAt = (pageX: number, pageY: number) => {
    const { x, y, w } = gridPos.current;
    const col = Math.floor((pageX - x) / (w / 7));
    const row = Math.floor((pageY - y) / CELL_H);
    if (col < 0 || col > 6 || row < 0) return null;
    const d = cells[row * 7 + col];
    return d && d >= first ? d.getTime() : null;
  };
  const setBoth = (v: Drag | null) => {
    if (!!v?.handle !== !!dragRef.current?.handle) onDragging?.(!!v?.handle);
    dragRef.current = v;
    setDrag(v);
  };
  // Touch handlers on the grid itself (press, drag, release); a plain tap still goes to onChange.
  const dragHandlers = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      const { pageX, pageY } = e.nativeEvent;
      // Measure now: the page may have scrolled since the calendar was laid out.
      grid.current?.measure((_x: number, _y: number, w: number, _h: number, px: number, py: number) => {
        gridPos.current = { x: px, y: py, w };
        const d = dayAt(pageX, pageY);
        if (d === null) return setBoth(null);
        // Pressing the start day moves the start (the end stays); pressing the end day moves the end.
        if (d === valueDay) setBoth({ a: endDay, b: d, handle: true });
        else if (d === endDay) setBoth({ a: valueDay, b: d, handle: true });
        else setBoth({ a: d, b: d, handle: false });
      });
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const cur = dragRef.current;
      const d = dayAt(e.nativeEvent.pageX, e.nativeEvent.pageY);
      if (cur?.handle && d !== null && d !== cur.b) setBoth({ ...cur, b: d });
    },
    onResponderRelease: () => {
      const cur = dragRef.current;
      setBoth(null);
      if (!cur) return;
      if (!cur.handle) onChange(new Date(cur.b));
      else if (onRange) onRange(new Date(Math.min(cur.a, cur.b)), new Date(Math.max(cur.a, cur.b)));
    },
    onResponderTerminate: () => setBoth(null),
  };

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <View style={{ gap: S.sm }}>
      <View style={styles.head}>
        <Text style={styles.month}>
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </Text>
        <View style={{ flexDirection: 'row', gap: S.lg }}>
          <Pressable onPress={() => canGoBack && shift(-1)} hitSlop={10} accessibilityLabel="Previous month" style={{ opacity: canGoBack ? 1 : 0.3 }}>
            <Ionicons name="chevron-back" size={22} color={C.brand} />
          </Pressable>
          <Pressable onPress={() => shift(1)} hitSlop={10} accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={22} color={C.brand} />
          </Pressable>
        </View>
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>{w}</Text>
        ))}
      </View>
      <View
        ref={grid}
        style={[styles.grid, onRange && Platform.OS === 'web' && WEB_NO_SCROLL]}
        onTouchEnd={onRange ? () => onDragging?.(false) : undefined}
        onTouchCancel={onRange ? () => onDragging?.(false) : undefined}
        {...(onRange ? dragHandlers : {})}>
        {cells.map((d, i) => {
          if (!d) return <View key={`b${i}`} style={styles.cell} />;
          const past = d < first;
          const t = d.getTime();
          const selected = t === from || t === to;
          // Band behind the circles: right half on the first day, left half on the last, full width between.
          const band = to > from && t >= from && t <= to ? (t === from ? styles.bandStart : t === to ? styles.bandEnd : styles.bandMid) : null;
          const isToday = d.getTime() === today.getTime();
          const status = past ? 'free' : dayStatus(busy, d);
          const full = status === 'full';
          return (
            <Pressable
              key={d.getTime()}
              disabled={past || !!onRange}
              onPress={() => onChange(d)}
              // Phone: stop the page scrolling the moment a finger lands on a handle, before it moves. Waiting for
              // the drag to start is too late on iPhone: the scroll view has already taken the gesture.
              onTouchStart={onRange && (t === valueDay || t === endDay) ? () => onDragging?.(true) : undefined}
              style={styles.cell}>
              {band ? <View style={[styles.band, band]} /> : null}
              <View style={[styles.dot, status === 'part' && styles.part, full && styles.full, selected && styles.dotOn]}>
                <Text
                  style={[
                    styles.day,
                    past && { color: C.lineStrong },
                    full && { color: C.muted },
                    full && { textDecorationLine: 'line-through' },
                    isToday && !selected && { color: C.brand },
                    selected && { color: '#fff' },
                  ]}>
                  {d.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.xs },
  month: { fontSize: 16, fontWeight: '700', color: C.ink },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: C.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: CELL_H, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: C.brand },
  day: { fontSize: 16, fontWeight: '500', color: C.ink },
  band: { position: 'absolute', top: 3, bottom: 3, backgroundColor: C.brandSoft },
  bandStart: { left: '50%', right: 0 },
  bandMid: { left: 0, right: 0 },
  bandEnd: { left: 0, right: '50%' },
  part: { backgroundColor: C.warningSoft, borderWidth: 1, borderColor: C.warning },
  full: { backgroundColor: C.line },
});
