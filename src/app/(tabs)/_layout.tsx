import { Tabs } from 'expo-router';
import { type ColorValue } from 'react-native';

import { NotchTabBar, SideBar } from '@/components/tab-bar';
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
      tabBar={(props) => (wide ? <SideBar {...props} /> : <NotchTabBar {...props} />)}
      screenOptions={{ headerShown: false, tabBarPosition: wide ? 'left' : 'bottom', sceneStyle: { backgroundColor: C.bg } }}>
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
