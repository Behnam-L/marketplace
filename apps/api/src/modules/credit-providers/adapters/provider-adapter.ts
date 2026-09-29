/**
 * BR-PRV-04 adapter contract, required of every provider. All operations are
 * idempotent by `ref` (= ProviderTransaction.id). Amounts are integer Toman; an
 * adapter for a Rial-denominated provider converts at this boundary (BR-MNY-03).
 */
export interface ConsumerKey {
  type: 'NationalId' | 'Phone';
  value: string;
}

export type InquiryResult = { kind: 'Ok'; availableAmount: number } | { kind: 'NoAccount' };

export type OperationResult =
  | { status: 'Confirmed'; providerReference: string }
  | { status: 'Rejected'; reason: string };

export type StatusResult = 'Confirmed' | 'Rejected' | 'Pending' | 'NotFound';

export interface StatementLine {
  reference: string;
  operation: 'reserve' | 'allocate' | 'release' | 'reverse';
  amount: number;
  /** Active = hold still open at the provider. */
  state: 'Active' | 'Allocated' | 'Released' | 'Reversed';
}

export interface ProviderAdapter {
  inquire(key: ConsumerKey): Promise<InquiryResult>;
  reserve(ref: string, key: ConsumerKey, amount: number): Promise<OperationResult>;
  allocate(ref: string, reservationRef: string): Promise<OperationResult>;
  release(ref: string, reservationRef: string): Promise<OperationResult>;
  reverse(ref: string, allocationRef: string, amount: number): Promise<OperationResult>;
  status(ref: string): Promise<StatusResult>;
  statement(date: string): Promise<StatementLine[]>;
  probe(): Promise<void>;
}

/** Thrown for transport errors/timeouts/5xx — the outcome is unknown. */
export class ProviderUnavailableError extends Error {}
