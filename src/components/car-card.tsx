import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { CarThumb, Ionicons, PhotoBadge, PhotoGallery, Row, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { carName, fmtRangeShort } from '@/lib/format';
import { quote, rm } from '@/lib/pricing';
import type { TripWindow } from '@/lib/stores';
import type { CarWithOwner } from '@/lib/types';

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
      <PhotoGallery photos={car.photos} height={170} radius={R.lg}>
        <View style={styles.topLeft}>
          {isTopRated(car) ? <PhotoBadge label="Top rated" /> : car.instant_book ? <PhotoBadge label="⚡ Instant book" /> : null}
        </View>
      </PhotoGallery>
      {/* Title, then grey detail lines, then price: one weight per line, even spacing, no icons breaking the left edge. */}
      <View style={{ gap: 5 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="h3" numberOfLines={1} style={{ flex: 1 }}>
            {carName(car)} {car.year}
          </Txt>
          <Rating car={car} />
        </Row>
        {/* One line: where it is, then only the details that differ between cars (most have 5 seats and meet the owner).
            A long location shortens itself; the details always show. */}
        <Row gap={S.xs}>
          {where ? (
            <Txt v="small" numberOfLines={1} style={{ flexShrink: 1, marginRight: 2 }}>
              {where.charAt(0).toUpperCase() + where.slice(1)}
            </Txt>
          ) : null}
          {[
            car.transmission === 'auto' ? 'Auto' : 'Manual',
            ...(car.seats !== 5 ? [`${car.seats} seats`] : []),
            ...(car.handover === 'keybox' ? ['Keyless'] : []),
          ].map((d) => (
            <View key={d} style={styles.pill}>
              <Txt v="tiny" color={C.text}>{d}</Txt>
            </View>
          ))}
        </Row>
        <Txt v="small">
          {q ? (
            <>
              <Txt v="h3" underline>{rm(q.trip)} total</Txt>
              {'\n'}{fmtRangeShort(window!.start, window!.end)}
            </>
          ) : (
            <>
              {/* Same 13px as the location line; bold and dark so the amounts still stand out. */}
              <Txt v="small" color={C.ink} style={styles.amount}>{rm(car.price_per_hour)}</Txt> /hour ·{' '}
              <Txt v="small" color={C.ink} style={styles.amount}>{rm(car.price_per_day)}</Txt> /day
            </>
          )}
        </Txt>
      </View>
    </Pressable>
  );
}

function Rating({ car }: { car: CarWithOwner }) {
  return (
    <Row gap={3}>
      <Ionicons name="star" size={12} color={C.ink} />
      <Txt v="small" color={C.ink}>
        {car.owner.rating_avg ? `${car.owner.rating_avg.toFixed(2)} (${car.owner.rating_count})` : 'New'}
      </Txt>
    </Row>
  );
}

const styles = StyleSheet.create({
  topLeft: { position: 'absolute', top: 12, left: 12 },
  amount: { fontWeight: '700' },
  pill: { backgroundColor: C.soft, borderWidth: 1, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: S.sm, paddingVertical: 1 },
  compact: { flexDirection: 'row', gap: S.md, backgroundColor: C.bg, borderRadius: R.lg, padding: S.sm },
});
