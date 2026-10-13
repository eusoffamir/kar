import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CarMap } from '@/components/car-map';
import { HouseRulesSheet } from '@/components/house-rules';
import { DirectionsButton } from '@/components/trip-parts';
import {
  Avatar,
  Button,
  Divider,
  ErrorText,
  Feature,
  HeartButton,
  IconButton,
  Ionicons,
  Line,
  Loading,
  PhotoGallery,
  Row,
  Section,
  Txt,
} from '@/components/ui';
import { C, MaxContentWidth, S } from '@/constants/theme';
import { api, keys, useAction, useMe } from '@/lib/api';
import { canBook } from '@/lib/policy';
import { overlaps } from '@/lib/backend';
import { carName, fmtDateTime, fmtDuration, fmtRangeShort } from '@/lib/format';
import { quote, rm } from '@/lib/pricing';
import { useTripWindow } from '@/lib/stores';

export default function CarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: car, isLoading, error } = useQuery({ queryKey: keys.car(id), queryFn: () => api.getCar(id) });
  const { data: me } = useMe();
  const window = useTripWindow();
  const insets = useSafeAreaInsets();
  const [rulesOpen, setRulesOpen] = useState(false);
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

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.galleryWrap}>
          <PhotoGallery photos={car.photos} height={Platform.OS === 'web' ? 360 : 300}>
            <View style={[styles.galleryBar, { top: insets.top + 8 }]}>
              <IconButton icon="chevron-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
              <HeartButton carId={car.id} floating />
            </View>
          </PhotoGallery>
        </View>

        <View style={styles.body}>
          <Section>
            <Txt v="h1">{carName(car)} {car.year}</Txt>
            <Txt v="body" color={C.ink}>
              {car.transmission === 'auto' ? 'Automatic' : 'Manual'} · {car.seats} seats · {car.fuel.charAt(0).toUpperCase() + car.fuel.slice(1)} · {car.plate}
            </Txt>
            <Row gap={6}>
              {owner.rating_avg ? (
                <>
                  <Ionicons name="star" size={14} color={C.ink} />
                  <Txt v="h3">{owner.rating_avg.toFixed(2)}</Txt>
                  <Txt v="h3">·</Txt>
                  <Txt v="h3" underline>{owner.rating_count} reviews</Txt>
                </>
              ) : (
                <Txt v="h3">New on Kar</Txt>
              )}
            </Row>
          </Section>

          <Section>
            <Row gap={S.lg}>
              <Avatar name={owner.full_name} size={48} />
              <View style={{ flex: 1 }}>
                <Txt v="h3">{owner.full_name.replace(/\(.*?\)/, '').trim()}</Txt>
                <Txt v="small">{(owner.rating_avg ?? 0) >= 4.8 ? 'Top rated owner' : 'Owner'}</Txt>
              </View>
              {owner.verification === 'verified' ? <Ionicons name="shield-checkmark" size={22} color={C.success} /> : null}
            </Row>
          </Section>

          <Section>
            <Feature icon={car.instant_book ? 'flash-outline' : 'time-outline'} title={car.instant_book ? 'Instant book' : 'Owner confirms'} />
            <Feature icon={car.handover === 'keybox' ? 'key-outline' : 'hand-left-outline'} title={car.handover === 'keybox' ? 'Keyless pickup' : 'Meet the owner'} />
            <Feature icon="navigate-outline" title="Exact parking spot" />
          </Section>

          {car.description ? (
            <Section>
              <Txt>{car.description}</Txt>
            </Section>
          ) : null}

          <Section title="Pickup">
            <CarMap
              center={{ lat: spot.lat, lng: spot.lng }}
              zoom={17}
              height={220}
              pins={[{ id: 'spot', lat: spot.lat, lng: spot.lng, label: car.last_location ? 'Parked here' : 'Pickup', kind: car.last_location ? 'parked' : 'pickup' }]}
            />
            <Txt v="h3">{spot.note || 'UTP, Seri Iskandar'}</Txt>
            <DirectionsButton lat={spot.lat} lng={spot.lng} />
            {car.last_location ? <Txt v="small">Updated {fmtDateTime(car.last_location.updated_at)}</Txt> : null}
          </Section>

          {q ? (
            <Section title="Price details">
              <Line label={`${fmtDuration(q.hours)} rental`} value={rm(q.trip)} />
              <Line label="Kar booking fee" value={rm(q.fee)} />
              <Divider />
              <Line label="Total (MYR)" value={rm(q.total)} strong />
              <Txt v="small">+ {rm(q.deposit)} deposit, paid to the owner at pickup</Txt>
            </Section>
          ) : null}

          <Section title="Good to know" last>
            <Feature icon="wallet-outline" title={`${rm(car.deposit)} deposit, paid to the owner at pickup`} />
            <Feature icon="camera-outline" title="7 photos at pickup & return" />
            <Feature icon="alarm-outline" title={`Late fee ${rm(car.late_fee_per_hour)}/h · min ${car.min_hours}h`} />
            <Feature icon="close-circle-outline" title="Free cancellation up to 24h before pickup" />
          </Section>
          <ErrorText error={book.error} />
        </View>
      </ScrollView>

      <HouseRulesSheet
        visible={rulesOpen}
        total={q?.total ?? 0}
        deposit={car.deposit}
        lateFee={car.late_fee_per_hour}
        loading={book.isPending}
        error={book.error}
        onClose={() => setRulesOpen(false)}
        onAgree={() => payAfterRules().catch(() => {})}
      />

      {/* Sticky reserve bar */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, S.md) }]}>
        <Row style={styles.footerInner}>
          <Pressable onPress={openPicker} style={{ flex: 1, gap: 2 }}>
            {/* Two lines max: the headline, then dates (or why it can't be booked). */}
            {!window ? (
              <>
                <Txt v="h3">{rm(car.price_per_hour)} / hour</Txt>
                <Txt v="small">Add dates</Txt>
              </>
            ) : blocked ? (
              <>
                <Txt v="h3">Not available</Txt>
                <Txt v="small" color={C.danger} numberOfLines={1}>
                  {clash ? 'Already booked then' : `Minimum ${car.min_hours} hours`}
                </Txt>
              </>
            ) : (
              <>
                <Txt v="h3">{rm(q!.total)}</Txt>
                <Txt v="small" numberOfLines={1}>{fmtRangeShort(window.start, window.end)}</Txt>
              </>
            )}
          </Pressable>
          <Button
            title={!window ? 'Check dates' : blocked ? 'Change dates' : car.instant_book ? 'Reserve' : 'Request'}
            variant={blocked ? 'dark' : 'primary'}
            onPress={blocked ? openPicker : reserve}
            loading={book.isPending}
            disabled={isOwnCar}
            style={{ minWidth: 150 }}
          />
        </Row>
      </View>
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
  body: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: S.xl },
  footer: { borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg, paddingTop: S.md, paddingHorizontal: S.xl },
  footerInner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', justifyContent: 'space-between', gap: S.lg },
});
