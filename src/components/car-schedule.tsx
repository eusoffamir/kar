import { StyleSheet, Text, View } from 'react-native';

import { C, S } from '@/constants/theme';
import { fmtDate, fmtTime } from '@/lib/format';

const DAY = 86_400_000;

/** Busy times from car_busy_ranges(): bookings and times the owner blocked, times only (never who booked). */
export type BusyRange = { starts_at: string; ends_at: string };

/** The booked parts of one day, merged and sorted. */
export function bookedOn(busy: BusyRange[], day: Date) {
  const d0 = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const parts = busy
    .map((b) => ({ s: Math.max(new Date(b.starts_at).getTime(), d0), e: Math.min(new Date(b.ends_at).getTime(), d0 + DAY) }))
    .filter((r) => r.e > r.s)
    .sort((a, b) => a.s - b.s);
  const out: { s: number; e: number }[] = [];
  for (const r of parts) {
    const last = out[out.length - 1];
    if (last && r.s <= last.e) last.e = Math.max(last.e, r.e);
    else out.push({ ...r });
  }
  return out;
}

/** 'free', 'part' (some hours booked) or 'full' (booked all day). */
export function dayStatus(busy: BusyRange[], day: Date): 'free' | 'part' | 'full' {
  const ms = bookedOn(busy, day).reduce((n, r) => n + r.e - r.s, 0);
  return ms === 0 ? 'free' : ms >= DAY - 60_000 ? 'full' : 'part';
}

/** Legend under the availability calendar. */
export function AvailabilityKey() {
  return (
    <View style={styles.legend}>
      <Key style={styles.keyFree} label="Free" />
      <Key style={styles.keyPart} label="Partly booked" />
      <Key style={styles.keyFull} label="Booked" />
    </View>
  );
}

/** The tapped day's booked times: "Sun 25 Oct: booked 2pm – 6pm". Nothing when that day is free. */
export function DayBookings({ busy, day }: { busy: BusyRange[]; day: Date }) {
  const parts = bookedOn(busy, day);
  if (!parts.length) return null;
  return (
    <Text style={styles.line}>
      <Text style={{ fontWeight: '700', color: C.ink }}>{fmtDate(day)}: </Text>
      booked {parts.map((r) => `${fmtTime(new Date(r.s))} – ${fmtTime(new Date(r.e))}`).join(', ')}
    </Text>
  );
}

function Key({ style, label }: { style: object; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={[styles.key, style]} />
      <Text style={styles.keyText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: S.lg },
  key: { width: 14, height: 14, borderRadius: 7 },
  keyFree: { borderWidth: 1, borderColor: C.lineStrong },
  keyPart: { backgroundColor: C.warningSoft, borderWidth: 1, borderColor: C.warning },
  keyFull: { backgroundColor: C.line },
  keyText: { fontSize: 13, color: C.text },
  line: { fontSize: 14, color: C.text, lineHeight: 20 },
});
