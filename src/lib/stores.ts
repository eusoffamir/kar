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
