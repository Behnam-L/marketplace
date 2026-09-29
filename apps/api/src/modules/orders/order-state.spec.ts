import { ORDER_STATUSES, TERMINAL_ORDER_STATUSES } from '@bajet/contracts';
import { canTransition, ORDER_TRANSITIONS, releasesReservations } from './order-state';

describe('Order state machine (§5.1)', () => {
  it('terminal states have no exits', () => {
    for (const s of TERMINAL_ORDER_STATUSES) expect(ORDER_TRANSITIONS[s]).toEqual([]);
  });

  it('forbids skipping OTP or identity and cancelling busy states', () => {
    expect(canTransition('AwaitingOtp', 'CreditInquiryInProgress')).toBe(false);
    expect(canTransition('AwaitingOtp', 'AwaitingSupplierSelection')).toBe(false);
    expect(canTransition('AwaitingIdentity', 'ReservationInProgress')).toBe(false);
    for (const busy of ['ReservationInProgress', 'CreditInquiryInProgress', 'PaymentVerifying'] as const) {
      expect(canTransition(busy, 'Cancelled')).toBe(false);
    }
    expect(canTransition('AllocationInProgress', 'Expired')).toBe(false);
    expect(canTransition('AllocationInProgress', 'Cancelled')).toBe(false);
  });

  it('allows the documented paths', () => {
    expect(canTransition('AwaitingSupplierSelection', 'AwaitingBankPayment')).toBe(true);
    expect(canTransition('ReservationInProgress', 'CreditInquiryInProgress')).toBe(true);
    expect(canTransition('CancellationRequested', 'PaymentVerifying')).toBe(true);
    expect(canTransition('PaymentVerifying', 'Expired')).toBe(true);
  });

  it('every status has an entry; releases happen on terminal entries and re-inquiry', () => {
    for (const s of ORDER_STATUSES) expect(ORDER_TRANSITIONS[s]).toBeDefined();
    expect(releasesReservations('AwaitingBankPayment', 'Expired')).toBe(true);
    expect(releasesReservations('ReservationInProgress', 'CreditInquiryInProgress')).toBe(true);
    expect(releasesReservations('AwaitingSupplierSelection', 'CreditInquiryInProgress')).toBe(false);
    expect(releasesReservations('AllocationInProgress', 'Completed')).toBe(false);
  });
});
