import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { C } from '@/constants/theme';

/** The Kar mark: one hand-drawn line, a car's bonnet, windscreen, roof and wheel arch. */
export function KarMark({ size = 32, color = C.brand }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size * (125 / 180)} viewBox="0 0 180 125" fill="none">
      <Path
        d="M168 12 L116 12 C96 12 86 30 72 60 C69 67 64 72 56 72 L22 72 C14 72 10 76 10 84 L10 104 C10 111 13 114 20 114 L74 114 C74 98 86 86 100 86 C114 86 126 98 126 114 L170 114"
        stroke={color}
        strokeWidth={13}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Mark plus the "Kar" wordmark, for the sidebar and headers. */
export function KarLogo({ size = 36, color = C.brand }: { size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.28 }}>
      <KarMark size={size} color={color} />
      <Text style={{ fontSize: size * 0.72, fontWeight: '800', color, letterSpacing: -0.5 }}>Kar</Text>
    </View>
  );
}
