/**
 * Canonical enumerations (PRD §5, §6). Declared as `const` objects plus
 * string-literal union types so they work identically in Node and the browser.
 */

function values<T extends Record<string, string>>(o: T): T[keyof T][] {
  return Object.values(o) as T[keyof T][];
}

export const OrderStatus = {
  Initiated: 'Initiated',
  AwaitingOtp: 'AwaitingOtp',
  AwaitingIdentity: 'AwaitingIdentity',
  CreditInquiryInProgress: 'CreditInquiryInProgress',
  AwaitingSupplierSelection: 'AwaitingSupplierSelection',
  ReservationInProgress: 'ReservationInProgress',
  AwaitingBankPayment: 'AwaitingBankPayment',
  PaymentVerifying: 'PaymentVerifying',
  CancellationRequested: 'CancellationRequested',
  AllocationInProgress: 'AllocationInProgress',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  Expired: 'Expired',
  Failed: 'Failed',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
export const ORDER_STATUSES = values(OrderStatus);
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['Completed', 'Cancelled', 'Expired', 'Failed'];
/** States governed by `sessionExpiresAt` (BR-ORD-02). */
export const PRE_CONFIRM_ORDER_STATUSES: readonly OrderStatus[] = [
  'AwaitingOtp',
  'AwaitingIdentity',
  'CreditInquiryInProgress',
  'AwaitingSupplierSelection',
];

export const OrderFailureReason = {
  OTP_LOCKED: 'OTP_LOCKED',
  IDENTITY_LOCKED: 'IDENTITY_LOCKED',
  RESERVATION_FAILED: 'RESERVATION_FAILED',
  CONSUMER_BLOCKED: 'CONSUMER_BLOCKED',
} as const;
export type OrderFailureReason = (typeof OrderFailureReason)[keyof typeof OrderFailureReason];

export const AllocationStatus = {
  NotApplicable: 'NotApplicable',
  Pending: 'Pending',
  Confirmed: 'Confirmed',
  NeedsReconciliation: 'NeedsReconciliation',
} as const;
export type AllocationStatus = (typeof AllocationStatus)[keyof typeof AllocationStatus];
export const ALLOCATION_STATUSES = values(AllocationStatus);

export const RefundStatusOnOrder = { None: 'None', Partial: 'Partial', Full: 'Full' } as const;
export type RefundStatusOnOrder = (typeof RefundStatusOnOrder)[keyof typeof RefundStatusOnOrder];
export const ORDER_REFUND_STATUSES = values(RefundStatusOnOrder);

export const ReservationStatus = {
  Requested: 'Requested',
  Reserved: 'Reserved',
  Failed: 'Failed',
  ReleasePending: 'ReleasePending',
  Released: 'Released',
  AllocationPending: 'AllocationPending',
  Allocated: 'Allocated',
  NeedsReconciliation: 'NeedsReconciliation',
} as const;
export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];

export const BankTransactionType = { Payment: 'Payment', Refund: 'Refund' } as const;
export type BankTransactionType = (typeof BankTransactionType)[keyof typeof BankTransactionType];

export const BankTransactionStatus = {
  Pending: 'Pending',
  Authorized: 'Authorized',
  Success: 'Success',
  Failed: 'Failed',
  Cancelled: 'Cancelled',
  ReversalPending: 'ReversalPending',
  Reversed: 'Reversed',
  NeedsReconciliation: 'NeedsReconciliation',
} as const;
export type BankTransactionStatus = (typeof BankTransactionStatus)[keyof typeof BankTransactionStatus];
export const BANK_TRANSACTION_STATUSES = values(BankTransactionStatus);

export const ProviderTransactionType = {
  Reservation: 'Reservation',
  Allocation: 'Allocation',
  Release: 'Release',
  Reversal: 'Reversal',
} as const;
export type ProviderTransactionType = (typeof ProviderTransactionType)[keyof typeof ProviderTransactionType];
export const PROVIDER_TRANSACTION_TYPES = values(ProviderTransactionType);

