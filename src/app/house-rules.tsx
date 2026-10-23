import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Screen, Txt } from '@/components/ui';
import { C, S } from '@/constants/theme';
import { HOUSE_RULES } from '@/lib/policy';
import { rm } from '@/lib/pricing';
import { setRulesAgreed } from '@/lib/stores';

/**
 * The house rules as a page, opened from "Confirm and pay". "I agree" sits at the end, after every rule; it marks
 * this car's rules as agreed and goes back to the car, which reopens the pay sheet with Pay turned on.
 */
export default function HouseRules() {
  const { carId, lateFee } = useLocalSearchParams<{ carId?: string; lateFee?: string }>();
  const rules = lateFee ? [...HOUSE_RULES, `Late fee for this car: ${rm(Number(lateFee))}/hour.`] : HOUSE_RULES;

  const agree = () => {
    if (carId) setRulesAgreed(carId);
    if (router.canGoBack()) router.back();
    else if (carId) router.replace({ pathname: '/car/[id]', params: { id: carId } });
    else router.replace('/');
  };

  return (
    <Screen edges={['bottom']}>
      <Txt v="small">Please read every rule. They protect you, the owner and the car.</Txt>
      <View style={{ gap: S.lg }}>
        {rules.map((r, i) => (
          <View key={r} style={styles.rule}>
            <Text style={styles.num}>{i + 1}</Text>
            <Text style={styles.text}>{r}</Text>
          </View>
        ))}
      </View>
      {/* At the end of the list, not a sticky bar: the renter scrolls past every rule to reach it. */}
      <Button title="I agree to the house rules" onPress={agree} style={{ marginTop: S.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  rule: { flexDirection: 'row', gap: S.md, alignItems: 'flex-start' },
  num: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.soft,
    textAlign: 'center',
    lineHeight: 26,
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
    overflow: 'hidden',
  },
  text: { flex: 1, fontSize: 15, lineHeight: 22, color: C.ink, paddingTop: 2 },
});
