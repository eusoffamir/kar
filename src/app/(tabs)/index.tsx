import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CarCard } from '@/components/car-card';
import { CarMap } from '@/components/car-map';
import { useZones, ZonePicker } from '@/components/zone-picker';
import { Empty, ErrorText, Grid, Ionicons, Loading, Txt, type IconName } from '@/components/ui';
import { C, MaxContentWidth, R, S, shadow, WideContentWidth } from '@/constants/theme';
import { api, keys, useMe } from '@/lib/api';
import { fmtRangeShort } from '@/lib/format';
import { rm } from '@/lib/pricing';
import { useTripWindow } from '@/lib/stores';
import { useLayout } from '@/lib/use-layout';
import type { CarWithOwner } from '@/lib/types';


const CATEGORIES: { key: string; label: string; icon: IconName; test: (c: CarWithOwner) => boolean }[] = [
  { key: 'all', label: 'All cars', icon: 'grid-outline', test: () => true },
  { key: 'instant', label: 'Instant', icon: 'flash-outline', test: (c) => c.instant_book },
  { key: 'keyless', label: 'Keyless', icon: 'key-outline', test: (c) => c.handover === 'keybox' },
  { key: 'budget', label: 'Budget', icon: 'wallet-outline', test: (c) => c.price_per_day < 80 },
  { key: 'auto', label: 'Automatic', icon: 'speedometer-outline', test: (c) => c.transmission === 'auto' },
  { key: 'comfort', label: 'Comfort', icon: 'diamond-outline', test: (c) => c.price_per_day >= 100 },
];

