import { useQuery } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { type DocsDraft, emptyDocs, OperatorDocsFields, submitDocs } from '@/components/operator-docs';
import { Badge, Button, Card, ErrorText, Loading, Screen, Txt } from '@/components/ui';
import { C, S } from '@/constants/theme';
import { api, useAction, useMe } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { isInsured } from '@/lib/types';

/**
 * Owner: rental permit and insurance. Kar is only the booking platform, so every car on Kar must be rented out
 * by a licensed, insured operator; Kar checks the documents before approving any car, and listings show
 * "Insured by operator" while the insurance is valid.
 */
export default function OperatorDocuments() {
  const { data: me, isLoading } = useMe();
  const { data: latest, isLoading: docsLoading } = useQuery({ queryKey: ['operator-docs'], queryFn: () => api.myOperatorDocs() });
  const [resubmit, setResubmit] = useState(false);
  const [docs, setDocs] = useState<DocsDraft>(emptyDocs);

  const submit = useAction(async () => {
    await submitDocs(docs);
    setResubmit(false);
  });

  if (isLoading || docsLoading) return <Loading />;
  if (!me) {
    return (
      <Screen edges={['bottom']}>
        <Txt>Log in first to apply as a rental operator.</Txt>
        <Button title="Log in" onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  }

  // Current status, unless the owner is sending new documents (expired insurance, rejected, or renewal).
  if (latest && !resubmit) {
    const insured = isInsured(me);
    const tone = latest.status === 'approved' && insured ? 'success' : latest.status === 'pending' ? 'warning' : 'danger';
    const label =
      latest.status === 'pending' ? 'Kar is checking'
      : latest.status === 'rejected' ? 'Not approved'
      : insured ? 'Approved' : 'Insurance expired';
    return (
      <Screen edges={['bottom']}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt v="h2" style={{ flex: 1 }}>{latest.business_name}</Txt>
            <Badge label={label} tone={tone} />
          </View>
          <Txt v="small">SSM {latest.ssm_no}, permit {latest.permit_no}</Txt>
          <Txt v="small">{latest.insurer}, policy {latest.policy_no}, expires {latest.insurance_expiry}</Txt>
          <Txt v="tiny">Sent {fmtDateTime(latest.created_at)}</Txt>
          {latest.reviewer_note && latest.status === 'rejected' ? <Txt v="small" color={C.danger}>Kar: {latest.reviewer_note}</Txt> : null}
          {latest.status === 'pending' ? (
            <Txt v="small">
              {me.is_owner
                ? 'Kar usually checks within a day. Your cars can be approved once this is done.'
                : "Kar usually checks within a day. Once approved, you can list cars from the Host tab, and we'll notify you."}
            </Txt>
          ) : null}
        </Card>
        {latest.status !== 'pending' ? (
          <Button
            title={latest.status === 'approved' && insured ? 'Send renewed insurance' : 'Send new documents'}
            variant={latest.status === 'approved' && insured ? 'outline' : 'primary'}
            onPress={() => setResubmit(true)}
          />
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen
      edges={['bottom']}
      footer={<Button title="Send to Kar" loading={submit.isPending} onPress={() => submit.mutate(undefined)} />}>
      <View style={{ gap: S.xs }}>
        <Txt v="h1">{me.is_owner ? 'Operator documents' : 'Apply as a rental operator'}</Txt>
        <Txt v="small">
          Kar is a booking platform: you rent out the car, under your permit and insurance. Kar checks these before
          approving your cars, and renters see &quot;Insured by operator&quot; on your listings (
          <Link href="/legal/terms"><Txt v="small" color={C.ink} underline>Terms</Txt></Link>).
        </Txt>
      </View>

      <OperatorDocsFields value={docs} onChange={setDocs} />
      <ErrorText error={submit.error} />
      {resubmit ? <Button title="Cancel" variant="ghost" onPress={() => setResubmit(false)} /> : null}
    </Screen>
  );
}
