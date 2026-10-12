import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { PhotoCompare } from '@/components/trip-parts';
import { Button, Card, Empty, ErrorText, Loading, Row, Screen, Section, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api, useAction, useMe } from '@/lib/api';
import { carName, fmtDateTime, fmtRange } from '@/lib/format';
import { rm } from '@/lib/pricing';
import type { BookingDetail, Claim, VerificationReview } from '@/lib/types';

/** Kar team: approve ID checks and decide disputed damage claims. */
export default function Admin() {
  const { data: me, isLoading } = useMe();
  const ids = useQuery({ queryKey: ['admin', 'ids'], queryFn: () => api.adminPendingVerifications(), enabled: !!me?.is_admin });
  const claims = useQuery({ queryKey: ['admin', 'claims'], queryFn: () => api.adminDisputedClaims(), enabled: !!me?.is_admin });

  if (isLoading) return <Loading />;
  if (!me?.is_admin) {
    return (
      <Screen edges={['bottom']}>
        <Empty icon="lock-closed-outline" title="Kar team only" />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <Section title={`ID checks (${ids.data?.length ?? 0})`}>
        <ErrorText error={ids.error} />
        {ids.data?.length === 0 ? <Txt v="small">Nothing waiting.</Txt> : null}
        {ids.data?.map((v) => <IdReview key={v.id} v={v} />)}
      </Section>
      <Section title={`Disputed claims (${claims.data?.length ?? 0})`} last>
        <ErrorText error={claims.error} />
        {claims.data?.length === 0 ? <Txt v="small">Nothing waiting.</Txt> : null}
        {claims.data?.map((c) => <ClaimReview key={c.id} c={c} />)}
      </Section>
    </Screen>
  );
}

function IdReview({ v }: { v: VerificationReview }) {
  const review = useAction((approve: boolean) => api.adminReviewVerification(v.id, approve, approve ? 'Approved' : 'Documents unclear'));
  return (
    <Card>
      <Txt v="h3">{v.user.full_name}</Txt>
      <Txt v="small">
        Licence {v.licence_class ?? '–'} · expires {v.licence_expiry ?? '–'} · sent {fmtDateTime(v.created_at)}
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
        {[
          ['IC / student ID', v.ic],
          ['Licence', v.licence],
          ['Selfie', v.selfie],
        ].map(([label, uri]) => (
          <View key={label} style={{ gap: 4 }}>
            <Image source={{ uri }} style={styles.doc} contentFit="cover" />
            <Txt v="tiny">{label}</Txt>
          </View>
        ))}
      </ScrollView>
      <Row>
        <Button title="Reject" variant="danger" style={{ flex: 1 }} onPress={() => review.mutate(false)} disabled={review.isPending} />
        <Button title="Approve" variant="dark" style={{ flex: 1 }} onPress={() => review.mutate(true)} loading={review.isPending} />
      </Row>
      <ErrorText error={review.error} />
    </Card>
  );
}

function ClaimReview({ c }: { c: Claim & { booking: BookingDetail } }) {
  const [note, setNote] = useState('');
  const resolve = useAction((approve: boolean) => api.adminResolveClaim(c.id, approve, note.trim() || (approve ? 'Damage confirmed by photos' : 'Not supported by photos')));
  const b = c.booking;
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h3">{carName(b.car)} · {rm(c.amount)}</Txt>
      </Row>
      <Txt v="small">{fmtRange(b.starts_at, b.ends_at)} · {b.customer.full_name} vs {b.owner.full_name}</Txt>
      <Txt>{c.description}</Txt>
      {c.evidence.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
          {c.evidence.map((uri) => <Image key={uri} source={{ uri }} style={styles.doc} contentFit="cover" />)}
        </ScrollView>
      ) : null}
      <Txt v="label">Before vs after</Txt>
      {b.photos.length ? <PhotoCompare photos={b.photos} /> : <Txt v="small">No trip photos.</Txt>}
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Decision note (shown to both)"
        placeholderTextColor={C.muted}
        style={styles.note}
      />
      <Row>
        <Button title="Reject claim" variant="outline" style={{ flex: 1 }} onPress={() => resolve.mutate(false)} disabled={resolve.isPending} />
        <Button title="Approve" variant="dark" style={{ flex: 1 }} onPress={() => resolve.mutate(true)} loading={resolve.isPending} />
      </Row>
      <ErrorText error={resolve.error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  doc: { width: 120, height: 90, borderRadius: R.md, backgroundColor: C.soft },
  note: { borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.md, padding: S.md, fontSize: 15, color: C.ink },
});
