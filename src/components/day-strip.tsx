import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { C, R, S } from '@/constants/theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Horizontal strip of the next `count` days ("Today", "Tmrw", then "Fri 16"…). */
/** `inset`: let the strip run to the screen edges while the first and last day keep this much space (page padding). */
export function DayStrip({ value, onChange, from, count = 14, inset = 0 }: { value: Date; onChange: (d: Date) => void; from: number; count?: number; inset?: number }) {
  const days = useMemo(() => {
    const first = startOfDay(new Date(from));
    return Array.from({ length: count }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  }, [from, count]);
  const selectedKey = startOfDay(value).getTime();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -inset }} contentContainerStyle={{ gap: S.sm, paddingHorizontal: inset }}>
      {days.map((d, i) => {
        const selected = d.getTime() === selectedKey;
        return (
          <Pressable key={d.getTime()} onPress={() => onChange(d)} style={[styles.day, selected && styles.selected]}>
            <Text style={[styles.top, selected && { color: '#fff' }]}>{i === 0 ? 'Today' : i === 1 ? 'Tmrw' : DAYS[d.getDay()]}</Text>
            <Text style={[styles.num, selected && { color: '#fff' }]}>{d.getDate()}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  day: {
    width: 56,
    paddingVertical: S.sm,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.lineStrong,
    alignItems: 'center',
    gap: 2,
  },
  selected: { backgroundColor: C.brand, borderColor: C.brand },
  top: { fontSize: 12, fontWeight: '600', color: C.muted },
  num: { fontSize: 15, fontWeight: '700', color: C.ink },
});
