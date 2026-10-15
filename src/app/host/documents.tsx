import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Field } from '@/components/car-form';
import { Badge, Button, Card, ErrorText, Ionicons, Loading, Screen, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api, useAction, useMe } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { isInsured } from '@/lib/types';

type Doc = 'permit' | 'insurance';
const DOCS: { key: Doc; label: string; hint: string }[] = [
  { key: 'permit', label: 'Car rental permit', hint: 'Your licence to rent out cars (e.g. from APAD)' },
  { key: 'insurance', label: 'Insurance certificate', hint: 'Cover for rental use, showing the expiry date' },
];

/**
 * Owner: rental permit and insurance. Kar is only the booking platform, so every car on Kar must be rented out
 * by a licensed, insured operator; Kar checks the documents before approving any car, and listings show
 * "Insured by operator" while the insurance is valid.
 */
export default function OperatorDocuments() {
  const { data: me, isLoading } = useMe();
  const { data: latest, isLoading: docsLoading } = useQuery({ queryKey: ['operator-docs'], queryFn: () => api.myOperatorDocs() });
  const [resubmit, setResubmit] = useState(false);
  const [f, setF] = useState({ business_name: '', ssm_no: '', permit_no: '', insurer: '', policy_no: '', insurance_expiry: '' });
  const [files, setFiles] = useState<Partial<Record<Doc, string>>>({});
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = useAction(async () => {
    if (!files.permit || !files.insurance) throw new Error('Add both documents');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.insurance_expiry)) throw new Error('Enter the insurance expiry as YYYY-MM-DD');
    await api.submitOperatorDocs({ ...f, permitUri: files.permit, insuranceUri: files.insurance });
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

  const pick = async (doc: Doc) => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: Platform.OS === 'web' });
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    const uri = Platform.OS === 'web' && a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri;
    setFiles((p) => ({ ...p, [doc]: uri }));
  };

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
          <Txt v="small">SSM {latest.ssm_no} · permit {latest.permit_no}</Txt>
          <Txt v="small">{latest.insurer} · policy {latest.policy_no} · expires {latest.insurance_expiry}</Txt>
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

      <Field label="Business name (as registered with SSM)" value={f.business_name} onChange={set('business_name')} placeholder="Siti Car Rental Enterprise" maxLength={80} />
      <Field label="SSM registration number" value={f.ssm_no} onChange={set('ssm_no')} placeholder="202301234567" maxLength={30} />
      <Field label="Rental permit number" value={f.permit_no} onChange={set('permit_no')} maxLength={40} />
      <Field label="Insurer" value={f.insurer} onChange={set('insurer')} placeholder="e.g. Allianz" maxLength={60} />
      <Field label="Policy number" value={f.policy_no} onChange={set('policy_no')} maxLength={40} />
      <Field label="Insurance expiry (YYYY-MM-DD)" value={f.insurance_expiry} onChange={set('insurance_expiry')} placeholder="2027-05-31" keyboard="numbers-and-punctuation" />

      <View style={{ gap: S.md }}>
        {DOCS.map((d) => (
          <Pressable key={d.key} onPress={() => pick(d.key)} style={[styles.doc, files[d.key] && styles.docDone]}>
            {files[d.key] ? (
              <Image source={{ uri: files[d.key] }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Ionicons name="document-text-outline" size={26} color={C.ink} />
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="h3">{d.label}</Txt>
              <Txt v="small">{files[d.key] ? 'Tap to choose another' : d.hint}</Txt>
            </View>
            <Ionicons name={files[d.key] ? 'checkmark-circle' : 'add-circle-outline'} size={24} color={files[d.key] ? C.success : C.muted} />
          </Pressable>
        ))}
      </View>
      <Txt v="small">A clear photo or screenshot of each document. Only the Kar team sees them.</Txt>
      <ErrorText error={submit.error} />
      {resubmit ? <Button title="Cancel" variant="ghost" onPress={() => setResubmit(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  doc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    padding: S.md,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.lineStrong,
  },
  docDone: { borderColor: C.success },
  thumb: { width: 64, height: 48, borderRadius: R.sm, backgroundColor: C.soft },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
});
