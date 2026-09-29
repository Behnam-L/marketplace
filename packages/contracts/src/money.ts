/**
 * Shared pure money rules (BR-MNY, BR-RND, BR-CALC). Integer Toman only.
 * The API is authoritative; the UI may use these for previews (BR-CALC-04).
 */

function assertInt(n: number, name: string): void {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${name} must be a safe integer`);
}

/** half-up: (x·bps + 5000) div 10000 (BR-RND). x ≥ 0. */
export function applyBpsHalfUp(x: number, bps: number): number {
  assertInt(x, 'x');
  assertInt(bps, 'bps');
  if (x < 0 || bps < 0) throw new RangeError('negative input');
  // Use BigInt to stay exact for large x·bps.
  return Number((BigInt(x) * BigInt(bps) + 5000n) / 10000n);
}

/** roundHalfUp(a·b / c) for non-negative integers, exact. */
export function mulDivHalfUp(a: number, b: number, c: number): number {
  assertInt(a, 'a');
  assertInt(b, 'b');
  assertInt(c, 'c');
  if (c <= 0) throw new RangeError('divisor must be positive');
  const num = BigInt(a) * BigInt(b);
  return Number((2n * num + BigInt(c)) / (2n * BigInt(c)));
}

/** BR-CALC-01 cash split. */
export function splitCash(totalAmount: number, cashPaymentBps: number, cashOnly: boolean): { cashAmount: number; creditAmount: number } {
  assertInt(totalAmount, 'totalAmount');
  if (cashOnly) return { cashAmount: totalAmount, creditAmount: 0 };
  const cashAmount = applyBpsHalfUp(totalAmount, cashPaymentBps);
  return { cashAmount, creditAmount: totalAmount - cashAmount };
}

export interface WeightedSource {
  id: string;
  weight: number;
}

/**
 * Largest-remainder distribution (BR-CALC-02 step 3): distribute `k` across sources
 * proportionally to their weights. Ties: larger fractional part, then larger weight,
 * then id ascending. Requires Σweight ≥ k. Result shares never exceed weights.
 */
export function largestRemainder(k: number, sources: WeightedSource[]): Map<string, number> {
  assertInt(k, 'k');
  const positive = sources.filter((s) => s.weight > 0);
  const total = positive.reduce((acc, s) => acc + BigInt(s.weight), 0n);
  const out = new Map<string, number>();
  for (const s of sources) out.set(s.id, 0);
  if (k === 0 || positive.length === 0) return out;
  if (total < BigInt(k)) throw new RangeError('insufficient total weight');
  if (total === BigInt(k)) {
    for (const s of positive) out.set(s.id, s.weight);
    return out;
  }
  const K = BigInt(k);
  const rows = positive.map((s) => {
    const num = K * BigInt(s.weight);
    return { id: s.id, weight: s.weight, share: num / total, rem: num % total };
  });
  let distributed = rows.reduce((acc, r) => acc + r.share, 0n);
  rows.sort((a, b) => {
    if (a.rem !== b.rem) return a.rem > b.rem ? -1 : 1;
    if (a.weight !== b.weight) return b.weight - a.weight;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  let i = 0;
  while (distributed < K) {
    rows[i % rows.length].share += 1n;
    distributed += 1n;
    i++;
  }
  for (const r of rows) out.set(r.id, Number(r.share));
  return out;
}

export interface CreditSource {
  providerId: string;
  availableAmount: number;
}

export type AllocationResult =
  | { ok: true; allocations: { providerId: string; amount: number }[] }
  | { ok: false; code: 'INSUFFICIENT_CREDIT' | 'NO_SELECTION' };

/** BR-CALC-02 supplier allocation. Providers with a zero share are omitted (step 4). */
export function allocateCredit(creditAmount: number, selected: CreditSource[]): AllocationResult {
  if (creditAmount === 0) return { ok: true, allocations: [] };
  const usable = selected.filter((s) => s.availableAmount > 0);
  if (selected.length === 0) return { ok: false, code: 'NO_SELECTION' };
  const sum = usable.reduce((acc, s) => acc + s.availableAmount, 0);
  if (creditAmount > sum) return { ok: false, code: 'INSUFFICIENT_CREDIT' };
  const shares = largestRemainder(
    creditAmount,
    usable.map((s) => ({ id: s.providerId, weight: s.availableAmount })),
  );
  const allocations = usable
    .map((s) => ({ providerId: s.providerId, amount: shares.get(s.providerId) ?? 0 }))
    .filter((a) => a.amount > 0);
  return { ok: true, allocations };
}

/** Installment split: floor(X/N) each, remainder on the last (BR-RND). */
export function splitInstallments(amount: number, count: number): number[] {
  assertInt(amount, 'amount');
  assertInt(count, 'count');
  if (count < 1) throw new RangeError('count must be ≥ 1');
  const base = Math.floor(amount / count);
  const out = Array.from({ length: count }, () => base);
  out[count - 1] = amount - base * (count - 1);
  return out;
}

/** Inbound Rial → Toman: floor(rial / 10); negative → 0 (BR-MNY-03, FR-030 AC3). */
export function rialToToman(rial: number): number {
  if (!Number.isFinite(rial) || rial <= 0) return 0;
  return Math.floor(Math.floor(rial) / 10);
}

export function tomanToRial(toman: number): number {
  assertInt(toman, 'toman');
  return toman * 10;
}

/** Provider balance normalisation: floor, negative → 0. */
export function normaliseBalance(toman: number): number {
  if (!Number.isFinite(toman) || toman <= 0) return 0;
  return Math.floor(toman);
}