export default function Explore() {
  const { data: me } = useMe();
  const window = useTripWindow();
  // The area the renter picked (remembered on this device); UTP until Kar opens more.
  const { zones, zone } = useZones();
  const [zoneOpen, setZoneOpen] = useState(false);
  const { data: cars, isLoading, error } = useQuery({ queryKey: keys.cars(zone.id), queryFn: () => api.listCars(zone.id) });
  const [category, setCategory] = useState('all');
  const [mapMode, setMapMode] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  // Laptop: cards in a grid; wide enough, the map sits next to the list (no Map/List toggle).
  const { wide, split } = useLayout();

  // Only offer categories that match at least one car (a small pilot fleet leaves most of them empty).
  const categories = useMemo(
    () => CATEGORIES.filter((c) => c.key === 'all' || (cars ?? []).some(c.test)),
    [cars],
  );
  const active = categories.find((c) => c.key === category) ?? categories[0];
  const shown = useMemo(
    () => (cars ?? []).filter(active.test).sort((a, b) => (b.owner.rating_avg ?? 0) - (a.owner.rating_avg ?? 0)),
    [cars, active],
  );

  const firstName = me?.full_name.trim().split(' ')[0];
  const selectedCar = shown.find((c) => c.id === selected) ?? null;

  const map = (
    <>
      {/* Public map pins sit on the owner's pickup point; the exact parked spot is only for the booked customer. */}
      <CarMap
        center={{ lat: zone.center_lat, lng: zone.center_lng }}
        height="fill"
        rounded={false}
        selectedId={selected}
        onSelect={setSelected}
        onDeselect={() => setSelected(null)}
        pins={shown.map((c) => {
          const at = c.last_location ?? { lat: c.pickup_lat, lng: c.pickup_lng };
          return { id: c.id, lat: at.lat, lng: at.lng, label: `${rm(c.price_per_hour)}/h` };
        })}
      />
      {selectedCar ? (
        <View style={[styles.mapCard, shadow, split && { bottom: S.lg }]}>
          <CarCard car={selectedCar} window={window} compact />
        </View>
      ) : null}
    </>
  );

  const listBody = (
    <>
      <ErrorText error={error} />
      {isLoading ? <Loading /> : null}
      {!isLoading && shown.length === 0 ? (
        <Empty icon="car-outline" title="No cars here yet" body="Try another category or different dates." />
      ) : null}
      <Grid min={260}>
        {shown.map((c) => (
          <CarCard key={c.id} car={c} window={window} />
        ))}
      </Grid>
      {shown.length ? (
        <Txt v="small" style={{ textAlign: 'center' }}>
          Prices include everything except the 5% booking fee and refundable deposit.
        </Txt>
      ) : null}
    </>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Search pill + categories (sticky header) */}
      <View style={styles.header}>
        <View style={[styles.headerInner, wide && { maxWidth: split ? undefined : WideContentWidth }]}>
          {!mapMode || split ? (
            <Txt v="h2" style={{ marginBottom: S.md }}>
              {firstName ? `Where to, ${firstName}?` : 'Rent a car near campus'}
            </Txt>
          ) : null}
          <Pressable onPress={() => router.push('/search')} style={[styles.search, shadow]}>
            <Ionicons name="search" size={20} color={C.ink} />
            <View style={{ flex: 1 }}>
              {zones.length > 1 ? (
                <Pressable onPress={() => setZoneOpen(true)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.searchTitle}>{zone.name}</Text>
                  <Ionicons name="chevron-down" size={14} color={C.ink} />
                </Pressable>
              ) : (
                <Text style={styles.searchTitle}>{zone.name}</Text>
              )}
              <Text style={styles.searchSub}>
                {window ? fmtRangeShort(window.start, window.end) : 'Any time · Pick your dates'}
              </Text>
            </View>
            <View style={styles.filterIcon}>
              <Ionicons name="options-outline" size={18} color={C.ink} />
            </View>
          </Pressable>
          {categories.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.xl, paddingTop: S.lg }}>
              {categories.map((c) => {
                const on = c.key === active.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => setCategory(c.key)}
                    style={[styles.category, on && styles.categoryActive]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}>
                    <Ionicons name={c.icon} size={24} color={on ? C.ink : C.muted} />
                    <Text style={[styles.categoryText, on && { color: C.ink }]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <View style={{ height: S.lg }} />
          )}
        </View>
      </View>

      {split ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.list, { maxWidth: undefined }]}>
            {listBody}
          </ScrollView>
          <View style={styles.sideMap}>{map}</View>
        </View>
      ) : mapMode ? (
        <View style={{ flex: 1 }}>{map}</View>
      ) : (
        <ScrollView contentContainerStyle={[styles.list, wide && { maxWidth: WideContentWidth }]}>{listBody}</ScrollView>
      )}

      {split ? null : (
        <Pressable
          onPress={() => setMapMode((m) => !m)}
          style={[styles.toggle, shadow]}
          accessibilityRole="button"
          accessibilityLabel={mapMode ? 'Show list' : 'Show map'}>
          <Text style={styles.toggleText}>{mapMode ? 'List' : 'Map'}</Text>
          <Ionicons name={mapMode ? 'list' : 'map'} size={16} color="#fff" />
        </Pressable>
      )}
      <ZonePicker visible={zoneOpen} onClose={() => setZoneOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.bg },
  headerInner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: S.xl, paddingTop: S.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    backgroundColor: C.bg,
    borderRadius: R.pill,
    paddingLeft: S.xl,
    paddingRight: S.sm,
    paddingVertical: S.sm,
    borderWidth: 1,
    borderColor: C.line,
  },
  searchTitle: { fontSize: 15, fontWeight: '600', color: C.ink },
  searchSub: { fontSize: 13, color: C.muted, marginTop: 1 },
  filterIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  category: { alignItems: 'center', gap: 6, paddingBottom: S.md, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  categoryActive: { borderBottomColor: C.ink },
  categoryText: { fontSize: 12, fontWeight: '600', color: C.muted },
  list: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: S.xl, gap: S.xxl, paddingBottom: 100 },
  toggle: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.ink,
    borderRadius: R.pill,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  toggleText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  sideMap: { width: '42%', borderLeftWidth: 1, borderLeftColor: C.line },
  mapCard: { position: 'absolute', left: S.lg, right: S.lg, bottom: 80, borderRadius: R.lg, backgroundColor: C.bg },
});
