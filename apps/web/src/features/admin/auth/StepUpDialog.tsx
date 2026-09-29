import { useState } from 'react';
import { toAsciiDigits, type AdminSessionInfo } from '@bajet/contracts';
import { api, setCsrfToken } from '../../../shared/api/client';
import { errorText } from '../../../shared/i18n/fa';
import { Button } from '../../../shared/ui/Button';
import { Dialog } from '../../../shared/ui/Dialog';
import { TextField } from '../../../shared/ui/Field';

/** Fresh TOTP (≤ 5 min) for sensitive permissions (§9.1). */
export function StepUpDialog({ onDone }: { onDone: (ok: boolean) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const s = await api<AdminSessionInfo>('/admin/auth/step-up', { body: { totp: toAsciiDigits(code) } });
      setCsrfToken(s.csrfToken);
      onDone(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      title="تأیید دومرحله‌ای"
      onClose={() => onDone(false)}
      actions={
        <>
          <Button variant="text" onClick={() => onDone(false)}>
            انصراف
          </Button>
          <Button onClick={() => void submit()} pending={pending}>
            تأیید
          </Button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p>این عملیات حساس است. کد ۶ رقمی برنامه احراز هویت خود را وارد کنید.</p>
        <TextField label="کد ورود دومرحله‌ای" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} error={error} autoFocus />
      </form>
    </Dialog>
  );
}
