import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Choice, Field } from '@/components/car-form';
import { Button, Empty, ErrorText, Ionicons, Loading, Row, Screen, Txt, type IconName } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api, useAction, useMe } from '@/lib/api';
import { normalizeMyPhone } from '@/lib/policy';

type Doc = 'ic' | 'licence' | 'selfie';
const DOCS: { key: Doc; label: string; hint: string; icon: IconName }[] = [
  { key: 'ic', label: 'IC or student ID', hint: 'Front side, all text readable', icon: 'card-outline' },
  { key: 'licence', label: 'Driving licence', hint: 'Show class and expiry date', icon: 'car-outline' },
  { key: 'selfie', label: 'Selfie', hint: 'Face clearly visible', icon: 'person-circle-outline' },
];

/** ID check before booking: IC/student ID, licence and a selfie, reviewed by Kar. */
export default function Verify() {
  const { data: me, isLoading } = useMe();
  const [photos, setPhotos] = useState<Partial<Record<Doc, string>>>({});
  const [licenceClass, setLicenceClass] = useState<'D' | 'DA'>('D');
  const [expiry, setExpiry] = useState('');
  const [phone, setPhone] = useState('');

  const submit = useAction(async () => {
    if (!photos.ic || !photos.licence || !photos.selfie) throw new Error('Add all 3 photos');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) throw new Error('Enter the licence expiry as YYYY-MM-DD');
    const normalized = normalizeMyPhone(phone);
    if (!normalized) throw new Error('Enter a Malaysian mobile number, e.g. 012-345 6789');
    await api.submitVerification({
      icUri: photos.ic,
      licenceUri: photos.licence,
      selfieUri: photos.selfie,
      licenceClass,
      licenceExpiry: expiry,
      phone: normalized,
    });
  });

  if (isLoading) return <Loading />;
  if (!me) {
    return (
      <Screen edges={['bottom']}>
        <Empty icon="person-circle-outline" title="Log in first" action={<Button title="Log in" onPress={() => router.push('/sign-in')} />} />
      </Screen>
    );
  }
  if (me.verification === 'verified') {
    return (
      <Screen edges={['bottom']}>
        <Empty icon="shield-checkmark" title="You're verified" body="You can book any car on Kar." action={<Button title="Done" variant="dark" onPress={() => router.back()} />} />
      </Screen>
    );
  }
  if (me.verification === 'pending' || submit.isSuccess) {
    return (
      <Screen edges={['bottom']}>
        <Empty icon="time-outline" title="Under review" body="Kar usually checks IDs within a few hours. You'll be able to book once approved." action={<Button title="Done" variant="dark" onPress={() => router.back()} />} />
      </Screen>
    );
  }

  const pick = async (doc: Doc) => {
    const useCamera = Platform.OS !== 'web';
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
    }
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.6,
      base64: Platform.OS === 'web',
      cameraType: doc === 'selfie' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    };
    const res = useCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    const uri = Platform.OS === 'web' && a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri;
    setPhotos((p) => ({ ...p, [doc]: uri }));
  };

  return (
    <Screen
      edges={['bottom']}
      footer={<Button title="Submit for review" loading={submit.isPending} onPress={() => submit.mutate(undefined)} />}>
      <View style={{ gap: S.xs }}>
        <Txt v="h1">Verify your ID</Txt>
        <Txt v="small">Owners only hand cars to verified drivers. Your documents are private to Kar.</Txt>
      </View>

      <View style={{ gap: S.md }}>
        {DOCS.map((d) => (
          <Pressable key={d.key} onPress={() => pick(d.key)} style={[styles.doc, photos[d.key] && styles.docDone]}>
            {photos[d.key] ? (
              <Image source={{ uri: photos[d.key] }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Ionicons name={d.icon} size={26} color={C.ink} />
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="h3">{d.label}</Txt>
              <Txt v="small">{photos[d.key] ? 'Tap to retake' : d.hint}</Txt>
            </View>
            <Ionicons name={photos[d.key] ? 'checkmark-circle' : 'camera-outline'} size={24} color={photos[d.key] ? C.success : C.muted} />
          </Pressable>
        ))}
      </View>

      <View style={{ gap: S.sm }}>
        <Txt v="h3">Licence class</Txt>
        <Row>
          <Choice icon="cog-outline" label="D (manual)" selected={licenceClass === 'D'} onPress={() => setLicenceClass('D')} />
          <Choice icon="speedometer-outline" label="DA (auto only)" selected={licenceClass === 'DA'} onPress={() => setLicenceClass('DA')} />
        </Row>
      </View>
      <Field label="Licence expiry (YYYY-MM-DD)" value={expiry} onChange={setExpiry} placeholder="2028-05-31" keyboard="numbers-and-punctuation" />
      <View style={{ gap: S.xs }}>
        <Field label="Mobile number" value={phone} onChange={setPhone} placeholder="012-345 6789" keyboard="phone-pad" maxLength={15} />
        <Txt v="small">Shared only with the other person during a booking, so you can arrange the handover.</Txt>
      </View>
      <ErrorText error={submit.error} />
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
