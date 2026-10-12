import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ErrorText, Ionicons, Txt } from '@/components/ui';
import { C, R, S, shadow } from '@/constants/theme';
import { api } from '@/lib/api';

export type EvidencePhoto = { uri: string; path: string };

/** Up to `max` private evidence photos for a booking (damage claims, incident reports). */
export function EvidencePicker({
  bookingId,
  photos,
  onChange,
  max = 4,
}: {
  bookingId: string;
  photos: EvidencePhoto[];
  onChange: (p: EvidencePhoto[]) => void;
  max?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const add = async () => {
    setError(null);
    const native = Platform.OS !== 'web';
    if (native) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: !native };
    const res = native ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    const uri = !native && a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri;
    setBusy(true);
    try {
      const path = await api.uploadEvidence(bookingId, uri);
      onChange([...photos, { uri, path }]);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: S.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
        {photos.map((p, i) => (
          <View key={p.path + i}>
            <Image source={{ uri: p.uri }} style={styles.photo} contentFit="cover" />
            <Pressable hitSlop={8} onPress={() => onChange(photos.filter((_, j) => j !== i))} style={[styles.remove, shadow]}>
              <Ionicons name="close" size={14} color={C.ink} />
            </Pressable>
          </View>
        ))}
        {photos.length < max ? (
          <Pressable onPress={add} disabled={busy} style={[styles.photo, styles.add]}>
            {busy ? <ActivityIndicator color={C.ink} /> : <Ionicons name="camera-outline" size={24} color={C.ink} />}
            <Txt v="tiny">{busy ? 'Uploading' : 'Add photo'}</Txt>
          </Pressable>
        ) : null}
      </ScrollView>
      <ErrorText error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: 96, height: 76, borderRadius: R.md, backgroundColor: C.soft },
  add: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center', gap: 2 },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
