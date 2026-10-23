import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { C, shadow } from '@/constants/theme';
import { setMapType, useMapType } from '@/lib/stores';

/** Floating Map / Satellite switch shown in the top-right corner of every map. */
export function MapTypeToggle({ inline }: { inline?: boolean } = {}) {
  const type = useMapType();
  const next = type === 'map' ? 'satellite' : 'map';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${next} view`}
      onPress={() => setMapType(next)}
      style={({ pressed }) => [styles.button, inline ? styles.inline : styles.topRight, shadow, pressed && { opacity: 0.8 }]}>
      <Ionicons name={type === 'map' ? 'earth' : 'map-outline'} size={16} color={C.ink} />
      <Text style={styles.text}>{type === 'map' ? 'Satellite' : 'Map'}</Text>
    </Pressable>
  );
}

/** Floating "Centre" button (top-left) on single-car maps: brings the car back to the middle after the user drags away. */
export function RecenterButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Centre the map on the car"
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.button, styles.topLeft, shadow, pressed && { opacity: 0.8 }]}>
      <Ionicons name="locate" size={16} color={C.ink} />
      <Text style={styles.text}>Centre</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  // Each corner is its own style: overriding `right` with undefined still pinned both sides on web (stretched button).
  topRight: { position: 'absolute', top: 12, right: 12 },
  topLeft: { position: 'absolute', top: 12, left: 12 },
  inline: { paddingVertical: 11 },
  text: { fontSize: 13, fontWeight: '600', color: C.ink },
});
