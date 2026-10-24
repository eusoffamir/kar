import { useCallback, useEffect, useState } from 'react';

import { api } from './api';
import { useOnReturn } from './use-on-return';
import type { LocationFix } from './types';

// Web: browsers only share location while the page is open, so the trip screen asks the customer to keep
// Kar open (or install the app). Same exports as trip-tracker.ts.

export const REPORT_EVERY_MS = 30_000;

export type TrackingState =
  | { kind: 'starting' }
  | { kind: 'background' }
  | { kind: 'foreground' }
  | { kind: 'blocked'; message: string };

export async function stopTripTracking() {}

export function useTripTracking(bookingId: string, active: boolean) {
  const [state, setState] = useState<TrackingState>({ kind: 'starting' });
  const [attempt, setAttempt] = useState(0);

  const supported = typeof navigator !== 'undefined' && !!navigator.geolocation;

  useEffect(() => {
    if (!active || !supported) return;
    let lastSent = 0;
    let buffer: LocationFix[] = [];
    let stopped = false;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setState((s) => (s.kind === 'foreground' ? s : { kind: 'foreground' }));
        buffer.push({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy ?? null,
          speed: p.coords.speed != null && p.coords.speed >= 0 ? p.coords.speed : null,
          t: new Date(p.timestamp).toISOString(),
        });
        if (stopped || Date.now() - lastSent < REPORT_EVERY_MS) return;
        lastSent = Date.now();
        const batch = buffer;
        buffer = [];
        api
          .reportTripLocation(bookingId, batch)
          .then((n) => {
            if (n === 0) {
              stopped = true;
              navigator.geolocation.clearWatch(id);
            }
          })
          .catch(() => {
            buffer = [...batch, ...buffer].slice(-60);
          });
      },
      (e) =>
        setState({
          kind: 'blocked',
          message:
            e.code === e.PERMISSION_DENIED
              ? 'Location is blocked for Kar in this browser. Allow it in the site settings, then tap Try again.'
              : 'Could not find your location. Tap Try again, ideally outdoors.',
        }),
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [bookingId, active, attempt, supported]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // Back on Kar (maybe after changing the location setting): start again, so a blocked location shows straight away.
  useOnReturn(() => {
    if (active) retry();
  });
  if (!supported) {
    return { state: { kind: 'blocked', message: 'This browser cannot share your location. Use the Kar app for this trip.' } as TrackingState, retry };
  }
  return { state, retry };
}
