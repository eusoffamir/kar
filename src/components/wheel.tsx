import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';

import { C, R } from '@/constants/theme';

const ROW = 36;
const VISIBLE = 5; // rows shown; the middle one is selected

/**
 * iPhone-style scroll wheels (like the Calendar time picker and the Timer), built from ScrollViews so they work
 * in Expo Go and on the web with no native module. Put one or more <Wheel> columns inside <Wheels>, which draws
 * the shared grey band across the middle row.
 */
export function Wheels({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <View pointerEvents="none" style={styles.band} />
      {children}
    </View>
  );
}

export function Wheel<T extends string | number>({
  options,
  value,
  onChange,
  format = String,
  unit,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
  /** Fixed word beside the selected row, like the Timer's "hours". */
  unit?: string;
}) {
  const ref = useRef<ScrollViewInstance>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(0, options.indexOf(value));

  // Follow the value when it changes from outside (e.g. Ends moves when How long changes).
  useEffect(() => {
    ref.current?.scrollTo({ y: index * ROW, animated: false });
  }, [index]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  // Same on native and web: settle a moment after the last scroll event.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const i = Math.min(options.length - 1, Math.max(0, Math.round(y / ROW)));
      ref.current?.scrollTo({ y: i * ROW, animated: true });
      if (options[i] !== value) onChange(options[i]);
    }, 140);
  };

  return (
    <View style={styles.column}>
      <ScrollView
        ref={ref}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        scrollEventThrottle={32}
        onScroll={onScroll}
        contentContainerStyle={{ paddingVertical: ROW * Math.floor(VISIBLE / 2) }}>
        {options.map((o, i) => {
          const away = Math.abs(i - index);
          return (
            <Pressable
              key={String(o)}
              onPress={() => {
                ref.current?.scrollTo({ y: i * ROW, animated: true });
                onChange(o);
              }}
              style={styles.row}>
              <Text style={[styles.text, away === 0 && styles.selected, { opacity: away === 0 ? 1 : away === 1 ? 0.55 : 0.25 }]}>{format(o)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {unit ? (
        <View pointerEvents="none" style={styles.unitWrap}>
          <Text style={styles.unit}>{unit}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', height: ROW * VISIBLE, overflow: 'hidden' },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ROW * Math.floor(VISIBLE / 2),
    height: ROW,
    borderRadius: R.md,
    backgroundColor: C.soft,
    borderWidth: 1,
    borderColor: C.line,
  },
  column: { flex: 1, flexDirection: 'row' },
  row: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 17, color: C.ink, fontWeight: '500' },
  selected: { fontWeight: '700' },
  unitWrap: { position: 'absolute', right: 8, top: ROW * Math.floor(VISIBLE / 2), height: ROW, justifyContent: 'center' },
  unit: { fontSize: 15, fontWeight: '600', color: C.ink },
});
