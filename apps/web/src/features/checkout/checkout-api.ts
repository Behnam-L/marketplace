import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BankPaymentResponse,
  CancelResponse,
  CheckoutOrderView,
  CheckoutResultResponse,
  ConfirmResponse,
  CreditResponse,
  QuoteResponse,
  RedirectInstruction,
  SendOtpResponse,
} from '@bajet/contracts';
import { ApiError, api, newIdempotencyKey, type RequestOptions } from '../../shared/api/client';

/**
 * Consumer checkout client. The session cookie is re-exchanged silently when it
 * is missing/expired (§8.2 session handling); mutations carry `If-Match`.
 */
export class CheckoutClient {
  constructor(readonly token: string) {}

  exchange(): Promise<{ order: CheckoutOrderView }> {
    return api('/checkout/sessions', { body: { checkoutToken: this.token } });
  }

  private async call<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    try {
      return await api<T>(`/checkout${path}`, opts);
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'UNAUTHENTICATED' || e.code === 'SESSION_EXPIRED')) {
        await this.exchange();
        return api<T>(`/checkout${path}`, opts);
      }
      throw e;
    }
  }

  order = () => this.call<CheckoutOrderView>('/order');
  credit = () => this.call<CreditResponse>('/credit');
  result = () => this.call<CheckoutResultResponse>('/result');
  demoSms = () => this.call<{ text: string; at: string }[]>('/demo/sms');
  acceptTerms = (version: number, termsVersion: string) =>
    this.call<{ order: CheckoutOrderView }>('/terms', { body: { termsVersion, accepted: true }, ifMatch: version });
  sendOtp = () => this.call<SendOtpResponse>('/otp', { body: {} });
  verifyOtp = (version: number, otpSessionId: string, code: string) =>
    this.call<{ order: CheckoutOrderView }>('/otp/verify', { body: { otpSessionId, code }, ifMatch: version });
  identityCheck = (version: number) => this.call<{ order: CheckoutOrderView }>('/identity/check', { body: {}, ifMatch: version });
  nationalId = (version: number, nationalId: string) =>
    this.call<{ next: 'dob'; order: CheckoutOrderView }>('/identity/national-id', { body: { nationalId }, ifMatch: version });
  dob = (version: number, dateOfBirth: string) => this.call<{ order: CheckoutOrderView }>('/identity/dob', { body: { dateOfBirth }, ifMatch: version });
  retryInquiry = (version: number) => this.call<{ order: CheckoutOrderView }>('/credit/inquiries', { body: {}, ifMatch: version });
  quote = (providerIds: string[], cashOnly: boolean) => this.call<QuoteResponse>('/quote', { body: { providerIds, cashOnly } });
  confirm = (version: number, providerIds: string[], cashOnly: boolean, quoteHash: string, idempotencyKey: string) =>
    this.call<ConfirmResponse>('/confirm', { body: { providerIds, cashOnly, quoteHash }, ifMatch: version, idempotencyKey });
  bankPayment = (version: number, idempotencyKey: string) =>
    this.call<BankPaymentResponse>('/bank-payments', { body: {}, ifMatch: version, idempotencyKey });
  cancel = (version: number, idempotencyKey: string) => this.call<CancelResponse>('/cancel', { body: {}, ifMatch: version, idempotencyKey });
}

/** Sends the browser to the gateway (GET with query, or an auto-submitted POST form). */
export function goToGateway(r: RedirectInstruction): void {
  if (r.method === 'GET') {
    const u = new URL(r.url, window.location.origin);
    for (const [k, v] of Object.entries(r.fields)) u.searchParams.set(k, v);
    window.location.assign(u.toString());
    return;
  }
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = r.url;
  for (const [k, v] of Object.entries(r.fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = k;
    input.value = v;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

/** One Idempotency-Key per logical action; regenerated after a definitive answer. */
export function useIdempotencyKey(): [string, () => void] {
  const [key, setKey] = useState(newIdempotencyKey);
  return [key, useCallback(() => setKey(newIdempotencyKey()), [])];
}

/** Calls `fn` every `ms` while `active`. */
export function usePolling(fn: () => void, ms: number, active: boolean): void {
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  }, [fn]);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => saved.current(), ms);
    return () => clearInterval(t);
  }, [ms, active]);
}
