import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CarCard } from '@/components/car-card';
import { CarMap } from '@/components/car-map';
import { Empty, ErrorText, Ionicons, Loading, Txt, type IconName } from '@/components/ui';
import { C, MaxContentWidth, R, S, shadow } from '@/constants/theme';
import { api, keys, useMe } from '@/lib/api';
import { fmtRangeShort } from '@/lib/format';
import { rm } from '@/lib/pricing';
import { useTripWindow } from '@/lib/stores';
import type { CarWithOwner } from '@/lib/types';

const ZONE = { id: 'utp', name: 'UTP, Seri Iskandar', lat: 4.3845, lng: 100.967 };

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
  const { data: cars, isLoading, error } = useQuery({ queryKey: keys.cars(ZONE.id), queryFn: () => api.listCars(ZONE.id) });
  const [category, setCategory] = useState('all');
  const [mapMode, setMapMode] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const shown = useMemo(() => {
    const test = CATEGORIES.find((c) => c.key === category)!.test;
    return (cars ?? []).filter(test).sort((a, b) => (b.owner.rating_avg ?? 0) - (a.owner.rating_avg ?? 0));
  }, [cars, category]);

  const firstName = me?.full_name.replace(/\(.*?\)/, '').trim().split(' ')[0];
  const selectedCar = shown.find((c) => c.id === selected) ?? null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Search pill + categories (sticky header) */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
          {!mapMode ? (
            <Txt v="h2" style={{ marginBottom: S.md }}>
              {firstName ? `Where to, ${firstName}?` : 'Rent a car near campus'}
            </Txt>
          ) : null}
          <Pressable onPress={() => router.push('/search')} style={[styles.search, shadow]}>
            <Ionicons name="search" size={20} color={C.ink} />
            <View style={{ flex: 1 }}>
              <Text style={styles.searchTitle}>{ZONE.name}</Text>
              <Text style={styles.searchSub}>
                {window ? fmtRangeShort(window.start, window.end) : 'Any time · Pick your dates'}
              </Text>
            </View>
            <View style={styles.filterIcon}>
              <Ionicons name="options-outline" size={18} color={C.ink} />
            </View>
          </Pressable>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.xl, paddingTop: S.lg }}>
            {CATEGORIES.map((c) => {
              const active = c.key === category;
              return (
                <Pressable key={c.key} onPress={() => setCategory(c.key)} style={[styles.category, active && styles.categoryActive]}>
                  <Ionicons name={c.icon} size={24} color={active ? C.ink : C.muted} />
                  <Text style={[styles.categoryText, active && { color: C.ink }]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {mapMode ? (
        <View style={{ flex: 1 }}>
          <CarMap
            center={{ lat: ZONE.lat, lng: ZONE.lng }}
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
            <View style={[styles.mapCard, shadow]}>
              <CarCard car={selectedCar} window={window} compact />
            </View>
          ) : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <ErrorText error={error} />
          {isLoading ? <Loading /> : null}
          {!isLoading && shown.length === 0 ? (
            <Empty icon="car-outline" title="No cars here yet" body="Try another category or different dates." />
          ) : null}
          {shown.map((c) => (
            <CarCard key={c.id} car={c} window={window} />
          ))}
          {shown.length ? (
            <Txt v="small" style={{ textAlign: 'center' }}>
              Prices include everything except the 5% booking fee and refundable deposit.
            </Txt>
          ) : null}
        </ScrollView>
      )}

      <Pressable onPress={() => setMapMode((m) => !m)} style={[styles.toggle, shadow]}>
        <Text style={styles.toggleText}>{mapMode ? 'List' : 'Map'}</Text>
        <Ionicons name={mapMode ? 'list' : 'map'} size={16} color="#fff" />
      </Pressable>
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
  mapCard: { position: 'absolute', left: S.lg, right: S.lg, bottom: 80, borderRadius: R.lg, backgroundColor: C.bg },
});
