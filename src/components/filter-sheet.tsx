import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PriceRange } from '@/components/price-range';
import { Button, Ionicons, Row, Txt, type IconName } from '@/components/ui';
import { C, MaxContentWidth, R, S, PageX, shadow } from '@/constants/theme';
import { NO_FILTERS, setCarFilters, useCarFilters, type CarSort } from '@/lib/stores';

const ONLY = [
  ['auto', 'Automatic', 'speedometer-outline'],
  ['keyless', 'Keyless pickup', 'key-outline'],
  ['instant', 'Instant book', 'flash-outline'],
  ['seats7', '7+ seats', 'people-outline'],
  ['topRated', 'Top rated owner', 'star-outline'],
] as const;

const SORTS: [CarSort, string][] = [
  ['recommended', 'Recommended'],
  ['price', 'Lowest price'],
  ['newest', 'Newest car'],
];

/**
 * Explore's filter button opens this: sort, price range and "Only show" chips that apply at once.
 * Drops down right under the search bar (where the button is), over a dimmed list, instead of a sheet from the bottom.
 * Render it as the last child of the area below the header so it covers only the list.
 */
export function FilterSheet({ visible, onClose, prices }: { visible: boolean; onClose: () => void; prices: number[] }) {
  const filters = useCarFilters();
  if (!visible) return null;
  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.panel, shadow]}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="h2">Filters</Txt>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={C.ink} />
          </Pressable>
        </Row>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: S.lg }}>
          <Section title="Sort by">
            {SORTS.map(([key, label]) => (
              <Chip key={key} label={label} on={filters.sort === key} radio onPress={() => setCarFilters({ ...filters, sort: key })} />
            ))}
          </Section>
          <View style={{ gap: S.sm }}>
            <Txt v="h3">Price per day</Txt>
            <PriceRange
              prices={prices}
              min={filters.minDay}
              max={filters.maxDay}
              onChange={(minDay, maxDay) => setCarFilters({ ...filters, minDay, maxDay })}
            />
          </View>
          <Section title="Only show">
            {ONLY.map(([key, label, icon]) => (
              <Chip key={key} label={label} icon={icon} on={filters[key]} onPress={() => setCarFilters({ ...filters, [key]: !filters[key] })} />
            ))}
          </Section>
        </ScrollView>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable onPress={() => setCarFilters(NO_FILTERS)} hitSlop={8}>
            <Txt v="h3" underline>Clear</Txt>
          </Pressable>
          <Button title="Done" variant="dark" onPress={onClose} style={{ minWidth: 120 }} />
        </Row>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: S.sm }}>
      <Txt v="h3">{title}</Txt>
      <Row gap={S.sm} style={{ flexWrap: 'wrap' }}>
        {children}
      </Row>
    </View>
  );
}

/** One chip. `radio`: pick one of the group (sort, price); otherwise it switches on and off. */
function Chip({ label, icon, on, radio, onPress }: { label: string; icon?: IconName; on: boolean; radio?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
      accessibilityRole={radio ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: on }}>
      {icon || (on && !radio) ? <Ionicons name={on ? 'checkmark' : icon!} size={14} color={on ? '#fff' : C.ink} /> : null}
      <Txt v="small" color={on ? '#fff' : C.ink} style={{ fontWeight: '600' }}>{label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: PageX, paddingTop: S.sm },
  panel: { maxHeight: '90%', width: '100%', maxWidth: MaxContentWidth - 2 * PageX, alignSelf: 'center', backgroundColor: C.bg, borderRadius: R.lg, padding: S.lg, gap: S.lg },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 9 },
  chipOn: { backgroundColor: C.brand, borderColor: C.brand },
});
