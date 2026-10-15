import { Link } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorText, Ionicons, Row, Txt } from '@/components/ui';
import { C, MaxContentWidth, R, S } from '@/constants/theme';
import { HOUSE_RULES } from '@/lib/policy';
import { rm } from '@/lib/pricing';

/** Bottom sheet shown before payment: the customer must tick "I agree" to the house rules. */
export function HouseRulesSheet({
  visible,
  total,
  deposit,
  lateFee,
  loading,
  error,
  onClose,
  onAgree,
}: {
  visible: boolean;
  total: number;
  deposit: number;
  lateFee: number;
  loading: boolean;
  error: unknown;
  onClose: () => void;
  onAgree: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, S.lg) }]}>
        <View style={styles.inner}>
          <View style={styles.grabber} />
          <Txt v="h2">House rules</Txt>
          <View style={{ gap: S.sm }}>
            {HOUSE_RULES.map((r) => (
              <Row key={r} gap={S.md} style={{ alignItems: 'flex-start' }}>
                <Ionicons name="checkmark" size={18} color={C.ink} style={{ marginTop: 2 }} />
                <Txt style={{ flex: 1 }}>{r}</Txt>
              </Row>
            ))}
            <Txt v="small">
              Late fee {rm(lateFee)}/hour. Refundable deposit {rm(deposit)}, included in the total.
            </Txt>
          </View>
          <Pressable onPress={() => setAgreed((a) => !a)} style={styles.agree} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}>
            <View style={[styles.box, agreed && { backgroundColor: C.ink, borderColor: C.ink }]}>
              {agreed ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
            </View>
            <Txt v="h3">I agree to the house rules</Txt>
          </Pressable>
          <Txt v="small">
            Paying means you also agree to the{' '}
            <Link href="/legal/terms" onPress={onClose}><Txt v="small" color={C.ink} underline>Terms</Txt></Link> and{' '}
            <Link href="/legal/refunds" onPress={onClose}><Txt v="small" color={C.ink} underline>Refund & Cancellation Policy</Txt></Link>.
          </Txt>
          <ErrorText error={error} />
          <Button title={`Pay ${rm(total)}`} icon="lock-closed" disabled={!agreed} loading={loading} onPress={onAgree} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingTop: S.sm },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: S.xl, gap: S.lg },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.lineStrong },
  agree: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.sm },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
