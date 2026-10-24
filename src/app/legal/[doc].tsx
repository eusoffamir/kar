import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { ErrorText, Row, Screen, Txt } from '@/components/ui';
import { C, S } from '@/constants/theme';
import { LEGAL } from '@/lib/legal';

const ORDER = ['terms', 'refunds', 'privacy'] as const;

/** Public policy pages: /legal/terms, /legal/refunds, /legal/privacy (linked from sign-in, checkout and Account). */
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const page = LEGAL[doc as keyof typeof LEGAL];
  if (!page) return <Screen edges={['bottom']}><ErrorText error="Page not found" /></Screen>;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: page.title }} />
      <View style={{ gap: S.xs }}>
        <Txt v="h1">{page.title}</Txt>
        <Txt v="small">Last updated {page.updated}</Txt>
      </View>
      <Txt>{page.intro}</Txt>
      {page.sections.map((s) => (
        <View key={s.h} style={{ gap: S.sm }}>
          <Txt v="h3">{s.h}</Txt>
          {s.p.map((p) => (
            <Txt key={p.slice(0, 40)}>{p}</Txt>
          ))}
        </View>
      ))}
      <Row gap={S.lg} style={{ flexWrap: 'wrap', justifyContent: 'center', paddingTop: S.lg, borderTopWidth: 1, borderTopColor: C.line }}>
        {ORDER.filter((k) => k !== doc).map((k) => (
          <Link key={k} href={`/legal/${k}`}>
            <Txt v="small" color={C.ink} underline>{LEGAL[k].title}</Txt>
          </Link>
        ))}
      </Row>
    </Screen>
  );
}
