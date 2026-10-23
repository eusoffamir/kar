import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { api, useMe } from './api';

// Push notifications (native app builds). The database sends them through Expo's push service when a booking,
// ID check or claim changes (see notify() in supabase/migrations). Expo Go can't receive remote push.

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const supported = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
const DISMISSED_KEY = 'kar-push-prompt-dismissed';
/** "Not now" on Kar's own explanation screen waits this long before asking again. */
const ASK_AGAIN_MS = 7 * 86_400_000;

/** Saves this phone's push address for the signed-in user (permission must already be granted). */
async function register() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Kar', importance: AndroidImportance.HIGH });
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.registerPushToken(token);
  console.log('[push] registered', token.slice(0, 22));
}

const logFailure = (e: unknown) => console.warn('[push] registration failed:', e instanceof Error ? e.message : e);

/**
 * Signed in: registers silently if notifications are already allowed; otherwise `askNow` is true, and the app
 * shows its own explanation first (NotificationPrompt). The system's permission popup only appears after the
 * person taps "Turn on". Also opens the right screen when a notification is tapped.
 */
export function usePushNotifications() {
  const { data: me } = useMe();
  const signedIn = !!me?.id;
  const [askNow, setAskNow] = useState(false);

  useEffect(() => {
    if (!signedIn || !supported) return;
    let cancelled = false;
    (async () => {
      const perm = await Notifications.getPermissionsAsync();
      if (perm.status === 'granted') return register();
      if (!perm.canAskAgain) return; // turned off in the phone's settings: don't nag
      const dismissed = Number((await AsyncStorage.getItem(DISMISSED_KEY).catch(() => null)) ?? 0);
      if (!cancelled && Date.now() - dismissed > ASK_AGAIN_MS) setAskNow(true);
    })().catch(logFailure);
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const accept = useCallback(async () => {
    setAskNow(false);
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') await register().catch(logFailure);
  }, []);
  const later = useCallback(() => {
    setAskNow(false);
    AsyncStorage.setItem(DISMISSED_KEY, String(Date.now())).catch(() => {});
  }, []);

  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = last?.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
  }, [last]);

  return { askNow, isOwner: !!me?.is_owner, accept, later };
}
