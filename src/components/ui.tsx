import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Children, isValidElement, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KarMark } from '@/components/logo';
import { C, MaxContentWidth, R, S, shadow, WideContentWidth, PageX } from '@/constants/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export { Ionicons };

type TxtProps = {
  children: ReactNode;
  v?: 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'label' | 'tiny';
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  underline?: boolean;
};

export function Txt({ children, v = 'body', color, style, numberOfLines, underline }: TxtProps) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[t[v], color ? { color } : null, underline ? { textDecorationLine: 'underline' } : null, style]}>
      {children}
    </Text>
  );
}

const t = StyleSheet.create({
  // One type scale for every page; screens use these instead of their own font sizes.
  h1: { fontSize: 22, fontWeight: '700', color: C.ink, letterSpacing: -0.3 },
  h2: { fontSize: 18, fontWeight: '700', color: C.ink, letterSpacing: -0.2 },
  h3: { fontSize: 15, fontWeight: '600', color: C.ink },
  body: { fontSize: 14, color: C.text, lineHeight: 20 },
  small: { fontSize: 13, color: C.muted, lineHeight: 18 },
  label: { fontSize: 16, fontWeight: '700', color: C.ink },
  tiny: { fontSize: 11, color: C.muted },
});

/** Page with safe-area padding, an optional sticky footer, and a max width for laptop browsers. */
export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  footer,
  padded = true,
  scrollEnabled = true,
  wide = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
  footer?: ReactNode;
  padded?: boolean;
  /** Turn off while the user drags a map inside the page. */
  scrollEnabled?: boolean;
  /** Use the laptop's width (dashboards, card grids). Reading and form pages stay a comfortable column. */
  wide?: boolean;
}) {
  const inner = (
    <View style={[styles.content, wide && { maxWidth: WideContentWidth }, !padded && { padding: 0 }, !scroll && { flex: 1 }]}>
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={edges} style={styles.screen}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: S.xxl }} keyboardShouldPersistTaps="handled" scrollEnabled={scrollEnabled}>
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
      {footer ? (
        <View style={styles.footer}>
          <View style={styles.footerInner}>{footer}</View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

/** Cards in as many columns as fit (one on a phone), each at least `min` wide. */
export function Grid({ children, min = 300, gap = S.xl }: { children: ReactNode; min?: number; gap?: number }) {
  const [width, setWidth] = useState(0);
  const items = Children.toArray(children);
  const cols = width ? Math.max(1, Math.floor((width + gap) / (min + gap))) : 1;
  // 1px of slack: onLayout rounds the row width, and cards adding up to exactly the row wrap the last one.
  const itemWidth = cols > 1 ? Math.floor((width - 1 - gap * (cols - 1)) / cols) : undefined;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {items.map((child, i) => (
        <View key={isValidElement(child) && child.key != null ? child.key : i} style={itemWidth ? { width: itemWidth } : { width: '100%' }}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A titled block separated from the next by a hairline, like an Airbnb listing page. */
export function Section({ title, children, last }: { title?: string; children: ReactNode; last?: boolean }) {
  return (
    <View style={[{ gap: S.md, paddingVertical: S.lg }, !last && { borderBottomWidth: 1, borderBottomColor: C.line }]}>
      {title ? <Txt v="label">{title}</Txt> : null}
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  size = 'lg',
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'dark' | 'outline' | 'danger' | 'ghost';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'lg' | 'md';
}) {
  const bg = { primary: C.brand, dark: C.ink, outline: C.bg, danger: C.bg, ghost: 'transparent' }[variant];
  const fg = { primary: '#fff', dark: '#fff', outline: C.ink, danger: C.danger, ghost: C.ink }[variant];
  const border = { outline: C.ink, danger: C.danger }[variant as 'outline' | 'danger'];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        size === 'md' && { minHeight: 38, paddingHorizontal: S.md },
        { backgroundColor: bg, opacity: off ? 0.4 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        border ? { borderWidth: 1, borderColor: border } : null,
        variant === 'ghost' && { paddingHorizontal: 0, minHeight: 32 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
          <Text
            style={[
              styles.buttonText,
              { color: fg },
              size === 'md' && { fontSize: 14 },
              variant === 'ghost' && { textDecorationLine: 'underline', fontSize: 14 },
            ]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Round icon button floating over photos (back, share). */
export function IconButton({ icon, onPress, color = C.ink, style }: { icon: IconName; onPress: () => void; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.iconButton, shadow, pressed && { opacity: 0.8 }, style]}>
      <Ionicons name={icon} size={18} color={color} />
    </Pressable>
  );
}

const TONES = {
  brand: [C.brandSoft, C.brandDark],
  success: [C.successSoft, C.success],
  warning: [C.warningSoft, C.warning],
  danger: [C.dangerSoft, C.danger],
  muted: [C.soft, C.muted],
} as const;

export function Badge({ label, tone = 'brand', icon }: { label: string; tone?: keyof typeof TONES; icon?: IconName }) {
  const [bg, fg] = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** White pill badge laid over a photo ("Top rated", "Instant"). */
export function PhotoBadge({ label }: { label: string }) {
  return (
    <View style={[styles.photoBadge, shadow]}>
      <Text style={styles.photoBadgeText}>{label}</Text>
    </View>
  );
}

/** On/off switch in Kar colours (the web version needs its own "on" thumb colour). */
export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const webOnly = { activeThumbColor: '#fff' } as object;
  return (
    <Switch value={value} onValueChange={onChange} trackColor={{ true: C.brand, false: C.lineStrong }} thumbColor="#fff" {...webOnly} />
  );
}

export function Row({ children, style, gap = S.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

/** Icon + title + description row used for listing highlights. */
export function Feature({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  return (
    <Row gap={S.lg} style={{ alignItems: 'flex-start' }}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={18} color={C.brand} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="h3">{title}</Txt>
        {body ? <Txt v="small">{body}</Txt> : null}
      </View>
    </Row>
  );
}

export function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
      <Txt v={strong ? 'h3' : 'body'}>{label}</Txt>
      <Txt v={strong ? 'h3' : 'body'}>{value}</Txt>
    </Row>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: C.line, marginVertical: S.sm }} />;
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initials || '?'}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={C.brand} size="large" />
    </View>
  );
}

/** Empty state. icon="kar" shows the Kar mark instead of an icon. */
export function Empty({ icon, title, body, action }: { icon: IconName | 'kar'; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={[styles.center, { paddingVertical: S.xxl, gap: S.sm }]}>
      {/* The Kar mark is white on solid cobalt, like the active tab button. */}
      <View style={[styles.emptyIcon, icon === 'kar' && { backgroundColor: C.brand }]}>
        {icon === 'kar' ? <KarMark size={34} color="#fff" /> : <Ionicons name={icon} size={28} color={C.brand} />}
      </View>
      <Txt v="h2" style={{ textAlign: 'center' }}>{title}</Txt>
      {body ? <Txt v="small" style={{ textAlign: 'center', maxWidth: 300 }}>{body}</Txt> : null}
      {action ? <View style={{ marginTop: S.md }}>{action}</View> : null}
    </View>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <View style={styles.error}>
      <Ionicons name="alert-circle" size={18} color={C.danger} />
      <Txt v="small" color={C.danger} style={{ flex: 1 }}>
        {error instanceof Error ? error.message : String(error)}
      </Txt>
    </View>
  );
}

/** Car photo, or a neutral placeholder until the owner uploads photos. */
export function CarThumb({ car, height = 140, radius = R.md }: { car: { model: string; photos: string[] }; height?: number; radius?: number }) {
  if (car.photos[0]) {
    return <Image source={{ uri: car.photos[0] }} style={{ height, borderRadius: radius, backgroundColor: C.soft }} contentFit="cover" transition={200} />;
  }
  return (
    <View style={[styles.thumb, { height, borderRadius: radius }]}>
      <Ionicons name="car-sport-outline" size={Math.min(64, height * 0.4)} color={C.muted} />
    </View>
  );
}

/** Swipeable photo gallery with a "1 / 3" counter. */
export function PhotoGallery({ photos, height, radius = 0, children }: { photos: string[]; height: number; radius?: number; children?: ReactNode }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View onLayout={onLayout} style={{ height, borderRadius: radius, overflow: 'hidden', backgroundColor: C.soft }}>
      {photos.length === 0 ? (
        <View style={[styles.thumb, { flex: 1 }]}>
          <Ionicons name="car-sport-outline" size={64} color={C.muted} />
        </View>
      ) : width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          onScroll={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          scrollEventThrottle={64}>
          {photos.map((uri) => (
            <Image key={uri} source={{ uri }} style={{ width, height }} contentFit="cover" transition={200} />
          ))}
        </ScrollView>
      ) : null}
      {photos.length > 1 ? (
        <View style={styles.counter}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
            {index + 1} / {photos.length}
          </Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  featureIcon: { width: 34, height: 34, borderRadius: R.md, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: S.sm },
  screen: { flex: 1, backgroundColor: C.bg },
  // Spacing system: PageX (20) page margin, 16 between blocks, 12 inside blocks, 8 between tightly related items.
  // flexGrow: a child with marginTop: 'auto' sits at the bottom of a short page (Profile's support and legal links).
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: PageX, paddingVertical: S.lg, gap: S.lg, flexGrow: 1 },
  footer: { borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg },
  footerInner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: PageX, paddingVertical: S.md },
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, borderWidth: 1, borderColor: C.line, gap: S.md },
  button: {
    minHeight: 44,
    borderRadius: R.sm,
    paddingHorizontal: S.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: S.sm,
  },
  buttonText: { fontSize: 15, fontWeight: '600' },
  iconButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.sm,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  photoBadge: { backgroundColor: '#fff', borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 5 },
  photoBadgeText: { fontSize: 13, fontWeight: '600', color: C.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.xl },
  error: {
    flexDirection: 'row',
    gap: S.sm,
    alignItems: 'center',
    backgroundColor: C.dangerSoft,
    padding: S.md,
    borderRadius: R.sm,
  },
  thumb: { backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  counter: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
