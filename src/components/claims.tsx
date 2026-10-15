import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Money } from '@/components/car-form';
import { EvidencePicker, type EvidencePhoto } from '@/components/evidence';
import { PhotoCompare } from '@/components/trip-parts';
import { Badge, Button, Card, ErrorText, Row, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api, useAction } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { claimWindowOpen, POLICY } from '@/lib/policy';
import { rm } from '@/lib/pricing';
import type { BookingDetail, Claim } from '@/lib/types';

const CLAIM_STATUS: Record<Claim['status'], { label: string; tone: 'warning' | 'brand' | 'danger' | 'success' | 'muted' }> = {
  open: { label: 'Waiting for customer', tone: 'warning' },
  reviewing: { label: 'Kar is reviewing', tone: 'brand' },
  approved: { label: 'Approved', tone: 'danger' },
  rejected: { label: 'Rejected', tone: 'success' },
  settled: { label: 'Settled', tone: 'muted' },
};

const DEPOSIT: Record<BookingDetail['deposit_status'], { label: string; tone: 'muted' | 'success' | 'danger' | 'brand' }> = {
  held: { label: 'Held by Kar', tone: 'brand' },
  with_owner: { label: 'With owner', tone: 'muted' },
  returned: { label: 'Returned', tone: 'success' },
  deducted: { label: 'Deducted', tone: 'danger' },
};

export const useClaims = (bookingId: string) =>
  useQuery({ queryKey: ['claims', bookingId], queryFn: () => api.claimsFor(bookingId) });

/**
 * Deposit status for both sides. Kar holds deposits on new bookings and refunds them automatically 48h after
 * the return (minus late fee and approved damage); older bookings paid it to the owner in cash.
 */
export function DepositCard({ b, role }: { b: BookingDetail; role: 'customer' | 'owner' }) {
  const { data: claims } = useClaims(b.id);
  const openClaim = claims?.some((c) => c.status === 'open' || c.status === 'reviewing');
  const markReturned = useAction(() => api.setDepositReturned(b.id));
  const d = DEPOSIT[b.deposit_status];
  const done = ['returned', 'closed'].includes(b.status);
  const held = b.deposit_status === 'held';
  const settled = b.deposit_status === 'returned' || b.deposit_status === 'deducted';

  let text: string;
  if (held) {
    text = !done
      ? role === 'customer'
        ? `Paid with your booking. Refunded automatically 48 hours after you return the car, minus any late fee or damage the owner reports.`
        : 'Kar holds it during the trip. Late fees and approved damage are paid to you from it.'
      : openClaim
        ? 'Waiting for the damage claim to be decided.'
        : role === 'customer'
          ? `Refunded automatically ${POLICY.claimWindowHours} hours after the return unless the owner reports damage${b.late_fee_due > 0 ? `, minus the ${rm(b.late_fee_due)} late fee` : ''}.`
          : `Report damage within ${POLICY.claimWindowHours}h of the return, or release it now. ${b.late_fee_due > 0 ? `The ${rm(b.late_fee_due)} late fee comes to you either way.` : ''}`;
  } else if (settled && b.deposit_refund != null) {
    text = `${rm(b.deposit_refund)} refunded to the customer${b.deposit_to_owner ? `, and ${rm(b.deposit_to_owner)} to the owner (late fee, damage)` : ''}.`;
  } else {
    // Older bookings: cash with the owner.
    text =
      (role === 'customer' ? 'Paid to the owner at pickup.' : 'You collected this at pickup.') +
      (done && b.deposit_status === 'with_owner' && !openClaim
        ? role === 'customer'
          ? ' Should be returned once the owner confirms no damage.'
          : ` Return it, or report damage within ${POLICY.claimWindowHours}h of return.`
        : '');
  }
  const canRelease = role === 'owner' && done && (held || b.deposit_status === 'with_owner') && !openClaim;

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="label">Deposit {rm(b.deposit)}</Txt>
        <Badge label={d.label} tone={d.tone} />
      </Row>
      <Txt v="small">{text}</Txt>
      {canRelease ? (
        <Button
          title={held ? 'No damage: release deposit' : 'Deposit returned'}
          icon="checkmark"
          variant="outline"
          size="md"
          loading={markReturned.isPending}
          onPress={() => markReturned.mutate(undefined)}
        />
      ) : null}
      <ErrorText error={markReturned.error} />
    </Card>
  );
}

