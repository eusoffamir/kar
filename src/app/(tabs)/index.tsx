import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CarCard, isTopRated } from '@/components/car-card';
import { CarMap } from '@/components/car-map';
import { FilterSheet } from '@/components/filter-sheet';
import { useZones, ZonePicker } from '@/components/zone-picker';
import { Empty, ErrorText, Grid, Ionicons, Loading, Txt } from '@/components/ui';
import { C, MaxContentWidth, R, S, shadow, WideContentWidth, PageX } from '@/constants/theme';
import { api, keys, useMe } from '@/lib/api';
import { fmtRangeShort } from '@/lib/format';
import { quote, rm } from '@/lib/pricing';
import { activeFilterCount, useCarFilters, useTripWindow } from '@/lib/stores';
import { useLayout } from '@/lib/use-layout';

export default function Explore() {
  const { data: me } = useMe();
  const window = useTripWindow();
  // The area the renter picked (remembered on this device); UTP until Kar opens more.
  const { zones, zone } = useZones();
  const [zoneOpen, setZoneOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const { data: cars, isLoading, error } = useQuery({ queryKey: keys.cars(zone.id), queryFn: () => api.listCars(zone.id) });
  const [mapMode, setMapMode] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  // Laptop: cards in a grid; wide enough, the map sits next to the list (no Map/List toggle).
  const { wide, split } = useLayout();

  // Filters live on the "When do you need it?" screen; Explore stays a clean list.
  const filters = useCarFilters();
  const shown = useMemo(
    () =>
      (cars ?? [])
        .filter(
          (c) =>
            (!filters.auto || c.transmission === 'auto') &&
            (!filters.keyless || c.handover === 'keybox') &&
            (!filters.instant || c.instant_book) &&
            (!filters.seats7 || c.seats >= 7) &&
            (!filters.topRated || isTopRated(c)) &&
            (filters.minDay === null || c.price_per_day >= filters.minDay) &&
            (filters.maxDay === null || c.price_per_day <= filters.maxDay),
        )
        // Lowest price: by the trip total once dates are picked, else by the hourly price.
        .sort((a, b) =>
          filters.sort === 'price'
            ? (window ? quote(a, window.start, window.end).trip - quote(b, window.start, window.end).trip : a.price_per_hour - b.price_per_hour)
            : filters.sort === 'newest'
              ? b.year - a.year
              : (b.owner.rating_avg ?? 0) - (a.owner.rating_avg ?? 0),
        ),
    [cars, filters, window],
  );
  const filterCount = activeFilterCount(filters);

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
        <Empty icon="car-outline" title="No cars here yet" body={filterCount ? 'Try fewer filters or other dates.' : 'Try other dates.'} />
      ) : null}
      <Grid min={260}>
        {shown.map((c) => (
          <CarCard key={c.id} car={c} window={window} />
        ))}
      </Grid>
    </>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Search pill (sticky header) */}
      <View style={styles.header}>
        {/* Laptop: title and search pill share one row so the cars start higher up. */}
        <View style={[styles.headerInner, wide && styles.headerWide, wide && { maxWidth: split ? '100%' : WideContentWidth }]}>
          {!mapMode || split ? (
            <View style={wide ? { flex: 1 } : { marginBottom: S.md, marginLeft: S.sm }}>
              <Txt v="h1">{firstName ? `Where to, ${firstName}?` : 'Rent a car near campus'}</Txt>
              {wide && cars ? (
                <Txt v="small" style={{ marginTop: 2 }}>
                  {shown.length} {shown.length === 1 ? 'car' : 'cars'} near {zone.name}
                </Txt>
              ) : null}
            </View>
          ) : null}
          <Pressable onPress={() => router.push('/search')} style={[styles.search, shadow, wide && styles.searchWide]}>
            <Ionicons name="search" size={18} color={C.ink} />
            <View style={{ flex: 1 }}>
              {zones.length > 1 ? (
                <Pressable onPress={() => setZoneOpen(true)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.searchTitle}>{zone.name}</Text>
                  <Ionicons name="chevron-down" size={14} color={C.ink} />
                </Pressable>
              ) : (
                <Text style={styles.searchTitle}>{zone.name}</Text>
              )}
              <Text style={styles.searchSub}>{window ? fmtRangeShort(window.start, window.end) : 'Pick your dates'}</Text>
            </View>
            <Pressable
              onPress={() => setFilterOpen(true)}
              hitSlop={6}
              style={[styles.filterIcon, filterCount ? styles.filterIconOn : null]}
              accessibilityLabel="Filters">
              <Ionicons name="options-outline" size={20} color={filterCount ? '#fff' : C.ink} />
            </Pressable>
          </Pressable>
          {wide ? null : <View style={{ height: S.lg }} />}
        </View>
      </View>

      {/* Everything under the header: the filter panel drops down over this part only. */}
      <View style={{ flex: 1 }}>
        {split ? (
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.list, { maxWidth: '100%' }]}>
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
        <FilterSheet visible={filterOpen} onClose={() => setFilterOpen(false)} prices={(cars ?? []).map((c) => c.price_per_day)} />
      </View>
      <ZonePicker visible={zoneOpen} onClose={() => setZoneOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.bg },
  headerInner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: PageX, paddingTop: S.lg },
  headerWide: { flexDirection: 'row', alignItems: 'center', gap: S.xl, paddingVertical: S.lg },
  searchWide: { flex: 1, maxWidth: 480 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    backgroundColor: C.bg,
    borderRadius: R.pill,
    paddingLeft: S.lg,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.line,
  },
  searchTitle: { fontSize: 14, fontWeight: '600', color: C.ink },
  searchSub: { fontSize: 12, color: C.muted, marginTop: 1 },
  // 44px: Apple's minimum comfortable tap size.
  filterIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterIconOn: { backgroundColor: C.brand, borderColor: C.brand },
  list: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: PageX, paddingTop: S.xl, gap: S.xxl, paddingBottom: 100 },
  toggle: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.brand,
    borderRadius: R.pill,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  toggleText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  sideMap: { width: '42%', borderLeftWidth: 1, borderLeftColor: C.line },
  mapCard: { position: 'absolute', left: S.lg, right: S.lg, bottom: 80, borderRadius: R.lg, backgroundColor: C.bg },
});
