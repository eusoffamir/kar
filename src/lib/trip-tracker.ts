import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from './api';
import type { LocationFix } from './types';

// Live trip tracking from the customer's phone (native). The owner watches the car on My cars.
// In a store/development build the phone keeps reporting with the screen off (background location);
// Expo Go can't run background tasks, so there it only reports while Kar is open. Web: trip-tracker.web.ts.

const TASK = 'kar-trip-location';
const BOOKING_KEY = 'kar-tracking-booking';
/** How often the phone reports while moving; the owner's map refreshes on the same rhythm. */
export const REPORT_EVERY_MS = 30_000;

const canRunInBackground = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

const toFix = (l: Location.LocationObject): LocationFix => ({
  lat: l.coords.latitude,
  lng: l.coords.longitude,
  accuracy: l.coords.accuracy ?? null,
  speed: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
  t: new Date(l.timestamp).toISOString(),
});

async function send(bookingId: string, fixes: LocationFix[]) {
  const stored = await api.reportTripLocation(bookingId, fixes);
  // The trip ended (returned, or cancelled by Kar): stop using the customer's location straight away.
  if (fixes.length && stored === 0) await stopTripTracking();
}

// Must be defined at the top level so the OS can wake the app with new locations.
if (canRunInBackground) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const bookingId = await AsyncStorage.getItem(BOOKING_KEY);
    if (!bookingId) return;
    try {
      await send(bookingId, data.locations.map(toFix));
    } catch {
      // Offline or signed out: the next batch tries again.
    }
  });
}

/** Stops sharing (called on return, and automatically once the trip is over). */
export async function stopTripTracking() {
  await AsyncStorage.removeItem(BOOKING_KEY).catch(() => {});
  if (canRunInBackground && (await TaskManager.isTaskRegisteredAsync(TASK).catch(() => false))) {
    await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
  }
}

export type TrackingState =
  | { kind: 'starting' }
  /** Keeps sharing with the screen off. */
  | { kind: 'background' }
  /** Only while Kar is open (no "Always" permission, or Expo Go / web). */
  | { kind: 'foreground' }
  | { kind: 'blocked'; message: string };

/** Shares the car's location while the trip is active; `retry` asks for permission again. */
export function useTripTracking(bookingId: string, active: boolean) {
  const [state, setState] = useState<TrackingState>({ kind: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const watch = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      setState({ kind: 'starting' });
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== 'granted') {
        if (!cancelled) setState({ kind: 'blocked', message: 'Allow location for Kar in your phone Settings. The owner needs to see where the car is during the trip.' });
        return;
      }
      if (canRunInBackground) {
        const bg = await Location.requestBackgroundPermissionsAsync().catch(() => null);
        if (bg?.status === 'granted') {
          await AsyncStorage.setItem(BOOKING_KEY, bookingId);
          await Location.startLocationUpdatesAsync(TASK, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: REPORT_EVERY_MS,
            distanceInterval: 50,
            deferredUpdatesInterval: REPORT_EVERY_MS,
            activityType: Location.ActivityType.AutomotiveNavigation,
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: 'Kar trip in progress',
              notificationBody: 'Sharing the car location with the owner until you return it.',
              notificationColor: '#0F5BFF',
            },
          });
          if (!cancelled) setState({ kind: 'background' });
          return;
        }
      }
      // Fallback: report while Kar is on screen.
      let lastSent = 0;
      let buffer: LocationFix[] = [];
      watch.current?.remove();
      watch.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 25 },
        (l) => {
          buffer.push(toFix(l));
          if (Date.now() - lastSent < REPORT_EVERY_MS) return;
          lastSent = Date.now();
          const batch = buffer;
          buffer = [];
          send(bookingId, batch).catch(() => {
            buffer = [...batch, ...buffer].slice(-60);
          });
        },
      );
      if (cancelled) watch.current.remove();
      else setState({ kind: 'foreground' });
    })().catch((e) => {
      if (!cancelled) setState({ kind: 'blocked', message: e instanceof Error ? e.message : 'Could not share your location.' });
    });
    return () => {
      cancelled = true;
      // Background updates keep running when the screen closes (that's the point); the foreground watch can't.
      watch.current?.remove();
      watch.current = null;
    };
  }, [bookingId, active, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
