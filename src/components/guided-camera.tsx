import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Ionicons, Txt } from '@/components/ui';
import { C, S } from '@/constants/theme';
import { SLOT_LABEL } from '@/lib/format';
import type { PhotoSlot } from '@/lib/types';

const HINT: Record<PhotoSlot, string> = {
  front: 'Step back so the whole front and the number plate fit.',
  back: 'Step back so the whole back and the number plate fit.',
  left: 'Step back so the whole left side fits, wheels too.',
  right: 'Step back so the whole right side fits, wheels too.',
  fuel: 'The dashboard with the engine on: fuel level and any warning lights.',
  interior: 'Seats and floor, front and back.',
  odometer: 'The mileage on the dashboard, sharp enough to read.',
};

/**
 * One camera that walks through the photos in order: the renter opens it once and only presses snap.
 * Each shot is handed to onShot (which uploads in the background) and the next photo starts straight away.
 */
export function GuidedCamera({
  slots,
  onShot,
  onClose,
}: {
  slots: PhotoSlot[] | null;
  onShot: (slot: PhotoSlot, uri: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={!!slots} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {slots ? <CameraRun slots={slots} onShot={onShot} onClose={onClose} /> : null}
    </Modal>
  );
}

function CameraRun({ slots, onShot, onClose }: { slots: PhotoSlot[]; onShot: (slot: PhotoSlot, uri: string) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [index, setIndex] = useState(0);
  const [taken, setTaken] = useState<string[]>([]);
  const slot = slots[index];

  const snap = async () => {
    if (!camera.current || snapping) return;
    setSnapping(true);
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.5 });
      if (!pic?.uri) return;
      onShot(slot, pic.uri);
      setTaken((t) => [...t, pic.uri]);
      if (index + 1 >= slots.length) onClose();
      else setIndex(index + 1);
    } finally {
      setSnapping(false);
    }
  };

  if (!permission) return <View style={styles.dark} />;
  if (!permission.granted) {
    return (
      <View style={[styles.dark, styles.center, { padding: S.xl, gap: S.md }]}>
        <Ionicons name="camera" size={40} color="#fff" />
        <Txt v="label" color="#fff" style={{ textAlign: 'center' }}>Kar needs your camera for the car photos</Txt>
        <Button title="Allow camera" onPress={requestPermission} />
        <Button title="Cancel" variant="outline" onPress={onClose} />
      </View>
    );
  }

  return (
    <View style={styles.dark}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} />

      <View style={[styles.top, { paddingTop: insets.top + S.sm }]}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close camera">
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt v="tiny" color="rgba(255,255,255,0.8)">
            {index + 1} of {slots.length}
          </Txt>
          <Txt v="label" color="#fff">{SLOT_LABEL[slot]}</Txt>
        </View>
        <View style={{ width: 28 }} />
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + S.lg }]}>
        <Txt v="small" color="#fff" style={{ textAlign: 'center' }}>{HINT[slot]}</Txt>
        <View style={styles.controls}>
          <View style={styles.thumbs}>
            {/* Keyed by position: on web the uris are data: strings whose endings can match. */}
            {taken.slice(-3).map((uri, i) => (
              <Image key={taken.length - 3 + i} source={{ uri }} style={styles.thumb} contentFit="cover" />
            ))}
          </View>
          <Pressable onPress={snap} disabled={!ready || snapping} accessibilityLabel={`Take ${SLOT_LABEL[slot]} photo`} style={styles.shutter}>
            {snapping || !ready ? <ActivityIndicator color={C.ink} /> : <View style={styles.shutterInner} />}
          </Pressable>
          <View style={styles.thumbs} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.lg,
    paddingBottom: S.md,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: S.lg,
    paddingTop: S.md,
    gap: S.lg,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  thumbs: { width: 96, flexDirection: 'row', gap: 4 },
  thumb: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: '#fff' },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
});
