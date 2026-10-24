import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, CarThumb, Empty, ErrorText, Grid, Ionicons, Loading, Row, Screen, Txt } from '@/components/ui';
import { C, cardShadow, R, S } from '@/constants/theme';
import { api, keys, useMe } from '@/lib/api';
import { STATUS, carName, fmtRange, missedLabel, personName } from '@/lib/format';
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

  // Trips that ended without starting go to the past list (an overdue "On trip" stays up top).
  const isUpcoming = (t: BookingDetail) => UPCOMING.includes(t.status) && !missedLabel(t);
  const upcoming = (trips ?? []).filter(isUpcoming);
  const past = (trips ?? []).filter((t) => !isUpcoming(t));

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

      <Grid min={260}>{upcoming.map((t) => <UpcomingCard key={t.id} t={t} />)}</Grid>

      {past.length ? <Txt v="h2" style={{ marginTop: S.lg }}>Where you&apos;ve been</Txt> : null}
      <Grid min={320} gap={S.lg}>{past.map((t) => <PastRow key={t.id} t={t} />)}</Grid>
    </Screen>
  );
}

// Explore card text and photo, in a white box with a soft shadow (like the bottom nav) so each trip stands apart.
function UpcomingCard({ t }: { t: BookingDetail }) {
  const st = STATUS[t.status];
  return (
    <Pressable onPress={() => router.push(`/trip/${t.id}`)} style={styles.upcoming}>
      <View style={styles.clip}>
        <CarThumb car={t.car} height={170} radius={0} />
        <View style={{ gap: S.sm, padding: S.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="h3" numberOfLines={1} style={{ flex: 1 }}>
              {carName(t.car)} {t.car.year}
            </Txt>
            <Badge label={st.label} tone={st.tone} />
          </Row>
          {/* Start and end in one pill, so the dates read as a single block. */}
          <View style={styles.datePill}>
            <Ionicons name="calendar-outline" size={13} color={C.ink} />
            <Txt v="small" color={C.ink}>{fmtRange(t.starts_at, t.ends_at)}</Txt>
          </View>
          <Txt v="small" numberOfLines={1}>
            {personName(t.owner)} ·{' '}
            <Txt v="small" color={C.ink} style={{ fontWeight: '700' }}>{rm(t.total_charged)}</Txt> paid
          </Txt>
        </View>
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
        <Txt v="tiny">{missedLabel(t) ?? st.label}</Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: C.soft,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.pill,
    paddingHorizontal: S.sm + 2,
    paddingVertical: 3,
  },
  upcoming: { borderRadius: R.lg, backgroundColor: C.card, ...cardShadow },
  // Rounded clipping inside the shadowed box, so the photo fills the top corners (clipping would hide the shadow on iPhone).
  clip: { borderRadius: R.lg, overflow: 'hidden' },
  past: { flexDirection: 'row', alignItems: 'center', gap: S.lg },
});
