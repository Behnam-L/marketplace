import type { ReactNode } from 'react';
import { toman } from '../../shared/format/format';
import { Countdown } from '../../shared/ui/Countdown';
import { useCheckout } from './CheckoutContext';

const DEADLINE_STEPS = ['processing', 'bank-start', 'payment-failed', 'return'];

/** Mobile-first checkout frame: app bar, demo notice, deadline countdown, sticky action area. */
export function CheckoutLayout({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  const { order, skewMs } = useCheckout();
  const showDeadline = order.paymentDeadlineAt && DEADLINE_STEPS.includes(order.step);
  return (
    <div className="checkout" lang="fa" dir="rtl">
      {order.demoMode && <div className="demo-banner">محیط نمایشی — اطلاعات واقعی کارت یا هویت وارد نکنید.</div>}
      <header className="appbar" style={{ width: '100%' }}>
        <div className="appbar__title">
          <div className="bon-title-medium">{order.merchantDisplayName}</div>
          <div className="bon-label-medium muted">
            پرداخت اعتباری باجت · {toman(order.totalAmount)}
          </div>
        </div>
      </header>
      <main className="checkout__main">
        <h1 className="bon-headline-small">{title}</h1>
        {showDeadline && (
          <div className="banner banner--info" role="status">
            <Countdown until={order.paymentDeadlineAt} skewMs={skewMs} label="زمان باقی‌مانده برای پرداخت:" />
          </div>
        )}
        {children}
      </main>
      {footer && <div className="checkout__footer">{footer}</div>}
    </div>
  );
}

export function StandaloneLayout({ children }: { children: ReactNode }) {
  return (
    <div className="checkout" lang="fa" dir="rtl">
      <main className="checkout__main" style={{ justifyContent: 'center' }}>
        {children}
      </main>
    </div>
  );
}
