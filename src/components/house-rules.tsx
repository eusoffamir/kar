import { Link } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorText, Ionicons, Row, Txt } from '@/components/ui';
import { C, MaxContentWidth, R, S, PageX } from '@/constants/theme';
import { HOUSE_RULES } from '@/lib/policy';
import { rm } from '@/lib/pricing';

/**
 * Last step before payment, kept short so Pay is always on screen (even on a small phone): when, the total, one
 * "I agree" tick, Pay. The house rules open on tap and scroll inside the sheet.
 */
export function HouseRulesSheet({
  visible,
  when,
  total,
  deposit,
  lateFee,
  loading,
  error,
  onClose,
  onAgree,
}: {
  visible: boolean;
  /** e.g. "Sat 17 Oct, 8am – 8pm" */
  when: string;
  total: number;
  deposit: number;
  lateFee: number;
  loading: boolean;
  error: unknown;
  onClose: () => void;
  onAgree: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, S.lg) }]}>
          <View style={[styles.inner, { flexShrink: 1 }]}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="h2">Confirm and pay</Txt>
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={C.ink} />
              </Pressable>
            </Row>

            <View style={{ gap: 2 }}>
              <Txt v="h3">{when}</Txt>
              <Txt v="small">
                {rm(total)} total{deposit > 0 ? `, includes ${rm(deposit)} refundable deposit` : ''}
              </Txt>
            </View>

            {/* The only part that can grow: it scrolls, so Pay below never leaves the screen. */}
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: S.sm }}>
              <Row gap={S.md}>
                <Pressable onPress={() => setAgreed((a) => !a)} style={styles.agree} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}>
                  <View style={[styles.box, agreed && { backgroundColor: C.ink, borderColor: C.ink }]}>
                    {agreed ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                  </View>
                  <Txt v="h3">I agree to the house rules</Txt>
                </Pressable>
                <Pressable onPress={() => setRulesOpen((o) => !o)} hitSlop={8} accessibilityRole="button">
                  <Txt v="small" color={C.ink} underline>{rulesOpen ? 'Hide' : 'Read'}</Txt>
                </Pressable>
              </Row>
              {rulesOpen ? (
                <View style={{ gap: S.sm, paddingBottom: S.sm }}>
                  {HOUSE_RULES.map((r) => (
                    <Txt key={r} v="small">{r}</Txt>
                  ))}
                  <Txt v="small">Late fee here: {rm(lateFee)}/hour.</Txt>
                </View>
              ) : null}
              <Txt v="tiny">
                Paying means you also agree to the{' '}
                <Link href="/legal/terms" onPress={onClose}><Txt v="tiny" color={C.ink} underline>Terms</Txt></Link> and{' '}
                <Link href="/legal/refunds" onPress={onClose}><Txt v="tiny" color={C.ink} underline>Refund Policy</Txt></Link>.
              </Txt>
            </ScrollView>

            <ErrorText error={error} />
            <Button title={`Pay ${rm(total)}`} icon="lock-closed" disabled={!agreed} loading={loading} onPress={onAgree} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  // Never taller than most of the screen, so the backdrop (tap to close) and Pay are always reachable.
  sheet: { maxHeight: '88%', backgroundColor: C.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingTop: S.xl },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: PageX, gap: S.lg },
  agree: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.sm },
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
