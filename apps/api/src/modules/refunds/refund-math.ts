import { largestRemainder, mulDivHalfUp } from '@bajet/contracts';

export interface OriginalLegs {
  totalAmount: number;
  cashAmount: number;
  providers: { providerId: string; creditAmount: number; marginAmount: number }[];
  commissionAmount: number;
}

export interface RefundSplit {
  cash: number;
  merchantMargin: number;
  providers: { providerId: string; amount: number; margin: number }[];
}

function cumulative(c: number, o: OriginalLegs): { cash: number; providers: Map<string, number> } {
  const shares = largestRemainder(c, [
    { id: '~cash', weight: o.cashAmount },
    ...o.providers.map((p) => ({ id: p.providerId, weight: p.creditAmount })),
  ]);
  return { cash: shares.get('~cash') ?? 0, providers: new Map(o.providers.map((p) => [p.providerId, shares.get(p.providerId) ?? 0])) };
}

/**
 * BR-RFD-02 cumulative pro-rata: legs of refund j = split(Cⱼ) − split(Cⱼ₋₁); margins
 * likewise, so a full refund returns exactly the original legs and margins.
 */
export function splitRefund(o: OriginalLegs, previousCumulative: number, amount: number): RefundSplit {
  const prev = cumulative(previousCumulative, o);
  const next = cumulative(previousCumulative + amount, o);
  const mm = (c: number): number => (o.totalAmount === 0 ? 0 : mulDivHalfUp(c, o.commissionAmount, o.totalAmount));
  return {
    cash: next.cash - prev.cash,
    merchantMargin: mm(previousCumulative + amount) - mm(previousCumulative),
    providers: o.providers.map((p) => {
      const a = next.providers.get(p.providerId)! - prev.providers.get(p.providerId)!;
      const pm = (x: number): number => (p.creditAmount === 0 ? 0 : mulDivHalfUp(x, p.marginAmount, p.creditAmount));
      return { providerId: p.providerId, amount: a, margin: pm(next.providers.get(p.providerId)!) - pm(prev.providers.get(p.providerId)!) };
    }),
  };
}
