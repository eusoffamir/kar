import { useWindowDimensions } from 'react-native';

/** Laptop/tablet layouts: sidebar navigation, card grids and side-by-side panels. Phones keep the one-column app. */
export const WIDE_MIN = 900;
/** Room for a list and a map side by side (Explore) or two content columns (car page). */
export const SPLIT_MIN = 1100;

export function useLayout() {
  const { width } = useWindowDimensions();
  return { width, wide: width >= WIDE_MIN, split: width >= SPLIT_MIN };
}

/** How many cards fit across `width` with a minimum card width (grid of car cards). */
export const gridColumns = (width: number, minCard = 300, gap = 24) => Math.max(1, Math.floor((width + gap) / (minCard + gap)));
