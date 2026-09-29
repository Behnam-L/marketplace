import { Button } from '../../shared/ui/Button';
import { Spinner } from '../../shared/ui/Feedback';
import { LandingScreen } from '../consumer/entry/LandingScreen';
import { OtpScreen } from '../consumer/otp/OtpScreen';
import { IdentityScreen } from '../consumer/identity/IdentityScreen';
import { CheckoutProvider, useCheckout, type LoadState } from './CheckoutContext';
import { StandaloneLayout } from './CheckoutLayout';
import { CreditScreen } from './credit/CreditScreen';
import { PaymentFailedScreen, ProcessingScreen, ReturnScreen } from './payment/PaymentScreens';
import { LatePaymentScreen, ResultScreen, TerminalScreen } from './result/ResultScreens';

/** Renders the screen for the server-decided step (the URL mirrors it). */
function StepRouter() {
  const { order } = useCheckout();
  switch (order.step) {
    case 'landing':
      return <LandingScreen />;
    case 'otp':
      return <OtpScreen key={order.orderId} />;
    case 'identity':
      return <IdentityScreen key={order.identityStep ?? 'id'} />;
    case 'credit':
      return <CreditScreen />;
    case 'processing':
    case 'bank-start':
      return <ProcessingScreen />;
    case 'payment-failed':
      return <PaymentFailedScreen />;
    case 'return':
      return <ReturnScreen />;
    case 'result':
      return <ResultScreen />;
    case 'late-payment':
      return <LatePaymentScreen />;
    case 'cancelled':
    case 'expired':
    case 'failed':
      return <TerminalScreen kind={order.step} />;
  }
}

function Fallback({ state }: { state: LoadState }) {
  if (state.kind === 'loading') {
    return (
      <StandaloneLayout>
        <div className="stack" aria-busy="true" style={{ alignItems: 'center' }}>
          <span className="skeleton" style={{ width: '60%', height: 28 }} />
          <span className="skeleton" style={{ width: '100%', height: 120, borderRadius: 16 }} />
          <Spinner />
        </div>
      </StandaloneLayout>
    );
  }
  if (state.kind === 'invalid') return <CheckoutMessage title="درخواست نامعتبر" text="این درخواست پرداخت نامعتبر است. لطفاً به فروشگاه برگردید و دوباره تلاش کنید." />;
  if (state.kind === 'expired') return <CheckoutMessage title="نشست منقضی شد" text="این نشست منقضی شده است. لطفاً پرداخت جدیدی را آغاز کنید." />;
  return (
    <CheckoutMessage
      title="خطا در ارتباط"
      text="ارتباط برقرار نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید."
      action={
        state.kind === 'error' ? (
          <Button variant="tonal" onClick={state.retry}>
            تلاش دوباره
          </Button>
        ) : undefined
      }
    />
  );
}

export function CheckoutMessage({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <StandaloneLayout>
      <div className="card stack" style={{ textAlign: 'center', alignItems: 'center' }}>
        <div className="status-icon status-icon--warning" aria-hidden="true">
          !
        </div>
        <h1 className="bon-headline-small">{title}</h1>
        <p className="bon-body-large">{text}</p>
        {action}
      </div>
    </StandaloneLayout>
  );
}

export function CheckoutApp() {
  return (
    <CheckoutProvider fallback={(s) => <Fallback state={s} />}>
      <StepRouter />
    </CheckoutProvider>
  );
}
