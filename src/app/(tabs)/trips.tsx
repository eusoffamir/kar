import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, CarThumb, Empty, ErrorText, Grid, Loading, Row, Screen, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api, keys, useMe } from '@/lib/api';
import { STATUS, carName, fmtRange, personName } from '@/lib/format';
import { rm } from '@/lib/pricing';
import type { BookingDetail } from '@/lib/types';

const UPCOMING = ['pending_payment', 'requested', 'confirmed', 'active'];

export default function Trips() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data: trips, isLoading, error } = useQuery({ queryKey: keys.trips, queryFn: () => api.myTrips(), enabled: !!me });

  if (meLoading) return <Loading />;
  if (!me) {
    return (
      <Screen>
        <Empty
          title="Log in to see your trips"
          body="Your bookings and pickup details live here."
          action={<Button title="Log in" onPress={() => router.push('/sign-in')} style={{ minWidth: 110 }} />}
        />
      </Screen>
    );
  }

  const upcoming = (trips ?? []).filter((t) => UPCOMING.includes(t.status));
  const past = (trips ?? []).filter((t) => !UPCOMING.includes(t.status));

  return (
    <Screen wide>
      <ErrorText error={error} />
      {isLoading ? <Loading /> : null}
      {!isLoading && !trips?.length ? (
        <Empty
          title="No trips booked… yet!"
          body="Time to dust off your licence and start planning your next drive."
          action={<Button title="Start searching" variant="dark" onPress={() => router.navigate('/')} />}
        />
      ) : null}

      <Grid min={320}>{upcoming.map((t) => <UpcomingCard key={t.id} t={t} />)}</Grid>

      {past.length ? <Txt v="h2" style={{ marginTop: S.lg }}>Where you&apos;ve been</Txt> : null}
      <Grid min={320} gap={S.lg}>{past.map((t) => <PastRow key={t.id} t={t} />)}</Grid>
    </Screen>
  );
}

function UpcomingCard({ t }: { t: BookingDetail }) {
  const st = STATUS[t.status];
  return (
    <Pressable onPress={() => router.push(`/trip/${t.id}`)} style={styles.upcoming}>
      <CarThumb car={t.car} height={180} radius={0} />
      <View style={{ padding: S.lg, gap: 4 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="h3" numberOfLines={1} style={{ flex: 1 }}>{carName(t.car)}</Txt>
          <Badge label={st.label} tone={st.tone} />
        </Row>
        <Txt v="small">{fmtRange(t.starts_at, t.ends_at)}</Txt>
        <Txt v="small">Owned by {personName(t.owner)}, {rm(t.total_charged)} paid</Txt>
      </View>
    </Pressable>
  );
}

function PastRow({ t }: { t: BookingDetail }) {
  const st = STATUS[t.status];
  return (
    <Pressable onPress={() => router.push(`/trip/${t.id}`)} style={styles.past}>
      <View style={{ width: 64 }}>
        <CarThumb car={t.car} height={64} radius={R.sm} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="h3">{carName(t.car)}</Txt>
        <Txt v="small">{fmtRange(t.starts_at, t.ends_at)}</Txt>
        <Txt v="tiny">{st.label}</Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  upcoming: { borderRadius: R.lg, overflow: 'hidden', borderWidth: 1, borderColor: C.line, backgroundColor: C.bg },
  past: { flexDirection: 'row', alignItems: 'center', gap: S.lg },
});
