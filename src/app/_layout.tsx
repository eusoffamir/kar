import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { C } from '@/constants/theme';
import { queryClient } from '@/lib/api';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
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
        <Stack.Screen name="search" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="trip/[id]" options={{ title: 'Trip' }} />
        <Stack.Screen name="host/booking/[id]" options={{ title: 'Booking' }} />
        <Stack.Screen name="host/new-car" options={{ title: 'List your car' }} />
        <Stack.Screen name="host/car/[id]" options={{ title: 'Edit car' }} />
        <Stack.Screen name="sign-in" options={{ title: 'Sign in', presentation: 'modal' }} />
        <Stack.Screen name="verify" options={{ title: 'Verify your ID' }} />
        <Stack.Screen name="trip/help" options={{ title: 'Get help' }} />
        <Stack.Screen name="admin" options={{ title: 'Kar admin' }} />
      </Stack>
    </QueryClientProvider>
  );
}
