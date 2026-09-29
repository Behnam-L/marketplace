import { useCallback, useEffect, useRef, useState } from 'react';
import { toAsciiDigits } from '@bajet/contracts';
import { ApiError } from '../../../shared/api/client';
import { mmss } from '../../../shared/format/format';
import { Button } from '../../../shared/ui/Button';
import { TextField } from '../../../shared/ui/Field';
import { Banner } from '../../../shared/ui/Feedback';
import { useSecondsLeft } from '../../../shared/ui/Countdown';
import { useCheckout } from '../../checkout/CheckoutContext';
import { CheckoutLayout } from '../../checkout/CheckoutLayout';

interface OtpSessionState {
  id: string;
  expiresAt: string;
  resendAvailableAt: string;
  resendsLeft: number;
}

/** FR-012/013: 5-digit code, TTL countdown, resend cooldown, attempts left. */
export function OtpScreen() {
  const { client, order, setOrder, handleError, skewMs } = useCheckout();
  const [session, setSession] = useState<OtpSessionState | null>(() =>
    order.otp ? { id: order.otp.otpSessionId, expiresAt: order.otp.expiresAt, resendAvailableAt: order.otp.resendAvailableAt, resendsLeft: order.otp.resendsLeft } : null,
  );
  const started = useRef(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [demo, setDemo] = useState<string | null>(null);
  const ttl = useSecondsLeft(session?.expiresAt, skewMs);
  const cooldown = useSecondsLeft(session?.resendAvailableAt, skewMs);

  const send = useCallback(async () => {
    setSending(true);
    setSendError(null);
    try {
      const r = await client.sendOtp();
      setSession({ id: r.otpSessionId, expiresAt: r.expiresAt, resendAvailableAt: r.resendAvailableAt, resendsLeft: r.resendsLeft });
      setCode('');
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'OTP_RESEND_COOLDOWN') {
        // A code was already sent (e.g. the page was reopened): resume it instead of failing.
        const live = session ? null : await client.order().then((o) => o.otp, () => null);
        if (live) setSession({ id: live.otpSessionId, expiresAt: live.expiresAt, resendAvailableAt: live.resendAvailableAt, resendsLeft: live.resendsLeft });
        else setSendError('لطفاً پیش از درخواست کد جدید کمی صبر کنید.');
      } else setSendError(handleError(e, () => void send()));
    } finally {
      setSending(false);
    }
  }, [client, handleError, session]);

  useEffect(() => {
    // Send once on entry unless a live code already exists (page reload); later sends are explicit.
    if (started.current || session) return;
    started.current = true;
    void send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!order.demoMode || !session) return;
    void client.demoSms().then((msgs) => setDemo(msgs[0]?.text ?? null)).catch(() => undefined);
  }, [client, order.demoMode, session]);

  const verify = async () => {
    const c = toAsciiDigits(code);
    if (!/^\d{5}$/.test(c)) {
      setError('کد ۵ رقمی را وارد کنید.');
      return;
    }
    if (!session) return;
    setVerifying(true);
    setError(null);
    try {
      const r = await client.verifyOtp(order.version, session.id, c);
      setOrder(r.order);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'OTP_INVALID') {
        setError(`کد واردشده نادرست است. ${e.details?.attemptsLeft ? `${e.details.attemptsLeft} تلاش دیگر باقی مانده است.` : ''}`);
      } else setError(handleError(e, () => void verify()));
    } finally {
      setVerifying(false);
    }
  };

  const expired = ttl === 0;
  return (
    <CheckoutLayout
      title="تأیید شماره موبایل"
      footer={
        <Button block onClick={() => void verify()} pending={verifying} disabled={!session || expired}>
          تأیید
        </Button>
      }
    >
      <p className="bon-body-large">
        کد ۵ رقمی ارسال‌شده به <bdi className="ltr">{order.maskedPhone}</bdi> را وارد کنید.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
      >
        <TextField
          label="کد تأیید"
          className="field__control otp-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={5}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d۰-۹]/g, ''))}
          error={error}
          help={session && !expired ? `اعتبار کد: ${mmss(ttl ?? 0)}` : undefined}
          dir="ltr"
        />
      </form>
      {expired && <Banner tone="warning">این کد منقضی شده است. کد جدید درخواست کنید.</Banner>}
      {sendError && (
        <Banner tone="error">
          <div className="stack stack--sm">
            <span>{sendError}</span>
            <Button variant="text" size="sm" onClick={() => void send()} pending={sending}>
              تلاش دوباره
            </Button>
          </div>
        </Banner>
      )}
      <div className="row row--between">
        <span className="muted bon-body-medium">کد را دریافت نکردید؟</span>
        <Button variant="text" onClick={() => void send()} pending={sending} disabled={(cooldown ?? 0) > 0 || session?.resendsLeft === 0}>
          {(cooldown ?? 0) > 0 ? `ارسال مجدد تا ${mmss(cooldown ?? 0)}` : 'ارسال مجدد کد'}
        </Button>
      </div>
      {order.demoMode && demo && (
        <Banner tone="warning">
          <span>
            پیامک نمایشی: <bdi>{demo}</bdi>
          </span>
        </Banner>
      )}
    </CheckoutLayout>
  );
}
