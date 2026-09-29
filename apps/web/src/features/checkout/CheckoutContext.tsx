import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { CheckoutOrderView, CheckoutStep } from '@bajet/contracts';
import { ApiError } from '../../shared/api/client';
import { errorText } from '../../shared/i18n/fa';
import { useToast } from '../../shared/ui/Toast';
import { CheckoutClient } from './checkout-api';

interface Ctx {
  client: CheckoutClient;
  token: string;
  order: CheckoutOrderView;
  skewMs: number;
  setOrder: (o: CheckoutOrderView) => void;
  refresh: () => Promise<CheckoutOrderView | null>;
  /** Standard error handling: STATE_CHANGED → refetch and reroute; network → toast + retry. */
  handleError: (e: unknown, retry?: () => void) => string | null;
}

const CheckoutCtx = createContext<Ctx | null>(null);

export function useCheckout(): Ctx {
  const c = useContext(CheckoutCtx);
  if (!c) throw new Error('useCheckout outside CheckoutProvider');
  return c;
}

const STEP_PATH: Record<CheckoutStep, string> = {
  landing: '',
  otp: 'otp',
  identity: 'identity',
  credit: 'credit',
  processing: 'processing',
  'bank-start': 'processing',
  'payment-failed': 'payment-failed',
  return: 'return',
  result: 'result',
  cancelled: 'cancelled',
  expired: 'expired',
  failed: 'failed',
  'late-payment': 'late-payment',
};

export type LoadState = { kind: 'loading' } | { kind: 'invalid' } | { kind: 'expired' } | { kind: 'error'; retry: () => void } | { kind: 'ready' };

export function CheckoutProvider({ children, fallback }: { children: ReactNode; fallback: (s: LoadState) => ReactNode }) {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const client = useMemo(() => new CheckoutClient(token), [token]);
  const [order, setOrderState] = useState<CheckoutOrderView | null>(null);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [skewMs, setSkew] = useState(0);
  const lastPath = useRef<string | null>(null);
  // useNavigate() changes identity on every route change; keep it out of the deps so
  // the one-time session exchange below does not re-run on navigation.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const setOrder = useCallback(
    (o: CheckoutOrderView) => {
      setOrderState(o);
      setSkew(new Date(o.serverTime).getTime() - Date.now());
      // The server's order status decides the route (single source of truth, §8).
      const path = `/c/${token}${STEP_PATH[o.step] ? `/${STEP_PATH[o.step]}` : ''}`;
      if (lastPath.current !== path && window.location.pathname !== path) navigateRef.current(path, { replace: true });
      lastPath.current = path;
    },
    [token],
  );

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const r = await client.exchange();
      setOrder(r.order);
      setState({ kind: 'ready' });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NOT_FOUND') setState({ kind: 'invalid' });
      else if (e instanceof ApiError && e.code === 'CHECKOUT_TOKEN_EXPIRED') setState({ kind: 'expired' });
      else setState({ kind: 'error', retry: () => void load() });
    }
  }, [client, setOrder]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    try {
      const o = await client.order();
      setOrder(o);
      return o;
    } catch {
      return null;
    }
  }, [client, setOrder]);

  // Every consumer screen refetches on focus (§8).
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const handleError = useCallback(
    (e: unknown, retry?: () => void) => {
      if (e instanceof ApiError) {
        if (['STATE_CHANGED', 'ORDER_EXPIRED', 'ORDER_BUSY', 'OTP_LOCKED', 'IDENTITY_LOCKED', 'OTP_REQUIRED', 'DEADLINE_TOO_CLOSE'].includes(e.code)) {
          void refresh();
          return e.code === 'STATE_CHANGED' ? null : errorText(e);
        }
        if (e.code === 'NETWORK_ERROR') {
          toast(errorText(e), retry ? { label: 'تلاش دوباره', onClick: retry } : undefined);
          return null;
        }
      }
      return errorText(e);
    },
    [refresh, toast],
  );

  if (state.kind !== 'ready' || !order) return <>{fallback(state)}</>;
  return <CheckoutCtx.Provider value={{ client, token, order, skewMs, setOrder, refresh, handleError }}>{children}</CheckoutCtx.Provider>;
}
