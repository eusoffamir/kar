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
      style={({ pressed }) => [styles.button, inline && styles.inline, shadow, pressed && { opacity: 0.8 }]}>
      <Ionicons name={type === 'map' ? 'earth' : 'map-outline'} size={16} color={C.ink} />
      <Text style={styles.text}>{type === 'map' ? 'Satellite' : 'Map'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  inline: { position: 'relative', top: 0, right: 0, paddingVertical: 11 },
  text: { fontSize: 13, fontWeight: '600', color: C.ink },
});
