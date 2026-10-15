import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { api, useMe } from './api';

// Push notifications (native app builds). The database sends them through Expo's push service when a booking,
// ID check or claim changes (see notify() in supabase/migrations). Expo Go can't receive remote push.

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function register() {
  // Expo Go can't receive remote push. Emulators with Google Play can, so they're allowed (handy for testing).
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Kar', importance: Notifications.AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.registerPushToken(token);
}

/** Registers this phone for notifications once someone is signed in, and opens the right screen on tap. */
export function usePushNotifications() {
  const { data: me } = useMe();
  const signedIn = !!me?.id;

  useEffect(() => {
    if (signedIn) register().catch(() => {});
  }, [signedIn]);

  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = last?.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
  }, [last]);
}
