import { Tabs } from 'expo-router';
import { Platform, type ColorValue } from 'react-native';

import { Ionicons, type IconName } from '@/components/ui';
import { C } from '@/constants/theme';
import { useMe } from '@/lib/api';
import { useLayout } from '@/lib/use-layout';

function icon(name: IconName, active: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? active : name} color={color} size={24} />;
  };
}

export default function TabsLayout() {
  const { data: me } = useMe();
  // Laptops and tablets get a sidebar; phones keep the tab bar at the bottom.
  const { wide } = useLayout();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.brand,
        tabBarInactiveTintColor: C.muted,
        ...(wide
          ? {
              tabBarPosition: 'left',
              tabBarLabelPosition: 'beside-icon',
              tabBarLabelStyle: { fontSize: 15, fontWeight: '600' },
              tabBarActiveBackgroundColor: C.brandSoft,
              tabBarStyle: { backgroundColor: C.bg, borderRightColor: C.line, paddingTop: 16, width: 220, minWidth: 220 },
            }
          : {
              tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
              tabBarStyle: {
                backgroundColor: C.bg,
                borderTopColor: C.line,
                // Web has no safe-area inset, so give labels room explicitly.
                ...(Platform.OS === 'web' ? { height: 64, paddingBottom: 8 } : null),
              },
            }),
      }}>
      <Tabs.Screen name="index" options={{ title: 'Explore', tabBarIcon: icon('search-outline', 'search') }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips', tabBarIcon: icon('car-sport-outline', 'car-sport') }} />
      <Tabs.Screen
        name="host"
        options={{ title: me?.is_owner ? 'My cars' : 'Host', tabBarIcon: icon('key-outline', 'key') }}
      />
      <Tabs.Screen name="account" options={{ title: 'Profile', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
