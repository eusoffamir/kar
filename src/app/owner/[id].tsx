import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { CarCard } from '@/components/car-card';
import { ReviewRow } from '@/components/review-row';
import { Avatar, Button, Empty, ErrorText, Grid, Ionicons, Line, Loading, Row, Screen, Section, Txt } from '@/components/ui';
import { C, S } from '@/constants/theme';
import { api, keys, useMe } from '@/lib/api';
import { personName } from '@/lib/format';
import { useTripWindow } from '@/lib/stores';
import { isInsured } from '@/lib/types';

// Back to the car, or to Explore when the page was opened directly from a link.
const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Who you'd rent from: rating, insured badge, their cars on Kar and what past renters said. */
export default function OwnerPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const window = useTripWindow();
  const { data: me } = useMe();
  // Your own page (from Profile) also works before you have a car on Kar: just your name, no cars or reviews yet.
  const { data, isLoading, error } = useQuery({
    queryKey: [...keys.owner(id), me?.id === id],
    queryFn: async () => {
      try {
        return await api.ownerProfile(id);
      } catch (e) {
        if (me && me.id === id) return { owner: me, cars: [], reviews: [] };
        throw e;
      }
    },
  });

  if (isLoading) return <Loading />;
  if (!data) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Pressable onPress={leave} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={{ alignSelf: 'flex-start' }}>
          <Ionicons name="arrow-back" size={22} color={C.ink} />
        </Pressable>
        <ErrorText error={error} />
      </Screen>
    );
  }
  const { owner, cars, reviews } = data;
  const name = personName(owner);
  const first = name.split(' ')[0];
  const isMe = me?.id === id;
  // You, before listing a car: a renter's page (no cars or reviews sections).
  const renter = isMe && !owner.is_owner;

  // Own top row (top bar hidden in _layout): back arrow, then the owner's avatar, name and badges beside it.
  // iPhone's top bar would centre a custom title, so this keeps it the same on every phone and the web.
  return (
    <Screen edges={['top', 'bottom']}>
      <Row gap={S.md} style={{ paddingBottom: S.lg, borderBottomWidth: 1, borderBottomColor: C.lineStrong }}>
        <Pressable onPress={leave} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={{ padding: S.xs, marginLeft: -S.xs }}>
          <Ionicons name="arrow-back" size={22} color={C.ink} />
        </Pressable>
        <Avatar name={name} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h3" numberOfLines={1}>{name}</Txt>
          <Row gap={S.md}>
            {owner.rating_avg ? (
              <Row gap={4}>
                <Ionicons name="star" size={13} color={C.ink} />
                <Txt v="small" color={C.ink}>
                  {owner.rating_avg.toFixed(1)} ({owner.rating_count})
                </Txt>
              </Row>
            ) : null}
            {renter ? (
              <Row gap={4}>
                <Ionicons name="shield-checkmark" size={14} color={owner.verification === 'verified' ? C.success : C.warning} />
                <Txt v="small" color={owner.verification === 'verified' ? C.success : C.warning} style={{ fontWeight: '600' }}>
                  {owner.verification === 'verified' ? 'ID verified' : owner.verification === 'pending' ? 'ID under review' : 'ID not verified'}
                </Txt>
              </Row>
            ) : null}
            {isInsured(owner) ? (
              <Row gap={4}>
                <Ionicons name="shield-checkmark" size={14} color={C.success} />
                <Txt v="small" color={C.success} style={{ fontWeight: '600' }}>Insured</Txt>
              </Row>
            ) : null}
          </Row>
        </View>
      </Row>

      {renter ? (
        <Section title="About you" last>
          <View style={{ gap: S.md }}>
            <Line label="Trips" value={String(owner.trips_count)} />
            <Line
              label="ID"
              value={owner.verification === 'verified' ? 'Verified' : owner.verification === 'pending' ? 'Under review' : 'Not verified'}
            />
          </View>
          {owner.verification === 'unverified' || owner.verification === 'rejected' ? (
            <Button title="Verify your ID" variant="outline" size="md" onPress={() => router.push('/verify')} style={{ marginTop: S.md }} />
          ) : null}
          <Txt v="small" style={{ marginTop: S.md }}>Only you can see this page. When you book, the owner sees your name, whether your ID is verified, and your selfie so they know who collects the car.</Txt>
        </Section>
      ) : (
        <>
          {/* Heading sits in the middle: 16px from the line above (the page's gap) and 16px to the first photo. */}
          <View style={{ gap: S.lg, paddingBottom: S.lg, borderBottomWidth: 1, borderBottomColor: C.lineStrong }}>
            <Txt v="label">{isMe ? 'Your cars' : `${first}'s cars`}</Txt>
            {cars.length ? (
              <Grid>
                {cars.map((c) => (
                  <CarCard key={c.id} car={c} window={window} />
                ))}
              </Grid>
            ) : (
              <Txt v="small">No cars on Kar yet.</Txt>
            )}
          </View>

          <Section title="Reviews" last>
            {reviews.length ? (
              <View style={{ gap: S.xl }}>
                {reviews.map((r, i) => (
                  <ReviewRow key={`${r.created_at}-${i}`} r={r} />
                ))}
              </View>
            ) : (
              <Empty title="No reviews yet" body={isMe ? 'Reviews from renters will show here after their trips with you.' : `Reviews from renters will show here after their trips with ${first}.`} />
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}
