import { useQuery } from '@tanstack/react-query';
import { Modal, Pressable, StyleSheet } from 'react-native';

import { Ionicons, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api } from '@/lib/api';
import { setZoneId, useZoneId } from '@/lib/stores';
import type { Zone } from '@/lib/types';

const FALLBACK: Zone = { id: 'utp', name: 'UTP, Seri Iskandar', center_lat: 4.3845, center_lng: 100.967 };

/** Areas Kar operates in (campuses, cities), and the one the renter is browsing. */
export function useZones() {
  const { data } = useQuery({ queryKey: ['zones'], queryFn: () => api.zones(), staleTime: 10 * 60_000 });
  const zones = data?.length ? data : [FALLBACK];
  const chosen = useZoneId();
  const zone = zones.find((z) => z.id === chosen) ?? zones[0];
  return { zones, zone };
}

/** Bottom sheet listing every area; picking one switches Explore to it and remembers it on this device. */
export function ZonePicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { zones, zone } = useZones();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <Txt v="h2">Where are you renting?</Txt>
          {zones.map((z) => {
            const on = z.id === zone.id;
            return (
              <Pressable
                key={z.id}
                onPress={() => {
                  setZoneId(z.id);
                  onClose();
                }}
                style={[styles.row, on && styles.rowOn]}>
                <Ionicons name="location-outline" size={20} color={C.ink} />
                <Txt v="h3" style={{ flex: 1 }}>{z.name}</Txt>
                {on ? <Ionicons name="checkmark" size={20} color={C.brand} /> : null}
              </Pressable>
            );
          })}
          <Txt v="small">More campuses and cities are coming.</Txt>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: C.bg,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    padding: S.xl,
    paddingBottom: S.xxl,
    gap: S.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.lg, borderRadius: R.md, borderWidth: 1, borderColor: C.line },
  rowOn: { borderColor: C.brand, borderWidth: 2, backgroundColor: C.brandSoft },
});
