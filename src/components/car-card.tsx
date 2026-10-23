import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { CarThumb, Ionicons, PhotoBadge, PhotoGallery, Row, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { carName, fmtRangeShort } from '@/lib/format';
import { quote, rm } from '@/lib/pricing';
import type { TripWindow } from '@/lib/stores';
import { isInsured, type CarWithOwner } from '@/lib/types';

const isTopRated = (c: CarWithOwner) => (c.owner.rating_avg ?? 0) >= 4.8 && c.owner.rating_count >= 10;

/** Airbnb-style listing card: big swipeable photo, then title / rating / price lines. */
export function CarCard({ car, window, compact }: { car: CarWithOwner; window: TripWindow; compact?: boolean }) {
  const q = window ? quote(car, window.start, window.end) : null;
  const where = car.last_location?.note || car.pickup_note;

  if (compact) {
    return (
      <Pressable onPress={() => router.push(`/car/${car.id}`)} style={styles.compact}>
        <View style={{ width: 110 }}>
          <CarThumb car={car} height={100} radius={R.md} />
        </View>
        <View style={{ flex: 1, gap: 2, paddingVertical: 4 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="h3" numberOfLines={1} style={{ flex: 1 }}>{carName(car)}</Txt>
            <Rating car={car} />
          </Row>
          <Txt v="small" numberOfLines={1}>{where}</Txt>
          <Txt v="body" style={{ marginTop: 'auto' }}>
            <Txt v="h3">{q ? rm(q.trip) : rm(car.price_per_hour)}</Txt> {q ? 'total' : '/ hour'}
          </Txt>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={() => router.push(`/car/${car.id}`)} style={{ gap: S.sm }}>
      <PhotoGallery photos={car.photos} height={190} radius={R.lg}>
        <View style={styles.topLeft}>
          {isTopRated(car) ? <PhotoBadge label="Top rated" /> : car.instant_book ? <PhotoBadge label="⚡ Instant book" /> : null}
        </View>
      </PhotoGallery>
      <View style={{ gap: 1 }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
          <Txt v="h3" numberOfLines={1} style={{ flex: 1 }}>
            {carName(car)} {car.year}
          </Txt>
          <Rating car={car} />
        </Row>
        <Txt v="small" numberOfLines={1}>
          {[
            car.transmission === 'auto' ? 'Automatic' : 'Manual',
            `${car.seats} seats`,
            car.handover === 'keybox' ? 'keyless pickup' : 'meet the owner',
            ...(isInsured(car.owner) ? ['insured'] : []),
          ].join(', ')}
        </Txt>
        <Row gap={4}>
          <Ionicons name="location-outline" size={13} color={C.muted} />
          <Txt v="small" numberOfLines={1} style={{ flex: 1 }}>{where}</Txt>
        </Row>
        <Txt v="body" style={{ marginTop: 4 }}>
          {q ? (
            <>
              <Txt v="h3" underline>{rm(q.trip)} total</Txt>
              <Txt v="small">{'\n'}{fmtRangeShort(window!.start, window!.end)}</Txt>
            </>
          ) : (
            <>
              {/* Two en spaces: a clear gap between the prices without a separator dot. */}
              <Txt v="h3">{rm(car.price_per_hour)}</Txt> / hour{'  '}<Txt v="h3">{rm(car.price_per_day)}</Txt> / day
            </>
          )}
        </Txt>
      </View>
    </Pressable>
  );
}

function Rating({ car }: { car: CarWithOwner }) {
  if (!car.owner.rating_avg) return <Txt v="small" color={C.ink}>New</Txt>;
  return (
    <Row gap={3}>
      <Ionicons name="star" size={12} color={C.ink} />
      <Txt v="small" color={C.ink}>
        {car.owner.rating_avg.toFixed(2)} ({car.owner.rating_count})
      </Txt>
    </Row>
  );
}

const styles = StyleSheet.create({
  topLeft: { position: 'absolute', top: 12, left: 12 },
  compact: { flexDirection: 'row', gap: S.md, backgroundColor: C.bg, borderRadius: R.lg, padding: S.sm },
});