/** Claims on a trip. The customer can accept or dispute (once) while a claim is open. */
export function ClaimsList({ b, role }: { b: BookingDetail; role: 'customer' | 'owner' }) {
  const { data: claims } = useClaims(b.id);
  const respond = useAction((accept: boolean) => {
    const open = claims?.find((c) => c.status === 'open');
    return open ? api.respondToClaim(open.id, accept) : Promise.resolve();
  });
  if (!claims?.length) return null;
  return (
    <>
      {claims.map((c) => {
        const st = CLAIM_STATUS[c.status];
        return (
          <Card key={c.id} style={c.status === 'open' ? { borderColor: C.warning } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="label">Damage claim {rm(c.amount)}</Txt>
              <Badge label={st.label} tone={st.tone} />
            </Row>
            <Txt>{c.description}</Txt>
            <Txt v="tiny">Raised {fmtDateTime(c.created_at)}</Txt>
            {c.evidence.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
                {c.evidence.map((uri) => (
                  <Image key={uri} source={{ uri }} style={styles.evidence} contentFit="cover" />
                ))}
              </ScrollView>
            ) : null}
            {c.resolution_note ? <Txt v="small">Kar: {c.resolution_note}</Txt> : null}
            {role === 'customer' && c.status === 'open' ? (
              <>
                <Txt v="small">Compare with your before and after photos below. If you disagree, Kar reviews the evidence.</Txt>
                <Row>
                  <Button title="Dispute" variant="outline" style={{ flex: 1 }} onPress={() => respond.mutate(false)} disabled={respond.isPending} />
                  <Button title="Accept" variant="dark" style={{ flex: 1 }} onPress={() => respond.mutate(true)} loading={respond.isPending} />
                </Row>
                <PhotoCompare photos={b.photos} />
              </>
            ) : null}
            <ErrorText error={respond.error} />
          </Card>
        );
      })}
    </>
  );
}

/** Owner: report damage within the claim window, with photos and an amount up to the deposit. */
export function ReportDamage({ b }: { b: BookingDetail }) {
  const { data: claims } = useClaims(b.id);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [photos, setPhotos] = useState<EvidencePhoto[]>([]);
  const create = useAction(() => api.createClaim(b.id, description, Number(amount), photos.map((p) => p.path)));

  const eligible =
    ['returned', 'closed'].includes(b.status) &&
    (b.deposit_status === 'with_owner' || b.deposit_status === 'held') &&
    claimWindowOpen(b.returned_at) &&
    !claims?.some((c) => c.status === 'open' || c.status === 'reviewing');
  if (!eligible) return null;

  if (!open) {
    return <Button title="Report damage" icon="alert-circle-outline" variant="danger" onPress={() => setOpen(true)} />;
  }
  return (
    <Card>
      <Txt v="label">Report damage</Txt>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. New scratch on rear bumper, left side"
        placeholderTextColor={C.muted}
        multiline
        style={styles.input}
      />
      <Money label={`Amount (max ${rm(b.deposit)})`} value={amount} onChange={setAmount} />
      <View style={{ gap: S.sm }}>
        <Txt v="small">Photos of the damage</Txt>
        <EvidencePicker bookingId={b.id} photos={photos} onChange={setPhotos} />
      </View>
      <Txt v="tiny">If Kar approves the claim, a {rm(POLICY.claimHandlingFee)} handling fee comes out of your payout for this trip.</Txt>
      <Row>
        <Button title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
        <Button title="Send claim" variant="dark" style={{ flex: 1 }} loading={create.isPending} onPress={() => create.mutate(undefined, { onSuccess: () => setOpen(false) })} />
      </Row>
      <ErrorText error={create.error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  evidence: { width: 96, height: 76, borderRadius: R.md, backgroundColor: C.soft },
  input: {
    borderWidth: 1,
    borderColor: C.lineStrong,
    borderRadius: R.md,
    padding: S.md,
    fontSize: 16,
    color: C.ink,
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
