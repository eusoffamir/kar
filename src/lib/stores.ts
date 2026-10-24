import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

// Tiny app-wide store (no extra library): the trip window chosen in search.

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

// ---- Trip window: when the customer wants the car. Shared by Explore, Search and Car pages.
export type TripWindow = { start: Date; end: Date } | null;
const tripWindow = createStore<TripWindow>(null);

export const setTripWindow = (w: TripWindow) => tripWindow.set(w);
export const useTripWindow = () => useSyncExternalStore(tripWindow.subscribe, tripWindow.get, tripWindow.get);

// ---- Map type: plain map or satellite (hybrid with street names). Shared by every map in the app.
// Satellite is the default and the switch stays on every map: the user wants this feature kept.
export type MapType = 'map' | 'satellite';
const mapType = createStore<MapType>('satellite');
export const setMapType = (t: MapType) => mapType.set(t);
export const useMapType = () => useSyncExternalStore(mapType.subscribe, mapType.get, mapType.get);

// ---- Area (zone) the renter is browsing. Remembered on the device; Explore starts in the last area picked.
const ZONE_KEY = 'kar-zone';
const zoneId = createStore<string | null>(null);
AsyncStorage.getItem(ZONE_KEY)
  .then((v) => {
    if (v && !zoneId.get()) zoneId.set(v);
  })
  .catch(() => {});
export const setZoneId = (id: string) => {
  zoneId.set(id);
  AsyncStorage.setItem(ZONE_KEY, id).catch(() => {});
};
export const useZoneId = () => useSyncExternalStore(zoneId.subscribe, zoneId.get, zoneId.get);

// ---- Explore filters, set from the filter button on Explore's search pill (components/filter-sheet).
export type CarSort = 'recommended' | 'price' | 'newest';
export type CarFilters = {
  auto: boolean;
  instant: boolean;
  seats7: boolean;
  topRated: boolean;
  /** Price per day range to show; null = no limit on that side. */
  minDay: number | null;
  maxDay: number | null;
  sort: CarSort;
};
export const NO_FILTERS: CarFilters = { auto: false, instant: false, seats7: false, topRated: false, minDay: null, maxDay: null, sort: 'recommended' };
const filters = createStore<CarFilters>(NO_FILTERS);
export const setCarFilters = (f: CarFilters) => filters.set(f);
export const useCarFilters = () => useSyncExternalStore(filters.subscribe, filters.get, filters.get);
export const activeFilterCount = (f: CarFilters) =>
  [f.auto, f.instant, f.seats7, f.topRated, f.minDay !== null || f.maxDay !== null, f.sort !== 'recommended'].filter(Boolean).length;
