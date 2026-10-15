import { Platform } from 'react-native';

// Kar design tokens. Airbnb-style: white canvas, near-black ink, one blue brand colour,
// photos do the talking. Light UI for the MVP (see app.json userInterfaceStyle).
export const C = {
  brand: '#0F5BFF',
  brandDark: '#0A3FB8',
  brandSoft: '#EEF3FF',
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
