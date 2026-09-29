import { useState } from 'react';
import { Button } from '../../../shared/ui/Button';
import { ConfirmDialog } from '../../../shared/ui/Dialog';
import { useIdempotencyKey } from '../checkout-api';
import { useCheckout } from '../CheckoutContext';

/** FR-045 cancel with confirmation; the server decides Cancelled vs CancellationRequested. */
export function CancelButton({ label = 'انصراف از پرداخت' }: { label?: string }) {
  const { client, order, refresh, handleError } = useCheckout();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ik, resetIk] = useIdempotencyKey();
  const run = async () => {
    setPending(true);
    try {
      await client.cancel(order.version, ik);
      await refresh();
      setOpen(false);
    } catch (e) {
      resetIk();
      setError(handleError(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Button variant="text" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {error && (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}
      {open && (
        <ConfirmDialog title="انصراف از پرداخت؟" confirmLabel="بله، انصراف" danger pending={pending} onConfirm={() => void run()} onClose={() => setOpen(false)}>
          اعتبارهای رزروشده آزاد می‌شوند و می‌توانید به فروشگاه برگردید.
        </ConfirmDialog>
      )}
    </>
  );
}
