import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { C, R } from '@/constants/theme';

const ROW = 44;
const VISIBLE = 3; // rows shown; the middle one is selected

/**
 * iPhone-style snapping wheel built from a ScrollView (no native dependency, so it runs in Expo Go
 * and on the web). Scroll or tap a row; disabled rows are greyed and skipped when settling.
 */
export function TimeWheel<T extends string | number>({
  options,
  value,
  onChange,
  format,
  isDisabled,
}: {
  options: T[];
  value: T;
  onChange: (v: T, how: 'scroll' | 'tap') => void;
  format: (v: T) => string;
  isDisabled?: (v: T) => boolean;
}) {
  const ref = useRef<ScrollView>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(0, options.indexOf(value));

  // Keep the wheel on the current value when it changes from outside (preset, day change).
  useEffect(() => {
    ref.current?.scrollTo({ y: index * ROW, animated: false });
  }, [index]);

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  const nearestEnabled = (i: number) => {
    if (!isDisabled) return i;
    for (let d = 0; d < options.length; d++) {
      for (const j of [i + d, i - d]) {
        if (j >= 0 && j < options.length && !isDisabled(options[j])) return j;
      }
    }
    return i;
  };

  const settle = (y: number) => {
    const i = nearestEnabled(Math.min(options.length - 1, Math.max(0, Math.round(y / ROW))));
    ref.current?.scrollTo({ y: i * ROW, animated: true });
    if (options[i] !== value) onChange(options[i], 'scroll');
  };

  // Works the same on native and web: settle a moment after the last scroll event.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => settle(y), 140);
  };

  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={styles.band} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        scrollEventThrottle={32}
        onScroll={onScroll}
        contentContainerStyle={{ paddingVertical: ROW * Math.floor(VISIBLE / 2) }}>
        {options.map((o, i) => {
          const disabled = isDisabled?.(o) ?? false;
          const selected = i === index;
          return (
            <Pressable
              key={String(o)}
              disabled={disabled}
              onPress={() => {
                ref.current?.scrollTo({ y: i * ROW, animated: true });
                onChange(o, 'tap');
              }}
              style={styles.row}>
              <Text style={[styles.text, selected && styles.selected, disabled && styles.disabled]}>{format(o)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: ROW * VISIBLE, overflow: 'hidden' },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ROW * Math.floor(VISIBLE / 2),
    height: ROW,
    borderRadius: R.md,
    backgroundColor: C.soft,
  },
  row: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 18, color: C.muted, fontWeight: '500' },
  selected: { fontSize: 22, color: C.ink, fontWeight: '700' },
  disabled: { color: '#D4D4D4', textDecorationLine: 'line-through' },
});
