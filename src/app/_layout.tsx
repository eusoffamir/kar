import { QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable } from 'react-native';

import { Ionicons } from '@/components/ui';
import { C } from '@/constants/theme';
import { NotificationPrompt } from '@/components/notification-prompt';
import { queryClient } from '@/lib/api';
// Registers the background location task at startup, so the OS can wake Kar with trip locations.
import '@/lib/trip-tracker';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <NotificationPrompt />
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: C.ink,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: C.bg },
          headerTitleStyle: { fontWeight: '600' },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: C.bg },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="car/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="owner/[id]" options={{ headerShown: false }} />
        {/* Full screen, not an iPhone sheet: the sheet looked like a pop-up and its swipe-down-to-close fought the calendar drags. */}
        <Stack.Screen name="search" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        {/* Own back arrow: after the payment redirect or a reload on web there is no history, so the default one is missing. */}
        <Stack.Screen name="trip/[id]" options={{ title: 'Trip', headerLeft: () => <BackTo fallback="/trips" /> }} />
        <Stack.Screen name="host/booking/[id]" options={{ title: 'Booking', headerLeft: () => <BackTo fallback="/host" /> }} />
        <Stack.Screen name="host/register" options={{ title: 'Register your car' }} />
        <Stack.Screen name="host/new-car" options={{ title: 'List your car' }} />
        <Stack.Screen name="host/car/[id]" options={{ title: 'Edit car' }} />
        <Stack.Screen name="host/track/[id]" options={{ title: 'Live location' }} />
        <Stack.Screen name="host/documents" options={{ title: 'Operator documents' }} />
        <Stack.Screen name="host/waitlist" options={{ title: 'Student waitlist' }} />
        {/* Full screen on iPhone ('modal' shows a card with a gap on top, like a pop-up). Closed with the page's own back arrow. */}
        <Stack.Screen name="sign-in" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="verify" options={{ title: 'Verify your ID' }} />
        <Stack.Screen name="trip/help" options={{ title: 'Get help' }} />
        <Stack.Screen name="admin" options={{ title: 'Kar admin' }} />
        <Stack.Screen name="legal/[doc]" options={{ title: '' }} />
      </Stack>
    </QueryClientProvider>
  );
}

function BackTo({ fallback }: { fallback: '/trips' | '/host' }) {
  return (
    <Pressable
      hitSlop={12}
      accessibilityLabel="Back"
      style={{ paddingRight: 8 }}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}>
      <Ionicons name="chevron-back" size={26} color={C.ink} />
    </Pressable>
  );
}
