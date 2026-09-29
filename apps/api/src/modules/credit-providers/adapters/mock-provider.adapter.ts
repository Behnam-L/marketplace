import { createHash } from 'node:crypto';
import { tehranDateOf } from '@bajet/contracts';
import {
  ConsumerKey,
  InquiryResult,
  OperationResult,
  ProviderAdapter,
  ProviderUnavailableError,
  StatementLine,
  StatusResult,
} from './provider-adapter';

/** Controls for tests and demos: failure modes and fixed balances. */
export interface MockBehaviour {
  /** Every call throws ProviderUnavailableError. */
  down?: boolean;
  /** Added latency (ms) on every call. */
  latencyMs?: number;
  /** Operations that fail with an unknown outcome (the effect is NOT applied). */
  failOps?: ('inquire' | 'reserve' | 'allocate' | 'release' | 'reverse')[];
  /** Operations that time out AFTER applying the effect (unknown outcome, applied). */
  timeoutAfterApplyOps?: ('reserve' | 'allocate' | 'release' | 'reverse')[];
  /** Operations the provider rejects definitively. */
  rejectOps?: ('reserve' | 'allocate' | 'reverse')[];
  /** Fixed balance by consumer key value (overrides the deterministic default). */
  balances?: Record<string, number>;
  /** Consumer keys with no account. */
  noAccount?: string[];
}

interface Hold {
  key: string;
  amount: number;
  state: 'Active' | 'Allocated' | 'Released';
  reversed: number;
}

interface Op {
  ref: string;
  op: StatementLine['operation'];
  amount: number;
  at: Date;
  target: string;
}

/**
 * In-memory provider simulation. The provider is the balance authority (D-12): it
 * enforces available balance atomically (single-threaded JS) and keeps holds until
 * released. Balances are deterministic per (provider, consumer) so demos are stable.
 */
export class MockProviderAdapter implements ProviderAdapter {
  behaviour: MockBehaviour = {};
  private readonly holds = new Map<string, Hold>();
  private readonly ops = new Map<string, Op>();
  private readonly results = new Map<string, OperationResult>();

  constructor(private readonly providerId: string) {}

  private async gate(op: NonNullable<MockBehaviour['failOps']>[number] | 'status' | 'statement' | 'probe'): Promise<void> {
    if (this.behaviour.latencyMs) await new Promise((r) => setTimeout(r, this.behaviour.latencyMs));
    if (this.behaviour.down) throw new ProviderUnavailableError('provider unavailable');
    if ((this.behaviour.failOps as string[] | undefined)?.includes(op)) throw new ProviderUnavailableError(`${op} failed`);
  }

  private baseBalance(key: string): number {
    const fixed = this.behaviour.balances?.[key];
    if (fixed !== undefined) return fixed;
    const h = createHash('sha256').update(`${this.providerId}:${key}`).digest();
    // 2,000,000 … 40,000,000 Toman in steps of 10,000.
    return 2_000_000 + (h.readUInt32BE(0) % 3801) * 10_000;
  }

  private available(key: string): number {
    let used = 0;
    for (const h of this.holds.values()) {
      if (h.key !== key) continue;
      if (h.state === 'Active' || h.state === 'Allocated') used += h.amount - h.reversed;
    }
    return this.baseBalance(key) - used;
  }

  private afterApply(op: 'reserve' | 'allocate' | 'release' | 'reverse', ref: string, result: OperationResult): OperationResult {
    this.results.set(ref, result);
    if (this.behaviour.timeoutAfterApplyOps?.includes(op)) throw new ProviderUnavailableError(`${op} timed out`);
    return result;
  }

  async inquire(key: ConsumerKey): Promise<InquiryResult> {
    await this.gate('inquire');
    if (this.behaviour.noAccount?.includes(key.value)) return { kind: 'NoAccount' };
    return { kind: 'Ok', availableAmount: this.available(key.value) };
  }

