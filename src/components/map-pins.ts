import { C } from '@/constants/theme';

// Shared by car-map.tsx (native) and car-map.web.tsx. On web, './car-map' resolves to the web file itself,
// so anything both need at runtime lives here.

/**
 * `price` = Airbnb-style price pill; `parked`/`pickup` = round car icon marking one exact spot;
 * `live` = a car on a trip with a fresh location (green); `stale` = on a trip but the signal was lost (grey).
 */
export type MapPin = { id: string; lat: number; lng: number; label: string; kind?: 'price' | 'parked' | 'pickup' | 'live' | 'stale' };

export const isSpot = (kind: MapPin['kind']) => kind === 'parked' || kind === 'pickup' || kind === 'live' || kind === 'stale';
export const SPOT_COLOR = { parked: C.brand, pickup: C.brand, live: C.success, stale: '#6B7280' } as const;
