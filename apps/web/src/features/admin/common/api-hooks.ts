import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { api, newIdempotencyKey, type RequestOptions } from '../../../shared/api/client';

export function useApiQuery<T>(path: string | null, query?: RequestOptions['query']): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: [path, query],
    queryFn: ({ signal }) => api<T>(path!, { query, signal }),
    enabled: path !== null,
  });
}

/** Mutation with automatic cache invalidation of related admin data. */
export function useApiMutation<TBody, TRes>(fn: (body: TBody) => Promise<TRes>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries(),
  });
}

/** One Idempotency-Key per form mount (§8.3); renew after a definitive answer. */
export function useFormIdempotencyKey(): [string, () => void] {
  const [key, setKey] = useState(newIdempotencyKey);
  return [key, useCallback(() => setKey(newIdempotencyKey()), [])];
}

/** Warns before leaving a form with unsaved changes (§8.3). */
export function useUnsavedGuard(dirty: boolean): void {
  const ref = useRef(dirty);
  ref.current = dirty;
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (ref.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
}
