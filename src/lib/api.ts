import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Backend } from './backend';
import { mockBackend } from './mock-backend';

// Supabase when configured (see .env.example), otherwise the on-device demo backend.
export const api: Backend = process.env.EXPO_PUBLIC_SUPABASE_URL
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./supabase-backend').supabaseBackend
  : mockBackend;

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

export const keys = {
  me: ['me'] as const,
  cars: (zone: string) => ['cars', zone] as const,
  car: (id: string) => ['car', id] as const,
  trips: ['trips'] as const,
  booking: (id: string) => ['booking', id] as const,
  ownerCars: ['owner', 'cars'] as const,
  ownerBookings: ['owner', 'bookings'] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api.me() });

/** Mutation that refreshes everything afterwards — data sets are tiny, correctness beats cleverness. */
export function useAction<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}
