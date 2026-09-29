import { TERMINAL_ORDER_STATUSES, type OrderStatus } from '@bajet/contracts';

/** §5.1 allowed transitions. Anything else → 409 STATE_CHANGED / rejected CAS. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  Initiated: ['AwaitingOtp'],
  AwaitingOtp: ['AwaitingIdentity', 'Failed', 'Expired', 'Cancelled'],
  AwaitingIdentity: ['CreditInquiryInProgress', 'AwaitingSupplierSelection', 'Failed', 'Expired', 'Cancelled'],
  CreditInquiryInProgress: ['AwaitingSupplierSelection', 'Expired'],
  AwaitingSupplierSelection: ['CreditInquiryInProgress', 'ReservationInProgress', 'AwaitingBankPayment', 'Expired', 'Cancelled'],
  ReservationInProgress: ['AwaitingBankPayment', 'AllocationInProgress', 'CreditInquiryInProgress', 'Failed', 'Expired'],
  AwaitingBankPayment: ['PaymentVerifying', 'CancellationRequested', 'Cancelled', 'Expired'],
  PaymentVerifying: ['AllocationInProgress', 'AwaitingBankPayment', 'Expired'],
  CancellationRequested: ['PaymentVerifying', 'Cancelled'],
  AllocationInProgress: ['Completed'],
  Completed: [],
  Cancelled: [],
  Expired: [],
  Failed: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function isTerminal(s: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(s);
}

/** On entering these, every non-terminal reservation is released (§5.1). */
export function releasesReservations(from: OrderStatus, to: OrderStatus): boolean {
  return to === 'Cancelled' || to === 'Expired' || to === 'Failed' || (from === 'ReservationInProgress' && to === 'CreditInquiryInProgress');
}
