import type { CheckoutStep, InquiryOutcome, OrderFailureReason, OrderStatus } from '../enums';
import type { IsoDate, IsoDateTime, RedirectInstruction } from './common';

export interface CheckoutOrderView {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  failureReason: OrderFailureReason | null;
  version: number;
  merchantDisplayName: string;
  totalAmount: number;
  maskedPhone: string;
  sessionExpiresAt: IsoDateTime;
  paymentDeadlineAt: IsoDateTime | null;
  otpVerified: boolean;
  termsAccepted: boolean;
  termsVersion: string;
  step: CheckoutStep;
  /** Shown only after OTP verification. */
  cashAmount: number | null;
  creditAmount: number | null;
  returnUrl: string | null;
  /** Server time, so the client can correct countdowns for clock skew. */
  serverTime: IsoDateTime;
  /** Identity sub-step when step = identity. */
  identityStep: 'check' | 'national-id' | 'dob' | null;
  /** True when the platform runs with mock integrations (demo data must be identifiable). */
  demoMode: boolean;
}

export interface CreateCheckoutSessionRequest {
  checkoutToken: string;
}

export interface AcceptTermsRequest {
  termsVersion: string;
  accepted: true;
}

export interface SendOtpResponse {
  otpSessionId: string;
  expiresAt: IsoDateTime;
  resendAvailableAt: IsoDateTime;
  resendsLeft: number;
}

export interface VerifyOtpRequest {
  otpSessionId: string;
  code: string;
}

export interface NationalIdRequest {
  nationalId: string;
}

export interface NationalIdResponse {
  next: 'dob';
}

export interface DobRequest {
  /** Gregorian ISO date. */
  dateOfBirth: IsoDate;
}

export interface CreditProviderOption {
  providerId: string;
  displayName: string;
  iconUrl: string | null;
  availableAmount: number | null;
  selectable: boolean;
  outcome: InquiryOutcome | 'Pending';
}

export type CreditNotice = 'CREDIT_CHANGED' | 'RESERVATION_FAILED' | null;

export interface CreditResponse {
  inquiryStatus: 'InProgress' | 'Finished' | 'Skipped';
  providers: CreditProviderOption[];
  pendingProviderCount: number;
  cashPaymentBps: number;
  allowCashOnly: boolean;
  inquiryAttemptsLeft: number;
  notice: CreditNotice;
}

export interface QuoteRequest {
  providerIds: string[];
  cashOnly: boolean;
}

export interface QuoteResponse {
  totalAmount: number;
  cashAmount: number;
  creditAmount: number;
  allocations: { providerId: string; amount: number }[];
  quoteHash: string;
}

export interface ConfirmRequest {
  providerIds: string[];
  cashOnly: boolean;
  quoteHash: string;
}

export type ConfirmNext = ({ type: 'redirect' } & RedirectInstruction) | { type: 'poll' };

export interface ConfirmResponse {
  order: CheckoutOrderView;
  next: ConfirmNext;
}

export interface BankPaymentResponse {
  redirect: RedirectInstruction;
}

export interface CancelResponse {
  status: 'Cancelled' | 'CancellationRequested' | OrderStatus;
}

export interface CheckoutResultAllocation {
  providerId: string;
  displayName: string;
  amount: number;
}

export interface CheckoutResultResponse {
  status: OrderStatus;
  failureReason: OrderFailureReason | null;
  orderId: string;
  orderNumber: string;
  merchantDisplayName: string;
  totalAmount: number;
  cashAmount: number;
  creditAmount: number;
  allocations: CheckoutResultAllocation[];
  bankReference: string | null;
  returnUrl: string;
  /** Set when a late payment on this order is being returned (FR-061). */
  latePaymentReference: string | null;
  /** Set when a cancel request lost to a successful payment (FR-045). */
  cancelNotApplied: boolean;
}