export const ProviderTransactionStatus = {
  Pending: 'Pending',
  Confirmed: 'Confirmed',
  Failed: 'Failed',
  Unknown: 'Unknown',
} as const;
export type ProviderTransactionStatus = (typeof ProviderTransactionStatus)[keyof typeof ProviderTransactionStatus];
export const PROVIDER_TRANSACTION_STATUSES = values(ProviderTransactionStatus);

export const OtpSessionStatus = {
  Sent: 'Sent',
  Verified: 'Verified',
  Expired: 'Expired',
  LockedOut: 'LockedOut',
  Superseded: 'Superseded',
} as const;
export type OtpSessionStatus = (typeof OtpSessionStatus)[keyof typeof OtpSessionStatus];

export const DispatchStatus = { Pending: 'Pending', Sent: 'Sent', Failed: 'Failed' } as const;
export type DispatchStatus = (typeof DispatchStatus)[keyof typeof DispatchStatus];

export const IdentityLinkageStatus = {
  PendingVerification: 'PendingVerification',
  Verified: 'Verified',
  Abandoned: 'Abandoned',
  Revoked: 'Revoked',
} as const;
export type IdentityLinkageStatus = (typeof IdentityLinkageStatus)[keyof typeof IdentityLinkageStatus];

export const IdentityAttemptStep = { NationalId: 'NationalId', Dob: 'Dob', Rematch: 'Rematch' } as const;
export type IdentityAttemptStep = (typeof IdentityAttemptStep)[keyof typeof IdentityAttemptStep];

export const IdentityAttemptOutcome = { Match: 'Match', Mismatch: 'Mismatch', Error: 'Error' } as const;
export type IdentityAttemptOutcome = (typeof IdentityAttemptOutcome)[keyof typeof IdentityAttemptOutcome];

export const ConsumerStatus = { Inactive: 'Inactive', Active: 'Active', Blocked: 'Blocked' } as const;
export type ConsumerStatus = (typeof ConsumerStatus)[keyof typeof ConsumerStatus];
export const CONSUMER_STATUSES = values(ConsumerStatus);

export const InquiryOutcome = {
  Ok: 'Ok',
  NoAccount: 'NoAccount',
  Error: 'Error',
  Timeout: 'Timeout',
  Late: 'Late',
} as const;
export type InquiryOutcome = (typeof InquiryOutcome)[keyof typeof InquiryOutcome];

export const InquiryKind = { Initial: 'Initial', Retry: 'Retry', Recheck: 'Recheck' } as const;
export type InquiryKind = (typeof InquiryKind)[keyof typeof InquiryKind];

export const MerchantEntityType = { Individual: 'Individual', Legal: 'Legal' } as const;
export type MerchantEntityType = (typeof MerchantEntityType)[keyof typeof MerchantEntityType];

export const EnabledStatus = { Enabled: 'Enabled', Disabled: 'Disabled' } as const;
export type EnabledStatus = (typeof EnabledStatus)[keyof typeof EnabledStatus];

export const ConnectionStatus = {
  Connected: 'Connected',
  Degraded: 'Degraded',
  Disconnected: 'Disconnected',
} as const;
export type ConnectionStatus = (typeof ConnectionStatus)[keyof typeof ConnectionStatus];
export const CONNECTION_STATUSES = values(ConnectionStatus);

export const InquiryKey = { NationalId: 'NationalId', Phone: 'Phone' } as const;
export type InquiryKey = (typeof InquiryKey)[keyof typeof InquiryKey];

/** Adapter implementations available in this build. Only mocks ship (offline-first). */
export const ProviderAdapterType = { Mock: 'Mock' } as const;
export type ProviderAdapterType = (typeof ProviderAdapterType)[keyof typeof ProviderAdapterType];

export const ApiKeyStatus = { Active: 'Active', Revoked: 'Revoked' } as const;
export type ApiKeyStatus = (typeof ApiKeyStatus)[keyof typeof ApiKeyStatus];

export const GatewayHealth = { Healthy: 'Healthy', Unhealthy: 'Unhealthy' } as const;
export type GatewayHealth = (typeof GatewayHealth)[keyof typeof GatewayHealth];

