import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { MeResponse, Permission } from '@bajet/contracts';
import { ApiError, addInterceptor, api, setCsrfToken } from '../../shared/api/client';
import { useToast } from '../../shared/ui/Toast';
import { StepUpDialog } from './auth/StepUpDialog';

interface SessionCtx {
  me: MeResponse | null;
  loading: boolean;
  can: (...perms: Permission[]) => boolean;
  reload: () => Promise<MeResponse | null>;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function useSession(): SessionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}

export function useCan(): (...perms: Permission[]) => boolean {
  return useSession().can;
}

const PUBLIC_PATHS = ['/admin/login', '/admin/invite', '/admin/reset-password'];

/**
 * Admin session: /me, CSRF token, permission checks. Interceptors send expired
 * sessions to /admin/login?next=, ask for a TOTP step-up and rebuild the menu on 403.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [stepUp, setStepUp] = useState<{ resolve: (ok: boolean) => void } | null>(null);
  const locRef = useRef(location);
  locRef.current = location;

  const reload = useCallback(async () => {
    try {
      const m = await api<MeResponse>('/admin/me');
      setMe(m);
      setCsrfToken(m.session.csrfToken);
      return m;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (PUBLIC_PATHS.some((p) => location.pathname.startsWith(p))) {
      setLoading(false);
      return;
    }
    void reload();
    // Load once per app mount; the login page calls reload() after sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () =>
      addInterceptor((err, retry) => {
        if (err instanceof ApiError && (err.code === 'SESSION_EXPIRED' || (err.code === 'UNAUTHENTICATED' && err.status === 401 && me))) {
          setMe(null);
          const next = `${locRef.current.pathname}${locRef.current.search}`;
          navigate(`/admin/login?next=${encodeURIComponent(next)}`, { replace: true });
          return undefined;
        }
        if (err instanceof ApiError && err.code === 'STEP_UP_REQUIRED') {
          return new Promise<boolean>((resolve) => setStepUp({ resolve })).then((ok) => (ok ? retry() : Promise.reject(err)));
        }
        if (err instanceof ApiError && err.code === 'FORBIDDEN' && me) {
          toast('اجازه انجام این کار را ندارید.');
          void reload();
        }
        return undefined;
      }),
    [navigate, toast, reload, me],
  );

  const can = useCallback((...perms: Permission[]) => !!me && perms.every((p) => me.permissions.includes(p)), [me]);

  const logout = useCallback(async () => {
    try {
      await api('/admin/auth/logout', { method: 'POST' });
    } finally {
      setMe(null);
      setCsrfToken(null);
      navigate('/admin/login', { replace: true });
    }
  }, [navigate]);

  const value = useMemo(() => ({ me, loading, can, reload, logout }), [me, loading, can, reload, logout]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {stepUp && (
        <StepUpDialog
          onDone={(ok) => {
            stepUp.resolve(ok);
            setStepUp(null);
          }}
        />
      )}
    </Ctx.Provider>
  );
}
