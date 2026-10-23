import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { CarCard } from '@/components/car-card';
import { Avatar, Empty, ErrorText, Grid, Ionicons, Loading, Row, Screen, Section, Txt } from '@/components/ui';
import { C, S } from '@/constants/theme';
import { api, keys } from '@/lib/api';
import { personName } from '@/lib/format';
import { useTripWindow } from '@/lib/stores';
import { isInsured, type OwnerReview } from '@/lib/types';

/** Who you'd rent from: rating, insured badge, their cars on Kar and what past renters said. */
export default function OwnerPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const window = useTripWindow();
  const { data, isLoading, error } = useQuery({ queryKey: keys.owner(id), queryFn: () => api.ownerProfile(id) });

  if (isLoading) return <Loading />;
  if (!data) {
    return (
      <Screen edges={['bottom']}>
        <ErrorText error={error} />
      </Screen>
    );
  }
  const { owner, cars, reviews } = data;
  const name = personName(owner);
  const first = name.split(' ')[0];

  // The top bar already keeps clear of the clock, so only the bottom edge here (like the other pages with a top bar).
  return (
    <Screen edges={['bottom']}>
      {/* Owner's name in the top bar, beside the back arrow. */}
      <Stack.Screen options={{ title: name }} />
      {/* Not a Section: its extra top padding left a big gap under the back arrow. */}
      <View style={{ paddingBottom: S.lg, borderBottomWidth: 1, borderBottomColor: C.lineStrong }}>
        <Row gap={S.lg}>
          <Avatar name={name} size={64} />
          <View style={{ flex: 1, gap: S.xs }}>
            {owner.rating_avg ? (
              <Row gap={4}>
                <Ionicons name="star" size={13} color={C.ink} />
                <Txt v="small" color={C.ink}>
                  {owner.rating_avg.toFixed(1)} · {owner.rating_count} {owner.rating_count === 1 ? 'review' : 'reviews'}
                </Txt>
              </Row>
            ) : null}
            {isInsured(owner) ? (
              <Row gap={4}>
                <Ionicons name="shield-checkmark" size={14} color={C.success} />
                <Txt v="small" color={C.success} style={{ fontWeight: '600' }}>Insured</Txt>
              </Row>
            ) : null}
          </View>
        </Row>
      </View>

      <Section title={`${first}'s cars`}>
        <Grid>
          {cars.map((c) => (
            <CarCard key={c.id} car={c} window={window} />
          ))}
        </Grid>
      </Section>

      <Section title="Reviews" last>
        {reviews.length ? (
          <View style={{ gap: S.xl }}>
            {reviews.map((r, i) => (
              <ReviewRow key={`${r.created_at}-${i}`} r={r} />
            ))}
          </View>
        ) : (
          <Empty title="No reviews yet" body={`Reviews from renters will show here after their trips with ${first}.`} />
        )}
      </Section>
    </Screen>
  );
}

function ReviewRow({ r }: { r: OwnerReview }) {
  const when = new Date(r.created_at).toLocaleDateString('en-MY', { month: 'short', year: 'numeric' });
  return (
    <View style={{ gap: S.xs }}>
      <Row gap={2}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Ionicons key={n} name={n <= r.rating ? 'star' : 'star-outline'} size={13} color={C.ink} />
        ))}
      </Row>
      {r.comment ? <Txt>{r.comment}</Txt> : null}
      <Txt v="small">
        {r.reviewer} · {when}
      </Txt>
    </View>
  );
}
