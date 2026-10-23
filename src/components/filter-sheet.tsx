import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Ionicons, Row, Txt } from '@/components/ui';
import { C, MaxContentWidth, R, S, PageX, shadow } from '@/constants/theme';
import { setCarFilters, useCarFilters } from '@/lib/stores';

const OPTIONS = [
  ['auto', 'Automatic', 'speedometer-outline'],
  ['keyless', 'Keyless pickup', 'key-outline'],
  ['instant', 'Instant book', 'flash-outline'],
] as const;

/**
 * Explore's filter button opens this: "Only show" chips that apply at once.
 * Drops down right under the search bar (where the button is), over a dimmed list, instead of a sheet from the bottom.
 * Render it as the last child of the area below the header so it covers only the list.
 */
export function FilterSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const filters = useCarFilters();
  if (!visible) return null;
  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.panel, shadow]}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="h2">Only show</Txt>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={C.ink} />
          </Pressable>
        </Row>
        <Row gap={S.sm} style={{ flexWrap: 'wrap' }}>
          {OPTIONS.map(([key, label, icon]) => {
            const on = filters[key];
            return (
              <Pressable
                key={key}
                onPress={() => setCarFilters({ ...filters, [key]: !on })}
                style={[styles.chip, on && styles.chipOn]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}>
                <Ionicons name={on ? 'checkmark' : icon} size={14} color={on ? '#fff' : C.ink} />
                <Txt v="small" color={on ? '#fff' : C.ink} style={{ fontWeight: '600' }}>{label}</Txt>
              </Pressable>
            );
          })}
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable onPress={() => setCarFilters({ auto: false, keyless: false, instant: false })} hitSlop={8}>
            <Txt v="h3" underline>Clear</Txt>
          </Pressable>
          <Button title="Done" variant="dark" onPress={onClose} style={{ minWidth: 120 }} />
        </Row>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: PageX, paddingTop: S.sm },
  panel: { width: '100%', maxWidth: MaxContentWidth - 2 * PageX, alignSelf: 'center', backgroundColor: C.bg, borderRadius: R.lg, padding: S.lg, gap: S.lg },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 9 },
  chipOn: { backgroundColor: C.brand, borderColor: C.brand },
});
