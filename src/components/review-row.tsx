import { View } from 'react-native';

import { Ionicons, Row, Txt } from '@/components/ui';
import { C, S } from '@/constants/theme';
import type { OwnerReview } from '@/lib/types';

/** One review: stars, the comment, then who and when (first name only). Owner page and Profile. */
export function ReviewRow({ r }: { r: OwnerReview }) {
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
