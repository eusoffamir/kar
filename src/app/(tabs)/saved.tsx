import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { CarCard } from '@/components/car-card';
import { Button, Empty, Loading, Screen, Txt } from '@/components/ui';
import { api, keys } from '@/lib/api';
import { useSaved, useTripWindow } from '@/lib/stores';

export default function Saved() {
  const saved = useSaved();
  const window = useTripWindow();
  const { data: cars, isLoading } = useQuery({ queryKey: keys.cars('utp'), queryFn: () => api.listCars('utp') });
  const list = (cars ?? []).filter((c) => saved.includes(c.id));

  return (
    <Screen>
      <Txt v="h1">Saved</Txt>
      {isLoading ? <Loading /> : null}
      {!isLoading && list.length === 0 ? (
        <Empty
          icon="heart-outline"
          title="No saved cars yet"
          body="Tap the heart on any car to keep it here for next time."
          action={<Button title="Start exploring" variant="dark" onPress={() => router.navigate('/')} />}
        />
      ) : null}
      {list.map((c) => (
        <CarCard key={c.id} car={c} window={window} />
      ))}
    </Screen>
  );
}
