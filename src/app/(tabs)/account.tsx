import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Badge, Button, Card, Ionicons, Loading, Row, Screen, Txt, type IconName } from '@/components/ui';
import { C, R, S, shadow } from '@/constants/theme';
import { api, useAction, useMe } from '@/lib/api';

export default function Profile() {
  const { data: me, isLoading } = useMe();
  const signOut = useAction(() => api.signOut());

  if (isLoading) return <Loading />;

  return (
    <Screen>
      <Txt v="h1">Profile</Txt>

      {me ? (
        <View style={[styles.idCard, shadow]}>
          <Avatar name={me.full_name} size={72} />
          <Txt v="h2">{me.full_name.replace(/\(.*?\)/, '').trim() || 'You'}</Txt>
          <Row gap={S.lg}>
            <Stat value={String(me.trips_count)} label="Trips" />
            <View style={styles.vline} />
            <Stat value={me.rating_avg ? me.rating_avg.toFixed(1) : '–'} label="Rating" />
            <View style={styles.vline} />
            <Badge
              label={me.verification === 'verified' ? 'ID verified' : me.verification === 'pending' ? 'Under review' : 'Not verified'}
              tone={me.verification === 'verified' ? 'success' : 'warning'}
              icon="shield-checkmark"
            />
          </Row>
        </View>
      ) : (
        <View style={{ gap: S.md }}>
          <Txt v="small">Log in to book cars and see your trips.</Txt>
          <Button title="Log in" onPress={() => router.push('/sign-in')} />
        </View>
      )}

      {me && !me.is_owner ? (
        <Card onPress={() => router.push('/host/new-car')}>
          <Row gap={S.lg}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="h3">List your car on Kar</Txt>
              <Txt v="small">Free during the UTP pilot</Txt>
            </View>
            <Ionicons name="car-sport" size={40} color={C.brand} />
          </Row>
        </Card>
      ) : null}

      {api.mode === 'demo' ? <DemoSwitcher currentId={me?.id} /> : null}

      {me ? (
        <View>
          {me.verification !== 'verified' ? (
            <MenuRow
              icon="id-card-outline"
              label={me.verification === 'pending' ? 'ID under review' : 'Verify your ID'}
              sub="Needed before your first booking"
              onPress={() => router.push('/verify')}
            />
          ) : null}
          {me.is_admin ? <MenuRow icon="shield-outline" label="Kar admin" sub="ID checks and disputed claims" onPress={() => router.push('/admin')} /> : null}
          <MenuRow icon="log-out-outline" label="Log out" onPress={() => signOut.mutate(undefined)} />
        </View>
      ) : null}
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Txt v="h3">{value}</Txt>
      <Txt v="tiny">{label}</Txt>
    </View>
  );
}

function MenuRow({ icon, label, sub, onPress }: { icon: IconName; label: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={24} color={C.ink} />
      <View style={{ flex: 1 }}>
        <Txt v="body" color={C.ink}>{label}</Txt>
        {sub ? <Txt v="tiny">{sub}</Txt> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.ink} />
    </Pressable>
  );
}

// Demo mode only: jump between the seeded owner and customer to show both sides of the marketplace.
function DemoSwitcher({ currentId }: { currentId?: string }) {
  const { data: accounts } = useQuery({ queryKey: ['demo-accounts'], queryFn: () => api.demoAccounts!() });
  const switchTo = useAction((id: string) => api.demoSignInAs!(id));
  return (
    <Card style={{ backgroundColor: C.soft, borderColor: C.line }}>
      <Txt v="h3">Demo mode</Txt>
      <Txt v="small">Switch account</Txt>
      {accounts?.map((a) => (
        <Pressable key={a.id} onPress={() => switchTo.mutate(a.id)} style={styles.demoRow}>
          <Avatar name={a.full_name} size={32} />
          <Txt v="body" color={C.ink} style={{ flex: 1 }}>{a.full_name}</Txt>
          {a.id === currentId ? <Ionicons name="checkmark-circle" size={22} color={C.brand} /> : null}
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  idCard: { alignItems: 'center', gap: S.sm, padding: S.xl, borderRadius: R.xl, backgroundColor: C.bg },
  vline: { width: 1, height: 28, backgroundColor: C.line },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: S.lg, paddingVertical: S.lg, borderBottomWidth: 1, borderBottomColor: C.line },
  demoRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: 6 },
});
