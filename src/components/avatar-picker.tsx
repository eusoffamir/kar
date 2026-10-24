import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { api, useAction } from '@/lib/api';

/**
 * Pick a square profile photo and upload it. Required for owners and renters so they recognise each other at the
 * key handover (separate from the private ID selfie).
 */
export function useAvatarUpload() {
  return useAction(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: Platform.OS === 'web', // web: a data: URI, so demo photos survive reloads
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    await api.uploadAvatar(Platform.OS === 'web' && a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri);
  });
}
