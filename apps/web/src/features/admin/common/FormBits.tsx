import { useState, type ReactNode } from 'react';
import { ApiError } from '../../../shared/api/client';
import { errorText, fieldErrors } from '../../../shared/i18n/fa';
import { Banner } from '../../../shared/ui/Feedback';

/** Standard form submit state: field errors, global error, If-Match conflict copy. */
export function useSubmit() {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setPending(true);
    setErrors({});
    setError(null);
    try {
      return await fn();
    } catch (e) {
      const fe = fieldErrors(e);
      setErrors(fe);
      if (e instanceof ApiError && e.code === 'STATE_CHANGED') setError('این رکورد تغییر کرده است. برای دیدن آخرین نسخه، صفحه را دوباره بارگذاری کنید.');
      else if (!Object.keys(fe).length || !(e instanceof ApiError && e.code === 'VALIDATION_ERROR')) setError(errorText(e));
      return undefined;
    } finally {
      setPending(false);
    }
  };
  return { pending, errors, error, run, setErrors };
}

export function FormError({ error }: { error: string | null }) {
  return error ? <Banner tone="error">{error}</Banner> : null;
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid-2">{children}</div>;
}