  async reserve(ref: string, key: ConsumerKey, amount: number): Promise<OperationResult> {
    await this.gate('reserve');
    const prior = this.results.get(ref);
    if (prior) return prior;
    if (this.behaviour.rejectOps?.includes('reserve') || this.behaviour.noAccount?.includes(key.value)) {
      return this.afterApply('reserve', ref, { status: 'Rejected', reason: 'REJECTED' });
    }
    if (amount > this.available(key.value)) return this.afterApply('reserve', ref, { status: 'Rejected', reason: 'INSUFFICIENT_BALANCE' });
    this.holds.set(ref, { key: key.value, amount, state: 'Active', reversed: 0 });
    this.ops.set(ref, { ref, op: 'reserve', amount, at: new Date(), target: ref });
    return this.afterApply('reserve', ref, { status: 'Confirmed', providerReference: `MOCK-R-${ref.slice(-10)}` });
  }

  async allocate(ref: string, reservationRef: string): Promise<OperationResult> {
    await this.gate('allocate');
    const prior = this.results.get(ref);
    if (prior) return prior;
    const hold = this.holds.get(reservationRef);
    if (this.behaviour.rejectOps?.includes('allocate') || !hold || hold.state === 'Released') {
      return this.afterApply('allocate', ref, { status: 'Rejected', reason: 'NO_ACTIVE_HOLD' });
    }
    hold.state = 'Allocated';
    this.ops.set(ref, { ref, op: 'allocate', amount: hold.amount, at: new Date(), target: reservationRef });
    return this.afterApply('allocate', ref, { status: 'Confirmed', providerReference: `MOCK-A-${ref.slice(-10)}` });
  }

  /** Releasing an unknown reference succeeds (BR-PRV-03). */
  async release(ref: string, reservationRef: string): Promise<OperationResult> {
    await this.gate('release');
    const prior = this.results.get(ref);
    if (prior) return prior;
    const hold = this.holds.get(reservationRef);
    if (hold && hold.state === 'Active') hold.state = 'Released';
    this.ops.set(ref, { ref, op: 'release', amount: hold?.amount ?? 0, at: new Date(), target: reservationRef });
    return this.afterApply('release', ref, { status: 'Confirmed', providerReference: `MOCK-L-${ref.slice(-10)}` });
  }

  async reverse(ref: string, allocationRef: string, amount: number): Promise<OperationResult> {
    await this.gate('reverse');
    const prior = this.results.get(ref);
    if (prior) return prior;
    const target = this.ops.get(allocationRef)?.target;
    const hold = target ? this.holds.get(target) : undefined;
    if (this.behaviour.rejectOps?.includes('reverse') || !hold || hold.state !== 'Allocated' || hold.reversed + amount > hold.amount) {
      return this.afterApply('reverse', ref, { status: 'Rejected', reason: 'LOAN_CLOSED' });
    }
    hold.reversed += amount;
    this.ops.set(ref, { ref, op: 'reverse', amount, at: new Date(), target: target! });
    return this.afterApply('reverse', ref, { status: 'Confirmed', providerReference: `MOCK-V-${ref.slice(-10)}` });
  }

  async status(ref: string): Promise<StatusResult> {
    await this.gate('status');
    const r = this.results.get(ref);
    if (!r) return 'NotFound';
    return r.status === 'Confirmed' ? 'Confirmed' : 'Rejected';
  }

  async statement(date: string): Promise<StatementLine[]> {
    await this.gate('statement');
    const out: StatementLine[] = [];
    for (const op of this.ops.values()) {
      if (tehranDateOf(op.at) !== date) continue;
      const hold = this.holds.get(op.target);
      out.push({
        reference: op.ref,
        operation: op.op,
        amount: op.amount,
        state: op.op === 'reverse' ? 'Reversed' : (hold?.state ?? 'Released'),
      });
    }
    return out;
  }

  async probe(): Promise<void> {
    await this.gate('probe');
  }
}
