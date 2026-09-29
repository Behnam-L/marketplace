import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toman } from '../../../shared/format/format';
import { Button } from '../../../shared/ui/Button';
import { Checkbox } from '../../../shared/ui/Field';
import { Banner } from '../../../shared/ui/Feedback';
import { useCheckout } from '../../checkout/CheckoutContext';
import { CheckoutLayout } from '../../checkout/CheckoutLayout';

/** FR-010/011: merchant, amount, masked phone, terms checkbox, Continue. */
export function LandingScreen() {
  const { client, order, setOrder, handleError } = useCheckout();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!accepted) {
      setError('برای ادامه، شرایط و قوانین را بپذیرید.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const r = await client.acceptTerms(order.version, order.termsVersion);
      setOrder(r.order);
    } catch (e) {
      setError(handleError(e, () => void submit()));
    } finally {
      setPending(false);
    }
  };

  return (
    <CheckoutLayout
      title="پرداخت با اعتبار ترکیبی"
      footer={
        <Button block onClick={() => void submit()} pending={pending}>
          ادامه
        </Button>
      }
    >
      <section className="card amount-hero" aria-label="مبلغ قابل پرداخت">
        <div className="muted bon-body-medium">مبلغ خرید از {order.merchantDisplayName}</div>
        <div className="amount-hero__value">{toman(order.totalAmount)}</div>
      </section>
      <p className="bon-body-large">
        کد تأیید به شماره <bdi className="ltr">{order.maskedPhone}</bdi> ارسال می‌شود.
      </p>
      <Checkbox
        checked={accepted}
        onChange={(e) => {
          setAccepted(e.target.checked);
          if (e.target.checked) setError(null);
        }}
        label={
          <>
            <Link to="/c/terms" target="_blank" rel="noopener">
              شرایط و قوانین
            </Link>{' '}
            پرداخت اعتباری باجت را خوانده‌ام و می‌پذیرم.
          </>
        }
        error={error}
      />
      {order.demoMode && <Banner tone="warning">این یک پرداخت نمایشی است؛ کد تأیید در همین صفحه نمایش داده می‌شود.</Banner>}
    </CheckoutLayout>
  );
}

export function TermsPage() {
  return (
    <div className="checkout" lang="fa" dir="rtl">
      <main className="checkout__main">
        <h1 className="bon-headline-small">شرایط و قوانین پرداخت اعتباری باجت</h1>
        <p className="bon-body-large">
          با استفاده از این سرویس، بخشی از مبلغ خرید از محل اعتبارهای شما نزد تأمین‌کنندگان اعتبار و بخشی با کارت بانکی پرداخت می‌شود. تسویه اعتبار
          با تأمین‌کننده و بر اساس قرارداد شما با آن است. باجت اطلاعات هویتی شما را فقط برای احراز هویت و استعلام اعتبار و به‌صورت رمزنگاری‌شده نگهداری
          می‌کند.
        </p>
        <p className="muted bon-body-medium">نسخه ۲۰۲۶-۰۹ (متن نمونه برای نسخه نمایشی).</p>
      </main>
    </div>
  );
}
