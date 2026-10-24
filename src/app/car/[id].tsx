import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CarMap } from '@/components/car-map';
import { HouseRulesSheet } from '@/components/house-rules';
import {
  Avatar,
  Button,
  Divider,
  ErrorText,
  IconButton,
  type IconName,
  Ionicons,
  Line,
  Loading,
  PhotoGallery,
  Row,
  Section,
  Txt,
} from '@/components/ui';
import { C, MaxContentWidth, R, S, shadow, PageX } from '@/constants/theme';
import { api, keys, useAction, useMe } from '@/lib/api';
import { canBook } from '@/lib/policy';
import { overlaps } from '@/lib/backend';
import { carName, fmtDuration, fmtLength, fmtRangeShort, personName } from '@/lib/format';
import { quote, rm } from '@/lib/pricing';
import { isInsured } from '@/lib/types';
import { useTripWindow } from '@/lib/stores';
import { useLayout } from '@/lib/use-layout';

export default function CarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: car, isLoading, error } = useQuery({ queryKey: keys.car(id), queryFn: () => api.getCar(id) });
  const { data: me } = useMe();
  const window = useTripWindow();
  const insets = useSafeAreaInsets();
  const [rulesOpen, setRulesOpen] = useState(false);
  // Laptop: details on the left, a booking card on the right that stays in view (no bottom bar).
  const { split } = useLayout();
  // Reserve sent the user to sign in or upload their ID: once they're back and done, continue the booking.
  const [resume, setResume] = useState<'sign-in' | 'verify' | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (resume === 'sign-in' && me) {
        if (canBook(me.verification)) {
          setResume(null);
          setRulesOpen(true);
        } else {
          setResume('verify');
          router.push('/verify');
        }
      } else if (resume === 'verify' && canBook(me?.verification)) {
        setResume(null);
        setRulesOpen(true);
      }
    }, [resume, me]),
  );

  const book = useAction(async ({ start, end }: { start: Date; end: Date }) => {
    const booking = await api.createBooking(id, start, end, true);
    const { url } = await api.startPayment(booking.id);
    if (url) {
      if (Platform.OS === 'web') window_assign(url);
      else await WebBrowser.openBrowserAsync(url);
    }
    return booking;
  });

  if (isLoading) return <Loading />;
  if (!car) {
    return (
      <SafeAreaView style={{ flex: 1, padding: S.xl }}>
        <ErrorText error={error ?? 'Car not found'} />
      </SafeAreaView>
    );
  }

  const q = window ? quote(car, window.start, window.end) : null;
  const tooShort = q ? q.hours < car.min_hours : false;
  const clash = window ? car.busy.some((b) => overlaps(b, window.start, window.end)) : false;
  const isOwnCar = me?.id === car.owner_id;
  const spot = car.last_location ?? { lat: car.pickup_lat, lng: car.pickup_lng, note: car.pickup_note, updated_at: '' };
  const owner = car.owner;

  const blocked = !!window && (clash || tooShort);
  const openPicker = () => router.push({ pathname: '/search', params: { carId: id } });

  const reserve = async () => {
    if (!window) return router.push({ pathname: '/search', params: { carId: id } });
    if (!me) {
      setResume('sign-in');
      return router.push('/sign-in');
    }
    if (!canBook(me.verification)) {
      setResume('verify');
      return router.push('/verify');
    }
    setRulesOpen(true);
  };

  const payAfterRules = async () => {
    if (!window) return;
    const b = await book.mutateAsync({ start: window.start, end: window.end });
    setRulesOpen(false);
    router.replace(`/trip/${b.id}`);
  };

  // Dead simple: name, price, three facts, owner in one line, where to pick it up. Everything else is one tap away.
  const facts: [IconName, string][] = [
    ['cog-outline', car.transmission === 'auto' ? 'Automatic' : 'Manual'],
    ['people-outline', `${car.seats} seats`],
    ['key-outline', 'Keys from the owner'],
  ];
  const details = (
    <>
      <Section>
        <View style={{ gap: S.md }}>
          <Txt v="h1">{carName(car)} {car.year}</Txt>
          {/* Same price style as the Explore card: bold amounts, grey units. */}
          <Txt v="small">
            <Txt v="h3">{rm(car.price_per_hour)}</Txt> /hour · <Txt v="h3">{rm(car.price_per_day)}</Txt> /day
          </Txt>
        </View>
        {/* Soft grey pills, like the details on the Explore card. */}
        <Row gap={S.sm} style={{ flexWrap: 'wrap' }}>
          {facts.map(([icon, label]) => (
            <View key={label} style={styles.fact}>
              <Ionicons name={icon} size={14} color={C.text} />
              <Txt v="small" color={C.text}>{label}</Txt>
            </View>
          ))}
        </Row>
        {/* Tap the owner to see their other cars and renters' reviews. */}
        <Pressable
          onPress={() => router.push({ pathname: '/owner/[id]', params: { id: owner.id } })}
          accessibilityRole="button"
          accessibilityLabel={`See ${personName(owner)}'s profile`}
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: S.md, marginTop: S.sm }, pressed && { opacity: 0.6 }]}>
          <Avatar name={personName(owner)} uri={owner.avatar_url} size={36} />
          <Row gap={S.md} style={{ flex: 1 }}>
            <Txt v="body" color={C.ink} numberOfLines={1} style={{ flexShrink: 1 }}>{personName(owner)}</Txt>
            {owner.rating_avg ? <Txt v="small">★ {owner.rating_avg.toFixed(1)} ({owner.rating_count})</Txt> : null}
          </Row>
          {isInsured(owner) ? (
            <View style={styles.insured}>
              <Ionicons name="shield-checkmark" size={14} color={C.success} />
              <Txt v="small" color={C.success} style={{ fontWeight: '600' }}>Insured</Txt>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </Pressable>
        {car.description ? <Txt>{car.description}</Txt> : null}
      </Section>

      <Section title="Pickup">
        <CarMap
          center={{ lat: spot.lat, lng: spot.lng }}
          zoom={17}
          height={200}
          pins={[{ id: 'spot', lat: spot.lat, lng: spot.lng, label: car.last_location ? 'Parked here' : 'Pickup', kind: car.last_location ? 'parked' : 'pickup' }]}
        />
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="h3" style={{ flex: 1 }} numberOfLines={1}>{spot.note || 'UTP, Seri Iskandar'}</Txt>
          <DirectionsLink lat={spot.lat} lng={spot.lng} />
        </Row>
      </Section>

      {/* Extra space between the line above and the "Good to know" heading. */}
      <View style={{ paddingTop: S.md }}>
        <Section last title="Good to know">
          <GoodToKnow lateFee={car.late_fee_per_hour} minHours={car.min_hours} />
        </Section>
      </View>
      <ErrorText error={book.error} />
    </>
  );

  const reserveTitle = !window ? 'Check dates' : blocked ? 'Change dates' : car.instant_book ? 'Reserve' : 'Request';

  // Laptop booking card: the same choices as the phone's bottom bar, plus the price breakdown.
  const bookingPanel = (
    <View style={[styles.panel, shadow]}>
      <Txt v="h2">
        {rm(car.price_per_hour)} <Txt v="body">/ hour</Txt>{'  '}{rm(car.price_per_day)} <Txt v="body">/ day</Txt>
      </Txt>
      <Pressable onPress={openPicker} style={styles.panelDates}>
        <Txt v="tiny" color={C.ink}>TRIP DATES</Txt>
        <Txt v="h3">{window ? fmtRangeShort(window.start, window.end) : 'Add dates'}</Txt>
        {blocked ? (
          <Txt v="small" color={C.danger}>{clash ? 'Already booked then' : `Minimum ${car.min_hours} hours`}</Txt>
        ) : null}
      </Pressable>
      <Button
        title={reserveTitle}
        variant={blocked ? 'dark' : 'primary'}
        onPress={blocked ? openPicker : reserve}
        loading={book.isPending}
        disabled={isOwnCar}
      />
      {q && !blocked ? (
        <View style={{ gap: S.sm }}>
          <Line label={`${fmtDuration(q.hours)} rental`} value={rm(q.trip)} />
          <Line label="Kar booking fee" value={rm(q.fee)} />
          <Divider />
          <Line label="Total (MYR)" value={rm(q.total)} strong />
        </View>
      ) : (
        <Txt v="small" style={{ textAlign: 'center' }}>{"You won't be charged yet"}</Txt>
      )}
      <ErrorText error={book.error} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[styles.galleryWrap, split && styles.galleryWide]}>
          <PhotoGallery photos={car.photos} height={split ? 460 : Platform.OS === 'web' ? 360 : 300} radius={split ? R.lg : 0}>
            <View style={[styles.galleryBar, { top: insets.top + 8 }]}>
              <IconButton icon="chevron-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
            </View>
          </PhotoGallery>
        </View>

        <View style={[styles.body, split && styles.bodyWide]}>
          {split ? (
            <View style={styles.columns}>
              <View style={{ flex: 1 }}>{details}</View>
              <View style={[styles.side, Platform.OS === 'web' && ({ position: 'sticky', top: S.xl } as object)]}>
                {bookingPanel}
              </View>
            </View>
          ) : (
            details
          )}
        </View>
      </ScrollView>

      <HouseRulesSheet
        visible={rulesOpen}
        carName={`${carName(car)} ${car.year}`}
        start={window?.start ?? null}
        end={window?.end ?? null}
        hours={q?.hours ?? 0}
        trip={q?.trip ?? 0}
        fee={q?.fee ?? 0}
        total={q?.total ?? 0}
        lateFee={car.late_fee_per_hour}
        loading={book.isPending}
        error={book.error}
        onClose={() => setRulesOpen(false)}
        onAgree={() => payAfterRules().catch(() => {})}
      />

      {/* Sticky reserve bar (phones; laptops use the booking card) */}
      {split ? null : (
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, S.xl) }]}>
        <Row style={styles.footerInner}>
          {/* Same look as the date picker's Confirm bar: "Total RM69 · 2 hours", then the dates (tap to change). */}
          <Pressable onPress={openPicker} style={{ flex: 1, gap: 6 }}>
            {/* Two lines max: the headline, then dates (or why it can't be booked). */}
            {!window ? (
              <>
                <Text style={styles.total}>
                  <Text style={styles.totalAmount}>{rm(car.price_per_hour)}</Text>
                  <Text style={{ color: C.muted }}> /hour</Text>
                </Text>
                <Txt v="small" underline>Add dates</Txt>
              </>
            ) : blocked ? (
              <>
                <Text style={[styles.total, { fontWeight: '700' }]}>Not available</Text>
                <Txt v="small" color={C.danger} numberOfLines={1}>
                  {clash ? 'Already booked then' : `Minimum ${car.min_hours} hours`}
                </Txt>
              </>
            ) : (
              <>
                <Text style={styles.total} numberOfLines={1}>
                  Total <Text style={styles.totalAmount}>{rm(q!.total)}</Text>
                  {q!.hours < 24 ? <Text style={{ color: C.muted }}> · {fmtLength(q!.hours)}</Text> : null}
                </Text>
                <Txt v="small" numberOfLines={1} underline>{fmtRangeShort(window.start, window.end)}</Txt>
              </>
            )}
          </Pressable>
          <Button
            title={reserveTitle}
            variant={blocked ? 'dark' : 'primary'}
            onPress={blocked ? openPicker : reserve}
            loading={book.isPending}
            disabled={isOwnCar}
            style={{ minWidth: 120 }}
          />
        </Row>
      </View>
      )}
    </View>
  );
}

