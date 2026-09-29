import type {
  AllocationStatus,
  MerchantWebhookEventType,
  OrderFailureReason,
  OrderStatus,
  RefundStatus,
  RefundStatusOnOrder,
} from '../enums';
import type { IsoDateTime } from './common';

export type AvailabilityReason =
  | 'MERCHANT_DISABLED'
  | 'AMOUNT_OUT_OF_RANGE'
  | 'NO_PROVIDER'
  | 'NO_BANK_GATEWAY'
  | 'SMS_UNAVAILABLE'
  | 'KILL_SWITCH';

export interface AvailabilityResponse {
  available: boolean;
  degraded: boolean;
  reason?: AvailabilityReason;
  minAmount: number;
  maxAmount: number;
}

export interface CreateCheckoutRequest {
  orderNumber: string;
  amount: number;
  phoneNumber: string;
  returnUrl: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateCheckoutResponse {
  orderId: string;
  checkoutUrl: string;
  status: OrderStatus;
  expiresAt: IsoDateTime;
}

export interface MerchantOrderRefundSummary {
  refundId: string;
  amount: number;
  status: RefundStatus;
  createdAt: IsoDateTime;
}

export interface MerchantOrderResponse {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  failureReason: OrderFailureReason | null;
  totalAmount: number;
  cashAmount: number | null;
  creditAmount: number | null;
  allocationStatus: AllocationStatus | null;
  refundStatus: RefundStatusOnOrder;
  refundedAmount: number;
  completedAt: IsoDateTime | null;
  refunds: MerchantOrderRefundSummary[];
}

export interface CreateRefundRequest {
  amount: number;
  reason: string;
}

export interface CreateRefundResponse {
  refundId: string;
  status: RefundStatus;
}

export interface MerchantRefundResponse {
  refundId: string;
  orderId: string;
  amount: number;
  status: RefundStatus;
}

export interface MerchantWebhookPayload {
  id: string;
  type: MerchantWebhookEventType;
  createdAt: IsoDateTime;
  data: {
    orderId: string;
    orderNumber: string;
    status: OrderStatus;
    failureReason?: OrderFailureReason | null;
    totalAmount: number;
    cashAmount: number | null;
    creditAmount: number | null;
    allocationStatus?: AllocationStatus | null;
    refundId?: string;
    refundAmount?: number;
    refundStatus?: RefundStatus;
  };
}
