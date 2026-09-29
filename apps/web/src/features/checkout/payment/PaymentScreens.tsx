import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../shared/ui/Button';
import { Banner, Spinner } from '../../../shared/ui/Feedback';
import { goToGateway, useIdempotencyKey, usePolling } from '../checkout-api';
import { useCheckout } from '../CheckoutContext';
import { CheckoutLayout } from '../CheckoutLayout';
import { CancelButton } from './CancelButton';

/** Starts (or retries) the bank payment and redirects to the gateway (FR-042/044). */
function useStartBankPayment() {
  const { client, order, refresh, handleError } = useCheckout();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ik, resetIk] = useIdempotencyKey();
  const start = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await client.bankPayment(order.version, ik);
      goToGateway(r.redirect);
    } catch (e) {
      resetIk();
      setError(handleError(e, () => void start()));
      await refresh();
      setPending(false);
    }
  };
  return { start, pending, error };
}

/** ReservationInProgress / AllocationInProgress / bank-start (§8.2 /processing). */
export function ProcessingScreen() {
  const { order, refresh } = useCheckout();
  const bank = useStartBankPayment();
  const started = useRef(false);
  usePolling(() => void refresh(), 2000, order.step === 'processing');
  useEffect(() => {
    if (order.step === 'bank-start' && !started.current) {
      started.current = true;
      void bank.start();
    }
  }, [order.step, bank]);
  const text = order.status === 'AllocationInProgress' ? 'در حال نهایی‌کردن پرداخت…' : order.step === 'bank-start' ? 'در حال انتقال به درگاه بانک…' : 'در حال رزرو اعتبار شما…';
  return (
    <CheckoutLayout title="لطفاً صبر کنید">
      <div className="card stack" style={{ alignItems: 'center', textAlign: 'center', paddingBlock: 40 }}>
        <Spinner />
        <p className="bon-body-large">{text}</p>
      </div>
      {bank.error && <Banner tone="error">{bank.error}</Banner>}
    </CheckoutLayout>
  );
}

/** Retry Payment / Cancel with countdown (§8.2 /payment-failed). */
export function PaymentFailedScreen() {
  const bank = useStartBankPayment();
  return (
    <CheckoutLayout
      title="پرداخت بانکی انجام نشد"
      footer={
        <Button block onClick={() => void bank.start()} pending={bank.pending}>
          تلاش دوباره برای پرداخت
        </Button>
      }
    >
      <div className="status-icon status-icon--warning" aria-hidden="true">
        !
      </div>
      <p className="bon-body-large">پرداخت بانکی شما تکمیل نشد. اعتبار شما تا پایان مهلت رزرو باقی می‌ماند؛ می‌توانید دوباره تلاش کنید یا انصراف دهید.</p>
      {bank.error && <Banner tone="error">{bank.error}</Banner>}
      <CancelButton />
    </CheckoutLayout>
  );
}

/** Back from the bank: poll every 2 s; after 30 s warn not to pay again (§8.2 /return). */
export function ReturnScreen() {
  const { order, refresh } = useCheckout();
  const [slow, setSlow] = useState(false);
  usePolling(() => void refresh(), 2000, order.step === 'return');
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 30_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <CheckoutLayout title="تأیید پرداخت">
      <div className="card stack" style={{ alignItems: 'center', textAlign: 'center', paddingBlock: 40 }}>
        <Spinner />
        <p className="bon-body-large">در حال تأیید پرداخت شما…</p>
      </div>
      {slow && <Banner tone="warning">تأیید هنوز در جریان است — لطفاً دوباره پرداخت نکنید.</Banner>}
      {order.status === 'CancellationRequested' && <Banner tone="info">درخواست انصراف شما ثبت شد؛ وضعیت پرداخت بانکی در حال بررسی است.</Banner>}
    </CheckoutLayout>
  );
}
