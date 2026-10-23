import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { z } from 'zod';

import { CarMap } from '@/components/car-map';
import { locateMe } from '@/components/trip-parts';
import { Button, ErrorText, Ionicons, Txt, type IconName } from '@/components/ui';
import { C, R, S, shadow } from '@/constants/theme';
import { api, useAction } from '@/lib/api';

// Form building blocks shared by "List your car" (host/new-car) and "Edit car" (host/car/[id]).

export const UTP = { lat: 4.3845, lng: 100.967 };
export const MAX_PHOTOS = 8;

export const carSchema = z.object({
  make: z.string().trim().min(2, 'Enter the make'),
  model: z.string().trim().min(1, 'Enter the model'),
  year: z.coerce.number().int().min(2000, 'Check the year').max(new Date().getFullYear() + 1, 'Check the year'),
  plate: z.string().trim().min(3, 'Enter the plate').transform((s) => s.toUpperCase()),
});

export const priceSchema = z
  .object({
    price_per_hour: z.coerce.number().positive('Set an hourly price'),
    price_per_day: z.coerce.number().positive('Set a daily price'),
    deposit: z.coerce.number().min(0),
  })
  .refine((v) => v.price_per_day <= v.price_per_hour * 24, { message: 'Day price should be lower than 24 hours' });

export const extrasSchema = z.object({
  late_fee_per_hour: z.coerce.number().min(0, 'Check the late fee'),
  min_hours: z.coerce.number().int().min(1, 'Minimum is 1 hour').max(72),
});

export const validKeybox = (code: string) => /^\d{3,8}$/.test(code);

export function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard,
  caps,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboard?: KeyboardTypeOptions;
  caps?: boolean;
  maxLength?: number;
}) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Txt v="small">{label}</Txt>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#B0B0B0"
        keyboardType={keyboard}
        autoCapitalize={caps ? 'characters' : 'words'}
        maxLength={maxLength}
        style={styles.input}
      />
    </View>
  );
}

/** Big "RM [ 8 ]" row for prices. */
export function Money({ label, value, onChange, unit = 'RM' }: { label: string; value: string; onChange: (v: string) => void; unit?: string }) {
  return (
    <View style={styles.money}>
      <Txt v="h3" style={{ flex: 1 }}>{label}</Txt>
      <Txt v="h2" color={C.muted}>{unit}</Txt>
      <TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" style={styles.moneyInput} selectTextOnFocus />
    </View>
  );
}

export function Choice({ icon, label, selected, onPress }: { icon: IconName; label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, selected && { borderColor: C.ink, borderWidth: 2, backgroundColor: C.soft }]}>
      <Ionicons name={icon} size={26} color={C.ink} />
      <Txt v="h3">{label}</Txt>
    </Pressable>
  );
}

/** "Move the map under the pin" picker (Grab-style) with a "Use my location" shortcut. */
export function PinPicker({
  spot,
  onChange,
  onDragging,
  height = 320,
}: {
  spot: { lat: number; lng: number };
  onChange: (c: { lat: number; lng: number }) => void;
  /** Lets the page stop scrolling while a finger is on the map (otherwise iOS scrolls the page instead). */
  onDragging?: (dragging: boolean) => void;
  height?: number;
}) {
  const locate = useAction(async () => onChange(await locateMe()));
  return (
    <View style={{ gap: S.md }}>
      <View
        style={{ height }}
        onTouchStart={() => onDragging?.(true)}
        // Capture phase: the web map stops touchend from bubbling, which used to leave page scrolling off.
        onTouchEndCapture={() => onDragging?.(false)}
        onTouchCancel={() => onDragging?.(false)}>
        <CarMap center={spot} zoom={17} height={height} pins={[]} onCenterChange={onChange} />
        <View pointerEvents="none" style={styles.centerPin}>
          <View style={[styles.pinHead, shadow]}>
            <Ionicons name="car" size={18} color="#fff" />
          </View>
          <View style={styles.pinStick} />
        </View>
      </View>
      <Button
        title="Use my location"
        icon="locate"
        variant="outline"
        size="md"
        loading={locate.isPending}
        onPress={() => locate.mutate(undefined)}
      />
      <ErrorText error={locate.error} />
    </View>
  );
}

/** Listing photos: first is the cover; ✕ removes; long-press makes a photo the cover; + adds more. */
export function PhotoPicker({ photos, onChange }: { photos: string[]; onChange: (p: string[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const add = async () => {
    setError(null);
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.6,
      base64: Platform.OS === 'web', // web: keep a data: URI so demo photos survive reloads
    });
    if (res.canceled) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const a of res.assets.slice(0, MAX_PHOTOS - photos.length)) {
        const uri = Platform.OS === 'web' && a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri;
        urls.push(await api.uploadCarPhoto(uri));
      }
      onChange([...photos, ...urls]);
    } catch (e) {
      setError(e);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={{ gap: S.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
        {photos.map((uri, i) => (
          <Pressable key={uri + i} onLongPress={() => onChange([uri, ...photos.filter((_, j) => j !== i)])} delayLongPress={350}>
            <Image source={{ uri }} style={styles.photo} contentFit="cover" />
            {i === 0 ? (
              <View style={styles.cover}>
                <Txt v="tiny" color={C.ink} style={{ fontWeight: '700' }}>Cover</Txt>
              </View>
            ) : null}
            <Pressable hitSlop={8} onPress={() => onChange(photos.filter((_, j) => j !== i))} style={[styles.remove, shadow]}>
              <Ionicons name="close" size={14} color={C.ink} />
            </Pressable>
          </Pressable>
        ))}
        {photos.length < MAX_PHOTOS ? (
          <Pressable onPress={add} disabled={uploading} style={[styles.photo, styles.add]}>
            {uploading ? <ActivityIndicator color={C.ink} /> : <Ionicons name="add" size={28} color={C.ink} />}
            <Txt v="tiny">{uploading ? 'Uploading' : 'Add'}</Txt>
          </Pressable>
        ) : null}
      </ScrollView>
      <Txt v="tiny">{photos.length}/{MAX_PHOTOS} photos. Hold one to make it the cover.</Txt>
      <ErrorText error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: C.lineStrong,
    borderRadius: R.md,
    paddingHorizontal: S.md,
    paddingVertical: 12,
    fontSize: 16,
    color: C.ink,
    backgroundColor: C.bg,
  },
  money: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.sm,
    borderWidth: 1,
    borderColor: C.lineStrong,
    borderRadius: R.md,
    paddingLeft: S.lg,
    paddingRight: S.sm,
    paddingVertical: S.sm,
  },
  moneyInput: { width: 90, fontSize: 22, fontWeight: '700', color: C.ink, textAlign: 'right', paddingVertical: 6 },
  choice: {
    flex: 1,
    gap: S.sm,
    padding: S.lg,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.lineStrong,
    minHeight: 96,
    justifyContent: 'space-between',
  },
  centerPin: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 52 },
  pinHead: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.brand,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinStick: { width: 3, height: 12, backgroundColor: C.ink, borderRadius: 2 },
  photo: { width: 120, height: 90, borderRadius: R.md, backgroundColor: C.soft },
  add: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center', gap: 2 },
  cover: { position: 'absolute', left: 6, bottom: 6, backgroundColor: '#fff', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  remove: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
