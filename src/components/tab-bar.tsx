import { router, type Tabs } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { KarLogo } from '@/components/logo';
import { Avatar } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { useMe } from '@/lib/api';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** The tabs in order, with a press handler that behaves like the stock tab bar. */
function useTabs({ state, descriptors, emitter, navigateToTab }: TabBarProps) {
  return state.routes.map((route, i) => {
    const { options } = descriptors[route.key];
    const focused = state.index === i;
    const onPress = () => {
      const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigateToTab(route.key);
    };
    const icon = (color: string, size: number) => options.tabBarIcon?.({ focused, color, size });
    return { key: route.key, title: options.title ?? route.name, focused, onPress, icon };
  });
}

// Phone bar geometry: the active tab sits in a raised cobalt circle over a curved notch.
const BAR_H = 62;
const BTN = 21; // raised button radius
const NOTCH = 28; // notch radius, a little wider than the button
const SHOULDER = 12; // smooth curve from the flat top edge into the notch
const LIFT = BTN; // how far the button rises above the bar
const SIDE = 12; // gap between the floating bar and the screen edge
const PAD = 6; // inner padding so the end tabs' notch stays clear of the corners

/** Top edge of the bar with a notch centred on `cx`. The corners are clipped by the wrapper's border radius. */
function barPath(width: number, cx: number) {
  const a = NOTCH * Math.cos(0.45);
  const b = NOTCH * Math.sin(0.45);
  return [
    `M-60 0 L${cx - NOTCH - SHOULDER} 0`,
    `Q${cx - NOTCH} 0 ${cx - a} ${b}`,
    `A${NOTCH} ${NOTCH} 0 0 0 ${cx + a} ${b}`,
    `Q${cx + NOTCH} 0 ${cx + NOTCH + SHOULDER} 0`,
    `L${width + 60} 0 L${width + 60} ${BAR_H} L-60 ${BAR_H} Z`,
  ].join(' ');
}

/**
 * Slides a number to its new value over ~220 ms (plain JS, so it runs the same on web and native).
 * When `jumpKey` changes (the bar was measured or resized) it jumps instead of sliding.
 */
function useTween(target: number, jumpKey: number) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const lastKey = useRef(jumpKey);
  useEffect(() => {
    if (lastKey.current !== jumpKey) {
      lastKey.current = jumpKey;
      from.current = target;
      setValue(target);
      return;
    }
    const start = from.current;
    if (start === target) return;
    const t0 = Date.now();
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - t0) / 220);
      const v = start + (target - start) * (1 - Math.pow(1 - t, 3));
      from.current = v;
      setValue(v);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, jumpKey]);
  return value;
}

/** Tabs whose page is grey (Screen tint): only Trips. */
const GREY_TABS = ['trips'];

/** Phone: floating white bar, active tab raised in a cobalt circle above a curved notch. */
export function NotchTabBar(props: TabBarProps) {
  const tabs = useTabs(props);
  const [width, setWidth] = useState(0);
  const tabW = width ? (width - PAD * 2) / tabs.length : 0;
  const active = Math.max(0, tabs.findIndex((t) => t.focused));
  const cx = useTween(PAD + tabW * active + tabW / 2, width);
  const bottom = Math.max(props.insets.bottom, S.md);
  // Behind the bar: the same colour as the open tab's page (Trips uses the grey page).
  const behind = GREY_TABS.includes(props.state.routes[props.state.index]?.name) ? C.page : C.bg;

  return (
    <View style={{ backgroundColor: behind, paddingHorizontal: SIDE, paddingTop: LIFT, paddingBottom: bottom }}>
      <View style={[{ height: BAR_H }, barShadow]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.barClip}>
          {width ? (
            <Svg width={width} height={BAR_H}>
              <Path d={barPath(width, cx)} fill={C.bg} />
            </Svg>
          ) : null}
        </View>
        {width ? (
          <View style={[styles.button, { left: cx - BTN }]} pointerEvents="none">
            {tabs[active]?.icon('#fff', 20)}
          </View>
        ) : null}
        <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', paddingHorizontal: PAD }]}>
          {tabs.map((t) => (
            <Pressable
              key={t.key}
              onPress={t.onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: t.focused }}
              accessibilityLabel={t.title}
              style={styles.tab}>
              {t.focused ? null : t.icon(C.muted, 22)}
              <Text numberOfLines={1} style={[styles.label, t.focused && styles.labelActive]}>
                {t.title}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Laptop and tablet: a sidebar with the Kar logo, cobalt pill for the current page and the signed-in user at the bottom. */
export function SideBar(props: TabBarProps) {
  const tabs = useTabs(props);
  const { data: me } = useMe();
  return (
    <View style={[styles.side, { paddingTop: props.insets.top + S.xl, paddingBottom: props.insets.bottom + S.lg }]}>
      <View style={{ paddingHorizontal: S.md, marginBottom: S.xxl }}>
        <KarLogo size={34} />
      </View>
      <View style={{ gap: S.xs }}>
        {tabs.map((t) => (
          <Pressable
            key={t.key}
            onPress={t.onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: t.focused }}
            style={({ pressed }) => [styles.sideItem, t.focused ? styles.sideItemActive : pressed && { backgroundColor: C.soft }]}>
            {t.icon(t.focused ? '#fff' : C.text, 22)}
            <Text style={[styles.sideLabel, t.focused && { color: '#fff' }]}>{t.title}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      {me ? (
        <Pressable onPress={() => router.navigate('/account')} style={styles.sideUser}>
          <Avatar name={me.full_name} uri={me.avatar_url} size={36} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.sideUserName}>
              {me.full_name}
            </Text>
            <Text style={styles.sideUserSub}>View profile</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const barShadow = Platform.select<ViewStyle>({
  web: { filter: 'drop-shadow(0 4px 14px rgba(1,49,197,0.14))' } as ViewStyle,
  ios: { shadowColor: C.brand, shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  default: { filter: [{ dropShadow: { offsetX: 0, offsetY: 4, standardDeviation: 8, color: 'rgba(1,49,197,0.16)' } }] },
});

const styles = StyleSheet.create({
  barClip: { ...StyleSheet.absoluteFill, borderRadius: R.lg + 4, overflow: 'hidden' },
  button: {
    position: 'absolute',
    top: -LIFT,
    width: BTN * 2,
    height: BTN * 2,
    borderRadius: BTN,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10, gap: 3 },
  label: { fontSize: 11, fontWeight: '500', color: C.muted },
  labelActive: { fontSize: 12, fontWeight: '700', color: C.brand },
  side: { width: 240, backgroundColor: C.bg, borderRightWidth: 1, borderRightColor: C.line, paddingHorizontal: S.md },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.md, paddingVertical: 12, borderRadius: R.md },
  sideItemActive: { backgroundColor: C.brand },
  sideLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  sideUser: { flexDirection: 'row', alignItems: 'center', gap: S.sm, padding: S.sm, borderRadius: R.md, borderWidth: 1, borderColor: C.line },
  sideUserName: { fontSize: 14, fontWeight: '600', color: C.ink },
  sideUserSub: { fontSize: 12, color: C.muted },
});