export const RefundStatus = {
  Requested: 'Requested',
  Processing: 'Processing',
  Completed: 'Completed',
  NeedsReconciliation: 'NeedsReconciliation',
  Rejected: 'Rejected',
  Failed: 'Failed',
} as const;
export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus];
export const REFUND_STATUSES = values(RefundStatus);

export const RefundLegType = { Cash: 'Cash', Credit: 'Credit' } as const;
export type RefundLegType = (typeof RefundLegType)[keyof typeof RefundLegType];

export const RefundLegStatus = {
  Pending: 'Pending',
  Succeeded: 'Succeeded',
  Failed: 'Failed',
  NeedsReconciliation: 'NeedsReconciliation',
} as const;
export type RefundLegStatus = (typeof RefundLegStatus)[keyof typeof RefundLegStatus];

export const RefundInitiator = { Merchant: 'Merchant', Admin: 'Admin' } as const;
export type RefundInitiator = (typeof RefundInitiator)[keyof typeof RefundInitiator];

export const PlanStatus = { Active: 'Active', Archived: 'Archived' } as const;
export type PlanStatus = (typeof PlanStatus)[keyof typeof PlanStatus];

export const MaturityRule = { EndOfJalaliMonth: 'EndOfJalaliMonth' } as const;
export type MaturityRule = (typeof MaturityRule)[keyof typeof MaturityRule];

export const Direction = { Payable: 'Payable', Receivable: 'Receivable' } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export const CounterpartyType = { Merchant: 'Merchant', Provider: 'Provider', Consumer: 'Consumer' } as const;
export type CounterpartyType = (typeof CounterpartyType)[keyof typeof CounterpartyType];

export const DocumentKind = {
  OrderSettlement: 'OrderSettlement',
  CashSettlement: 'CashSettlement',
  Refund: 'Refund',
  Manual: 'Manual',
} as const;
export type DocumentKind = (typeof DocumentKind)[keyof typeof DocumentKind];

export const DocumentStatus = {
  PendingApproval: 'PendingApproval',
  Scheduled: 'Scheduled',
  Matured: 'Matured',
  Invoiced: 'Invoiced',
  Settled: 'Settled',
  Cancelled: 'Cancelled',
  Rejected: 'Rejected',
} as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];
export const DOCUMENT_STATUSES = values(DocumentStatus);

export const ManualDocumentReason = {
  Adjustment: 'Adjustment',
  ReconciliationResolution: 'ReconciliationResolution',
  Other: 'Other',
} as const;
export type ManualDocumentReason = (typeof ManualDocumentReason)[keyof typeof ManualDocumentReason];

export const InvoiceStatus = {
  Generated: 'Generated',
  Sent: 'Sent',
  Overdue: 'Overdue',
  Paid: 'Paid',
  Collected: 'Collected',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];
export const INVOICE_STATUSES = values(InvoiceStatus);

export const ReconciliationItemType = {
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  CASH_WITHOUT_ORDER: 'CASH_WITHOUT_ORDER',
  MISSING_IN_PSP_REPORT: 'MISSING_IN_PSP_REPORT',
  LATE_PAYMENT: 'LATE_PAYMENT',
  ALLOCATION_UNCONFIRMED: 'ALLOCATION_UNCONFIRMED',
  RELEASE_UNCONFIRMED: 'RELEASE_UNCONFIRMED',
  REVERSAL_REJECTED: 'REVERSAL_REJECTED',
  REVERSAL_UNCONFIRMED: 'REVERSAL_UNCONFIRMED',
  BANK_REVERSAL_FAILED: 'BANK_REVERSAL_FAILED',
  REFUND_LEG_FAILED: 'REFUND_LEG_FAILED',
  PROVIDER_STATEMENT_MISMATCH: 'PROVIDER_STATEMENT_MISMATCH',
} as const;
export type ReconciliationItemType = (typeof ReconciliationItemType)[keyof typeof ReconciliationItemType];
export const RECONCILIATION_ITEM_TYPES = values(ReconciliationItemType);

export const ReconciliationSeverity = { Low: 'Low', Medium: 'Medium', High: 'High' } as const;
export type ReconciliationSeverity = (typeof ReconciliationSeverity)[keyof typeof ReconciliationSeverity];

