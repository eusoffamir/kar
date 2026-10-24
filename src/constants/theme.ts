import { Platform } from 'react-native';

// Kar design tokens. Airbnb-style: white canvas, near-black ink, one cobalt brand colour,
// photos do the talking. Light UI for the MVP (see app.json userInterfaceStyle).
export const C = {
  brand: '#0131C5',
  brandDark: '#00228C',
  brandSoft: '#EBF0FD',
  ink: '#222222',
  text: '#3F3F46',
  muted: '#717171',
  line: '#EBEBEB',
  lineStrong: '#DDDDDD',
  bg: '#FFFFFF',
  soft: '#F7F7F7',
  card: '#FFFFFF',
  success: '#008A05',
  successSoft: '#EAF7EA',
  warning: '#C2410C',
  warningSoft: '#FFF4EC',
  danger: '#C13515',
  dangerSoft: '#FFF0ED',
} as const;

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const R = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
/** Left and right page margin on every screen. */
export const PageX = 20;
export const MaxContentWidth = 720;
/** Dashboards and lists on a laptop: cards in a grid instead of one long column. */
export const WideContentWidth = 1200;

/** Soft elevation used for the search pill, floating buttons and sheets. */
export const shadow = Platform.select({
  web: { boxShadow: '0 3px 12px rgba(0,0,0,0.12)' },
  default: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
}) as object;

/** Light lift for white cards on the grey page (lighter than `shadow`, which is for floating panels). */
export const cardShadow = Platform.select({
  web: { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  default: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
}) as object;