// Kept outside the component so the local `window` (trip window) name doesn't shadow the browser global.
function window_assign(url: string) {
  globalThis.location.assign(url);
}

const styles = StyleSheet.create({
  galleryWrap: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  galleryBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  body: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: PageX },
  footer: { borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg, paddingTop: S.lg, paddingHorizontal: PageX },
  total: { fontSize: 15, color: C.ink },
  totalAmount: { fontSize: 18, fontWeight: '700' },
  galleryWide: { maxWidth: 1120, paddingHorizontal: PageX, paddingTop: S.xl },
  bodyWide: { maxWidth: 1120 },
  columns: { flexDirection: 'row', gap: 56, alignItems: 'flex-start' },
  side: { width: 370, paddingTop: S.xl },
  panel: { borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: S.xl, gap: S.lg, backgroundColor: C.bg },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.soft, borderWidth: 1, borderColor: C.line, borderRadius: R.pill, paddingHorizontal: S.md, paddingVertical: 5 },
  insured: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', backgroundColor: C.successSoft, borderRadius: R.pill, paddingHorizontal: S.md, paddingVertical: 6 },
  panelDates: { borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.md, padding: S.md, gap: 2 },
  footerInner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', justifyContent: 'space-between', gap: S.lg },
});

/** The trip rules as short rows (icon, label, one line), all visible: renters should see them before they book. */
function GoodToKnow({ lateFee, minHours }: { lateFee: number; minHours: number }) {
  const rows: [IconName, string, string][] = [
    ['calendar-outline', 'Free cancellation', 'Up to 24h before for the trip price back. Later, the owner keeps half.'],
    ['time-outline', `Minimum ${minHours} hours`, `Late fee ${rm(lateFee)}/hour after 15 minutes, paid to the owner.`],
    ['camera-outline', 'Photos', '5 quick photos at pickup and return.'],
    ['location-outline', 'Location', 'The owner sees where the car is during your trip.'],
  ];
  return (
    <View style={{ gap: S.lg, marginTop: S.md }}>
      {rows.map(([icon, title, body]) => (
        <Row key={title} gap={S.md} style={{ alignItems: 'flex-start' }}>
          <Ionicons name={icon} size={20} color={C.ink} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="h3">{title}</Txt>
            <Txt v="small">{body}</Txt>
          </View>
        </Row>
      ))}
    </View>
  );
}

/** Small "Directions" link that opens Google Maps (app or web) with walking directions. */
function DirectionsLink({ lat, lng }: { lat: number; lng: number }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
      accessibilityRole="link">
      <Ionicons name="navigate" size={16} color={C.brand} />
      <Txt v="h3" color={C.brand}>Directions</Txt>
    </Pressable>
  );
}
