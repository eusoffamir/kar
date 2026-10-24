import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { Button, ErrorText, Ionicons, Row, Txt } from '@/components/ui';
import { C, S } from '@/constants/theme';
import { api, useAction } from '@/lib/api';

/** Stars for the other side of a returned trip (renter rates owner, owner rates renter). Once rated, shows it. */
export function RateOther({ bookingId, toId, name }: { bookingId: string; toId: string; name: string }) {
  const { data: given, isLoading } = useQuery({ queryKey: ['my-rating', bookingId], queryFn: () => api.myRating(bookingId) });
  const [rating, setRating] = useState(0);
  const review = useAction(() => api.review(bookingId, toId, rating, ''));
  if (isLoading) return null;
  const done = given ?? (review.isSuccess ? rating : null);
  if (done) {
    return (
      <Row gap={S.sm} style={{ justifyContent: 'center' }}>
        <Txt v="small">You rated {name}</Txt>
        <Row gap={2}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Ionicons key={n} name={n <= done ? 'star' : 'star-outline'} size={14} color={C.warning} />
          ))}
        </Row>
      </Row>
    );
  }
  return (
    <>
      <Txt v="label" style={{ marginTop: S.sm, textAlign: 'center' }}>Rate {name}</Txt>
      <Row gap={S.sm} style={{ justifyContent: 'center' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setRating(n)} hitSlop={6} accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}>
            <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={30} color={C.warning} />
          </Pressable>
        ))}
      </Row>
      <Button title="Submit rating" variant="outline" disabled={!rating} onPress={() => review.mutate(undefined)} loading={review.isPending} />
      <ErrorText error={review.error} />
    </>
  );
}
