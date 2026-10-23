import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Field } from '@/components/car-form';
import { Ionicons, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api } from '@/lib/api';

type Doc = 'permit' | 'insurance';
const DOCS: { key: Doc; label: string; hint: string }[] = [
  { key: 'permit', label: 'Car rental permit', hint: 'Your licence to rent out cars (e.g. from APAD)' },
  { key: 'insurance', label: 'Insurance certificate', hint: 'Cover for rental use, showing the expiry date' },
];

/** A rental operator's business details and document photos, before they are sent to Kar. */
export type DocsDraft = {
  business_name: string;
  ssm_no: string;
  permit_no: string;
  insurer: string;
  policy_no: string;
  insurance_expiry: string;
  files: Partial<Record<Doc, string>>;
};

export const emptyDocs: DocsDraft = { business_name: '', ssm_no: '', permit_no: '', insurer: '', policy_no: '', insurance_expiry: '', files: {} };

/** The first thing missing, or null when the draft can be sent (the database checks the rest). */
export function checkDocs(d: DocsDraft): string | null {
  if (!d.business_name.trim()) return 'Enter your business name';
  if (!d.ssm_no.trim()) return 'Enter your SSM number';
  if (!d.permit_no.trim()) return 'Enter your rental permit number';
  if (!d.insurer.trim() || !d.policy_no.trim()) return 'Enter your insurer and policy number';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.insurance_expiry)) return 'Enter the insurance expiry as YYYY-MM-DD';
  if (!d.files.permit || !d.files.insurance) return 'Add both documents';
  return null;
}

export async function submitDocs({ files, ...d }: DocsDraft) {
  const problem = checkDocs({ ...d, files });
  if (problem) throw new Error(problem);
  await api.submitOperatorDocs({ ...d, permitUri: files.permit!, insuranceUri: files.insurance! });
}

/** Business fields plus a photo of the permit and the insurance certificate. */
export function OperatorDocsFields({ value: f, onChange }: { value: DocsDraft; onChange: (d: DocsDraft) => void }) {
  const set = (k: Exclude<keyof DocsDraft, 'files'>) => (v: string) => onChange({ ...f, [k]: v });
  const pick = async (doc: Doc) => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: Platform.OS === 'web' });
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    const uri = Platform.OS === 'web' && a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri;
    onChange({ ...f, files: { ...f.files, [doc]: uri } });
  };
  return (
    <>
      <Field label="Business name (as registered with SSM)" value={f.business_name} onChange={set('business_name')} placeholder="Siti Car Rental Enterprise" maxLength={80} />
      <Field label="SSM registration number" value={f.ssm_no} onChange={set('ssm_no')} placeholder="202301234567" maxLength={30} />
      <Field label="Rental permit number" value={f.permit_no} onChange={set('permit_no')} maxLength={40} />
      <Field label="Insurer" value={f.insurer} onChange={set('insurer')} placeholder="e.g. Allianz" maxLength={60} />
      <Field label="Policy number" value={f.policy_no} onChange={set('policy_no')} maxLength={40} />
      <Field label="Insurance expiry (YYYY-MM-DD)" value={f.insurance_expiry} onChange={set('insurance_expiry')} placeholder="2027-05-31" keyboard="numbers-and-punctuation" />

      <View style={{ gap: S.md }}>
        {DOCS.map((d) => (
          <Pressable key={d.key} onPress={() => pick(d.key)} style={[styles.doc, f.files[d.key] && styles.docDone]}>
            {f.files[d.key] ? (
              <Image source={{ uri: f.files[d.key] }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Ionicons name="document-text-outline" size={26} color={C.ink} />
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="h3">{d.label}</Txt>
              <Txt v="small">{f.files[d.key] ? 'Tap to choose another' : d.hint}</Txt>
            </View>
            <Ionicons name={f.files[d.key] ? 'checkmark-circle' : 'add-circle-outline'} size={24} color={f.files[d.key] ? C.success : C.muted} />
          </Pressable>
        ))}
      </View>
      <Txt v="small">A clear photo or screenshot of each document. Only the Kar team sees them.</Txt>
    </>
  );
}

const styles = StyleSheet.create({
  doc: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, borderRadius: R.lg, borderWidth: 1, borderColor: C.lineStrong },
  docDone: { borderColor: C.success },
  thumb: { width: 64, height: 48, borderRadius: R.sm, backgroundColor: C.soft },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
});
