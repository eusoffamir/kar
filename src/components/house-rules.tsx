import { Link } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorText, Ionicons, Row, Txt } from '@/components/ui';
import { C, MaxContentWidth, R, S, PageX } from '@/constants/theme';
import { fmtDate, fmtLength, fmtTime } from '@/lib/format';
import { FEES, rm, rmDeposit } from '@/lib/pricing';

/**
 * Last step before payment, kept short so Pay is always on screen (even on a small phone): the trip (pick up →
 * return), the price, a "House rules" row that opens the rules page (agree there), Pay.
 */
export function HouseRulesSheet({
  visible,
  carName,
  start,
  end,
  hours,
  trip,
  fee,
  total,
  deposit,
  agreed,
  loading,
  error,
  onClose,
  onReadRules,
  onUnagree,
  onAgree,
}: {
  visible: boolean;
  carName: string;
  start: Date | null;
  end: Date | null;
  hours: number;
  /** Rental price and Kar's fee, for the breakdown under the total. */
  trip: number;
  fee: number;
  total: number;
  deposit: number;
  /** Agreed on the House rules page (Pay stays off until then). */
  agreed: boolean;
  loading: boolean;
  error: unknown;
  onClose: () => void;
  /** Opens the House rules page. */
  onReadRules: () => void;
  /** Untick the box. */
  onUnagree: () => void;
  onAgree: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + S.xl, 48) }]}>
          <View style={[styles.inner, { flexShrink: 1 }]}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="h2">Confirm and pay</Txt>
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={C.ink} />
              </Pressable>
            </Row>

            {/* The only part that can grow: it scrolls, so Pay below never leaves the screen. */}
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: S.xxl, paddingTop: S.xs, paddingBottom: S.lg }}>
              {/* The trip: car, then pick up → return with the length in the middle. */}
              <View style={styles.trip}>
                <View style={styles.carPill}>
                  <Ionicons name="car-outline" size={15} color={C.ink} />
                  <Text style={styles.car}>{carName}</Text>
                </View>
                {start && end ? (
                  <Row gap={S.sm}>
                    <Moment label="Pick up" at={start} />
                    <View style={{ alignItems: 'center', gap: 2 }}>
                      <Ionicons name="arrow-forward" size={16} color={C.muted} />
                      <Text style={styles.length}>{fmtLength(hours)}</Text>
                    </View>
                    <Moment label="Return" at={end} />
                  </Row>
                ) : null}
              </View>

              {/* Same receipt as the car page's "Price details": rows, a line, then the total in bold. */}
              <View style={{ gap: S.md }}>
                <PriceRow label={fmtLength(hours)} value={rm(trip)} />
                <PriceRow label={`Kar service fee (${fee > FEES.minCustomerFee ? `${Math.round(FEES.customerFeeRate * 100)}%` : 'minimum'})`} value={rm(fee)} />
                {deposit > 0 ? <PriceRow label="Deposit (refundable)" value={rmDeposit(deposit)} /> : null}
                <View style={{ height: 1, backgroundColor: C.line }} />
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={styles.totalBold}>Total</Text>
                  <Text style={styles.totalBold}>{rm(total)}</Text>
                </Row>
              </View>

              {/* "I agree" box: tapping it opens the House rules page; agreeing there brings the renter back with it
                  ticked. Tapping a ticked box unticks it. */}
              <Pressable
                onPress={agreed ? onUnagree : onReadRules}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreed }}
                style={[styles.rules, agreed && { borderColor: C.brand }]}>
                <Row gap={S.md}>
                  <View style={[styles.box, agreed && { backgroundColor: C.brand, borderColor: C.brand }]}>
                    {agreed ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                  </View>
                  <Text style={[styles.agreeText, { flex: 1 }]}>I agree to the house rules</Text>
                  <Pressable onPress={onReadRules} hitSlop={8} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Txt v="small" color={C.ink} style={{ fontWeight: '600' }}>Read</Txt>
                    <Ionicons name="chevron-forward" size={16} color={C.ink} />
                  </Pressable>
                </Row>
              </Pressable>

              <Txt v="tiny" style={{ textAlign: 'center' }}>
                By paying you agree to the{' '}
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

function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text style={styles.priceLabel}>{label}</Text>
      <Text style={styles.priceValue}>{value}</Text>
    </Row>
  );
}

function Moment({ label, at }: { label: string; at: Date }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Txt v="tiny" style={{ fontWeight: '700', letterSpacing: 0.6 }}>{label.toUpperCase()}</Txt>
      <Txt v="small" color={C.ink}>{fmtDate(at)}</Txt>
      <Text style={styles.time}>{fmtTime(at)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  // Never taller than most of the screen, so the backdrop (tap to close) and Pay are always reachable.
  sheet: { maxHeight: '88%', backgroundColor: C.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingTop: S.xl },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: PageX + S.xs, gap: S.lg },
  trip: { backgroundColor: C.soft, borderRadius: R.lg, paddingTop: S.lg, paddingBottom: S.xl, paddingHorizontal: S.xl, gap: S.xl },
  // The car's name in its own white pill at the top of the grey trip card.
  carPill: { alignSelf: 'center', width: '85%', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.bg, borderRadius: R.pill, paddingHorizontal: S.xl, paddingVertical: S.sm, justifyContent: 'center' },
  car: { fontSize: 15, fontWeight: '700', color: C.ink },
  time: { fontSize: 16, fontWeight: '700', color: C.ink },
  length: { fontSize: 11, fontWeight: '600', color: C.muted },
  priceLabel: { fontSize: 15, color: C.text },
  priceValue: { fontSize: 15, color: C.ink },
  totalBold: { fontSize: 17, fontWeight: '700', color: C.ink },
  rules: { borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.lg, paddingVertical: S.xl, paddingHorizontal: S.lg },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agreeText: { fontSize: 15, fontWeight: '600', color: C.ink, flexShrink: 1 },
});
