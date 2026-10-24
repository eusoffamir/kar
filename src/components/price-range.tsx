import { useState } from 'react';
import { StyleSheet, TextInput, View, type GestureResponderEvent } from 'react-native';

import { Row, Txt } from '@/components/ui';
import { C, R, S, shadow } from '@/constants/theme';

const THUMB = 28;
const BINS = 20;
const STEP = 5;
const BAR_MAX = 56;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Airbnb-style price filter: a bar chart of how many cars cost what, a slider with two handles,
 * and Minimum / Maximum boxes. A handle at the very end means "no limit" (null), so pricier cars
 * listed later still show.
 */
export function PriceRange({
  prices,
  min,
  max,
  onChange,
}: {
  /** Price per day of every car in the area (before other filters). */
  prices: number[];
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const lo = prices.length ? Math.floor(Math.min(...prices) / 10) * 10 : 0;
  const hi = Math.max(prices.length ? Math.ceil(Math.max(...prices) / 10) * 10 : 200, lo + 10);
  const saved: [number, number] = [clamp(min ?? lo, lo, hi), clamp(max ?? hi, lo, hi)];

  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<[number, number] | null>(null); // only while a handle is held
  const [a, b] = drag ?? saved;

  const commit = ([x, y]: [number, number]) => onChange(x <= lo ? null : x, y >= hi ? null : y);

  // Where the finger first touched a handle; moving shifts that handle by the same share of the track.
  const [grab, setGrab] = useState<{ which: 0 | 1; x0: number } | null>(null);
  const moved = (which: 0 | 1, dx: number): [number, number] => {
    const v = Math.round((saved[which] + (dx / Math.max(width, 1)) * (hi - lo)) / STEP) * STEP;
    return which === 0 ? [clamp(v, lo, saved[1] - STEP), saved[1]] : [saved[0], clamp(v, saved[0] + STEP, hi)];
  };
  const stop = () => {
    setGrab(null);
    setDrag(null);
  };
  const touch = (which: 0 | 1) => ({
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    // Keep the drag even when the panel's scroll view wants it.
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => setGrab({ which, x0: e.nativeEvent.pageX }),
    onResponderMove: (e: GestureResponderEvent) => {
      if (grab) setDrag(moved(grab.which, e.nativeEvent.pageX - grab.x0));
    },
    onResponderRelease: (e: GestureResponderEvent) => {
      if (grab) commit(moved(grab.which, e.nativeEvent.pageX - grab.x0));
      stop();
    },
    onResponderTerminate: stop,
  });

  const counts = Array.from({ length: BINS }, () => 0);
  for (const p of prices) counts[clamp(Math.floor(((p - lo) / (hi - lo)) * BINS), 0, BINS - 1)]++;
  const most = Math.max(1, ...counts);
  const x = (v: number) => ((v - lo) / (hi - lo)) * width;

  // Typed amounts: kept inside the range and apart from the other box; empty means no limit.
  const typed = (which: 0 | 1, text: string) => {
    const n = parseInt(text.replace(/\D/g, ''), 10);
    if (which === 0) commit([Number.isNaN(n) ? lo : clamp(n, lo, b - STEP), b]);
    else commit([a, Number.isNaN(n) ? hi : clamp(n, a + STEP, hi)]);
  };

  return (
    <View style={{ gap: S.md }}>
      <View style={{ paddingHorizontal: THUMB / 2 }}>
        <Row gap={2} style={{ alignItems: 'flex-end', height: BAR_MAX }}>
          {counts.map((n, i) => {
            const mid = lo + ((i + 0.5) / BINS) * (hi - lo);
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: n ? 6 + (n / most) * (BAR_MAX - 6) : 2,
                  borderTopLeftRadius: 2,
                  borderTopRightRadius: 2,
                  backgroundColor: mid >= a && mid <= b ? C.ink : C.lineStrong,
                }}
              />
            );
          })}
        </Row>
        <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          <View style={[styles.rail, { backgroundColor: C.lineStrong }]} />
          <View style={[styles.rail, { left: x(a), width: x(b) - x(a), backgroundColor: C.ink }]} />
          {width ? (
            <>
              <View {...touch(0)} style={[styles.thumb, shadow, { left: x(a) - THUMB / 2 }]} accessibilityLabel="Minimum price" />
              <View {...touch(1)} style={[styles.thumb, shadow, { left: x(b) - THUMB / 2 }]} accessibilityLabel="Maximum price" />
            </>
          ) : null}
        </View>
      </View>
      <Row gap={S.md}>
        <PriceBox label="Minimum" value={a} onDone={(t) => typed(0, t)} />
        <PriceBox label="Maximum" value={b} plus={b >= hi} onDone={(t) => typed(1, t)} />
      </Row>
    </View>
  );
}

function PriceBox({ label, value, plus, onDone }: { label: string; value: number; plus?: boolean; onDone: (text: string) => void }) {
  return (
    <View style={styles.box}>
      <Txt v="tiny">{label}</Txt>
      <Row gap={2}>
        <Txt v="body" color={C.ink}>RM</Txt>
        {/* key: the box shows the new amount when a handle moves or Clear is pressed. */}
        <TextInput
          key={`${value}${plus ? '+' : ''}`}
          defaultValue={`${value}${plus ? '+' : ''}`}
          keyboardType="number-pad"
          onEndEditing={(e) => onDone(e.nativeEvent.text)}
          onSubmitEditing={(e) => onDone(e.nativeEvent.text)}
          style={styles.boxInput}
        />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: THUMB, justifyContent: 'center', marginTop: -1 },
  rail: { position: 'absolute', left: 0, right: 0, height: 2, top: THUMB / 2 - 1 },
  thumb: {
    position: 'absolute',
    top: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.lineStrong,
  },
  box: { flex: 1, borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: S.sm, gap: 2 },
  boxInput: { flex: 1, fontSize: 14, color: C.ink, padding: 0 },
});
