import { useEffect, useState } from 'react';
import type { CheckoutResultResponse } from '@bajet/contracts';
import { toman } from '../../../shared/format/format';
import { Banner, ErrorState, Skeleton } from '../../../shared/ui/Feedback';
import { useCheckout } from '../CheckoutContext';
import { CheckoutLayout } from '../CheckoutLayout';

function ReturnToStore({ url, label = 'بازگشت به فروشگاه' }: { url: string | null | undefined; label?: string }) {
  if (!url) return null;
  return (
    <a className="btn btn--filled btn--block" href={url}>
      {label}
    </a>
  );
}

function useResult() {
  const { client } = useCheckout();
  const [result, setResult] = useState<CheckoutResultResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const load = () => {
    setFailed(false);
    client.result().then(setResult).catch(() => setFailed(true));
  };
  useEffect(load, [client]);
  return { result, failed, retry: load };
}

/** FR-051: providers + amounts, cash, total, references, Return to Merchant. */
export function ResultScreen() {
  const { result, failed, retry } = useResult();
  return (
    <CheckoutLayout title="پرداخت موفق" footer={result && <ReturnToStore url={result.returnUrl} label="بازگشت به فروشگاه" />}>
      <div className="status-icon status-icon--success" aria-hidden="true">
        ✓
      </div>
      {failed && <ErrorState onRetry={retry} />}
      {!result && !failed && (
        <div className="card stack stack--sm" aria-busy="true">
          <Skeleton height={24} />
          <Skeleton height={24} />
          <Skeleton height={24} />
        </div>
      )}
      {result && (
        <>
          {result.cancelNotApplied && <Banner tone="info">پرداخت شما پیش از اعمال انصراف انجام شد؛ بنابراین سفارش تکمیل شد.</Banner>}
          <section className="card" aria-label="جزئیات پرداخت">
            {result.allocations.map((a) => (
              <div key={a.providerId} className="kv">
                <span className="kv__k">{a.displayName}</span>
                <span className="kv__v">{toman(a.amount)}</span>
              </div>
            ))}
            <div className="kv">
              <span className="kv__k">پرداخت با کارت بانکی</span>
              <span className="kv__v">{toman(result.cashAmount)}</span>
            </div>
            <div className="kv kv--total">
              <span className="kv__k">مبلغ کل</span>
              <span className="kv__v">{toman(result.totalAmount)}</span>
            </div>
          </section>
          <section className="card">
            <div className="kv">
              <span className="kv__k">شماره سفارش باجت</span>
              <span className="kv__v ltr">{result.orderId}</span>
            </div>
            <div className="kv">
              <span className="kv__k">شماره سفارش فروشگاه</span>
              <span className="kv__v ltr">{result.orderNumber}</span>
            </div>
            {result.bankReference && (
              <div className="kv">
                <span className="kv__k">شماره پیگیری بانک</span>
                <span className="kv__v ltr">{result.bankReference}</span>
              </div>
            )}
          </section>
        </>
      )}
    </CheckoutLayout>
  );
}

const TERMINAL_COPY = {
  cancelled: { title: 'پرداخت لغو شد', text: 'این پرداخت لغو شد و هیچ مبلغی از شما کسر نشد. اعتبارهای رزروشده آزاد شدند.', tone: 'info' as const },
  expired: { title: 'نشست منقضی شد', text: 'این نشست منقضی شده است. لطفاً پرداخت جدیدی را آغاز کنید.', tone: 'warning' as const },
  failed: { title: 'پرداخت ناموفق', text: '', tone: 'error' as const },
};

const FAILED_TEXT: Record<string, string> = {
  OTP_LOCKED: 'تعداد تلاش‌های نادرست زیاد بود. لطفاً به فروشگاه برگردید و دوباره شروع کنید.',
  IDENTITY_LOCKED: 'تعداد تلاش‌های نادرست زیاد بود. لطفاً به فروشگاه برگردید و دوباره شروع کنید.',
  RESERVATION_FAILED: 'نتوانستیم اعتبار شما را رزرو کنیم. لطفاً به فروشگاه برگردید و دوباره تلاش کنید.',
  CONSUMER_BLOCKED: 'امکان ادامه این پرداخت وجود ندارد. لطفاً روش پرداخت دیگری را انتخاب کنید.',
};

/** §8.2 /cancelled, /expired, /failed. */
export function TerminalScreen({ kind }: { kind: 'cancelled' | 'expired' | 'failed' }) {
  const { order } = useCheckout();
  const copy = TERMINAL_COPY[kind];
  const text = kind === 'failed' ? (FAILED_TEXT[order.failureReason ?? ''] ?? 'این پرداخت انجام نشد.') : copy.text;
  return (
    <CheckoutLayout title={copy.title} footer={<ReturnToStore url={order.returnUrl} />}>
      <div className={`status-icon status-icon--${copy.tone === 'error' ? 'error' : copy.tone === 'warning' ? 'warning' : 'info'}`} aria-hidden="true">
        {kind === 'cancelled' ? '×' : '!'}
      </div>
      <p className="bon-body-large" style={{ textAlign: 'center' }}>
        {text}
      </p>
    </CheckoutLayout>
  );
}

/** FR-061: a payment received after the session ended is returned automatically. */
export function LatePaymentScreen() {
  const { order } = useCheckout();
  const { result } = useResult();
  return (
    <CheckoutLayout title="بازگشت وجه" footer={<ReturnToStore url={order.returnUrl} />}>
      <div className="status-icon status-icon--warning" aria-hidden="true">
        ↺
      </div>
      <p className="bon-body-large">
        پرداخت شما پس از پایان مهلت نشست دریافت شد. این مبلغ ظرف ۷۲ ساعت به‌صورت خودکار به کارت شما بازگردانده می‌شود.
      </p>
      {result?.latePaymentReference && (
        <div className="card kv">
          <span className="kv__k">شماره پیگیری</span>
          <span className="kv__v ltr">{result.latePaymentReference}</span>
        </div>
      )}
    </CheckoutLayout>
  );
}
