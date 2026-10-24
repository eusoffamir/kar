import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Ionicons, Row, Txt, type IconName } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { usePushNotifications } from '@/lib/push';

const OWNER_REASONS: [IconName, string][] = [
  ['calendar-outline', 'A car is booked, or a request needs your reply within 2 hours'],
  ['radio-outline', 'A car on a trip loses signal, leaves the area or is late'],
  ['flag-outline', 'A car is returned, so you can check it and report damage in time'],
];
const RENTER_REASONS: [IconName, string][] = [
  ['checkmark-circle-outline', 'Your booking is confirmed, or your ID is approved'],
  ['time-outline', "It's almost time to return the car"],
  ['wallet-outline', 'Your refund is on its way'],
];

/**
 * Kar's own explanation before the phone's "Allow notifications?" popup: people allow far more often when they
 * know why. Shown once after sign-in (again after 7 days if they tap "Not now").
 */
export function NotificationPrompt() {
  const { askNow, isOwner, accept, later } = usePushNotifications();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={askNow} transparent animationType="slide" onRequestClose={later}>
      <Pressable style={styles.backdrop} onPress={later} accessibilityLabel="Not now" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, S.lg) + S.md }]}>
        <View style={styles.icon}>
          <Ionicons name="notifications" size={28} color={C.brand} />
        </View>
        <Txt v="h2">Turn on notifications</Txt>
        <Txt v="small">Kar only notifies you when something needs you:</Txt>
        <View style={{ gap: S.md }}>
          {(isOwner ? OWNER_REASONS : RENTER_REASONS).map(([icon, text]) => (
            <Row key={text} gap={S.md} style={{ alignItems: 'flex-start' }}>
              <Ionicons name={icon} size={20} color={C.ink} style={{ marginTop: 1 }} />
              <Txt style={{ flex: 1 }}>{text}</Txt>
            </Row>
          ))}
        </View>
        <Button title="Turn on" icon="notifications-outline" onPress={() => accept()} />
        <Button title="Not now" variant="ghost" onPress={later} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    padding: S.xl,
    gap: S.lg,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
});
