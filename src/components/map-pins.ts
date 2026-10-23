import { C } from '@/constants/theme';

// Shared by car-map.tsx (native) and car-map.web.tsx. On web, './car-map' resolves to the web file itself,
// so anything both need at runtime lives here.

/**
 * `price` = Airbnb-style price pill; `parked`/`pickup` = round car icon marking one exact spot;
 * `live` = a car on a trip with a fresh location (green); `stale` = signal lost or not bookable (grey);
 * `request` = a booking request is waiting for the owner (orange).
 */
export type MapPin = { id: string; lat: number; lng: number; label: string; kind?: 'price' | 'parked' | 'pickup' | 'live' | 'stale' | 'request' };

export const isSpot = (kind: MapPin['kind']) => !!kind && kind !== 'price';
/** live = on a trip; stale = signal lost, hidden or not approved; request = a booking request waits for the owner. */
export const SPOT_COLOR = { parked: C.brand, pickup: C.brand, live: C.success, stale: '#6B7280', request: C.warning } as const;

/** The "Centre" button shows once the car has moved more than a tenth of the visible map away from the middle. */
export const isOffCentre = (view: { lat: number; lng: number; latSpan: number; lngSpan: number }, pin: { lat: number; lng: number }) =>
  Math.abs(view.lat - pin.lat) > view.latSpan * 0.1 || Math.abs(view.lng - pin.lng) > view.lngSpan * 0.1;