export const ReconciliationStatus = { Open: 'Open', InReview: 'InReview', Resolved: 'Resolved' } as const;
export type ReconciliationStatus = (typeof ReconciliationStatus)[keyof typeof ReconciliationStatus];
export const RECONCILIATION_STATUSES = values(ReconciliationStatus);

export const ResolutionType = {
  Redriven: 'Redriven',
  ManualDocument: 'ManualDocument',
  Reversed: 'Reversed',
  WrittenOff: 'WrittenOff',
  NoActionNeeded: 'NoActionNeeded',
} as const;
export type ResolutionType = (typeof ResolutionType)[keyof typeof ResolutionType];
export const RESOLUTION_TYPES = values(ResolutionType);

export const AdminStatus = { Invited: 'Invited', Active: 'Active', Inactive: 'Inactive' } as const;
export type AdminStatus = (typeof AdminStatus)[keyof typeof AdminStatus];
export const ADMIN_STATUSES = values(AdminStatus);

export const MessageChannel = { SMS: 'SMS' } as const;
export type MessageChannel = (typeof MessageChannel)[keyof typeof MessageChannel];

export const MessageTemplateStatus = { Active: 'Active', Inactive: 'Inactive' } as const;
export type MessageTemplateStatus = (typeof MessageTemplateStatus)[keyof typeof MessageTemplateStatus];

export const MessageStatus = { Queued: 'Queued', Sent: 'Sent', Delivered: 'Delivered', Failed: 'Failed' } as const;
export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];
export const MESSAGE_STATUSES = values(MessageStatus);

export const WebhookEventStatus = {
  Pending: 'Pending',
  Retrying: 'Retrying',
  Delivered: 'Delivered',
  Exhausted: 'Exhausted',
} as const;
export type WebhookEventStatus = (typeof WebhookEventStatus)[keyof typeof WebhookEventStatus];

export const MerchantWebhookEventType = {
  OrderCompleted: 'order.completed',
  OrderCancelled: 'order.cancelled',
  OrderExpired: 'order.expired',
  OrderFailed: 'order.failed',
  RefundCompleted: 'refund.completed',
  RefundFailed: 'refund.failed',
} as const;
export type MerchantWebhookEventType = (typeof MerchantWebhookEventType)[keyof typeof MerchantWebhookEventType];

export const FileKind = { Icon: 'Icon', Contract: 'Contract', Report: 'Report' } as const;
export type FileKind = (typeof FileKind)[keyof typeof FileKind];

export const FileStatus = { Staged: 'Staged', Committed: 'Committed' } as const;
export type FileStatus = (typeof FileStatus)[keyof typeof FileStatus];

export const ScanStatus = { Pending: 'Pending', Clean: 'Clean', Infected: 'Infected' } as const;
export type ScanStatus = (typeof ScanStatus)[keyof typeof ScanStatus];

export const ExportStatus = { Pending: 'Pending', Processing: 'Processing', Ready: 'Ready', Failed: 'Failed' } as const;
export type ExportStatus = (typeof ExportStatus)[keyof typeof ExportStatus];

export const ExportResource = {
  orders: 'orders',
  consumers: 'consumers',
  refunds: 'refunds',
  bankTransactions: 'bank-transactions',
  providerTransactions: 'provider-transactions',
  documents: 'documents',
  invoices: 'invoices',
  reconciliationItems: 'reconciliation-items',
  auditLogs: 'audit-logs',
  messageLogs: 'message-logs',
} as const;
export type ExportResource = (typeof ExportResource)[keyof typeof ExportResource];
export const EXPORT_RESOURCES = values(ExportResource);

/** Consumer checkout screen derived from order status + session (PRD §8.2). */
export const CheckoutStep = {
  landing: 'landing',
  otp: 'otp',
  identity: 'identity',
  credit: 'credit',
  processing: 'processing',
  bankStart: 'bank-start',
  paymentFailed: 'payment-failed',
  return: 'return',
  result: 'result',
  cancelled: 'cancelled',
  expired: 'expired',
  failed: 'failed',
  latePayment: 'late-payment',
} as const;
export type CheckoutStep = (typeof CheckoutStep)[keyof typeof CheckoutStep];
