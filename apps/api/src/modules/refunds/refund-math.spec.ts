import { splitRefund } from './refund-math';

const order = {
  totalAmount: 20_000_000,
  cashAmount: 5_000_000,
  commissionAmount: 600_000,
  providers: [
    { providerId: 'p1', creditAmount: 6_000_000, marginAmount: 60_000 },
    { providerId: 'p2', creditAmount: 9_000_000, marginAmount: 135_000 },
  ],
};

describe('BR-RFD-02 refund split', () => {
  it('matches the PRD example (refund 3,000,000)', () => {
    const r = splitRefund(order, 0, 3_000_000);
    expect(r.cash).toBe(750_000);
    expect(r.providers).toEqual([
      { providerId: 'p1', amount: 900_000, margin: 9_000 },
      { providerId: 'p2', amount: 1_350_000, margin: 20_250 },
    ]);
    expect(r.merchantMargin).toBe(90_000);
    // Resulting obligations (BR-RFD-03).
    expect(3_000_000 - r.merchantMargin).toBe(2_910_000);
    expect(r.providers.map((p) => p.amount - p.margin)).toEqual([891_000, 1_329_750]);
  });

  it('partial refunds add up exactly to the originals', () => {
    const parts = [1_234_567, 7_777_777, 3, 10_987_653];
    let prev = 0;
    const sum = { cash: 0, m: 0, p1: 0, p2: 0, pm1: 0, pm2: 0 };
    for (const a of parts) {
      const r = splitRefund(order, prev, a);
      expect(r.cash + r.providers[0].amount + r.providers[1].amount).toBe(a);
      sum.cash += r.cash;
      sum.m += r.merchantMargin;
      sum.p1 += r.providers[0].amount;
      sum.p2 += r.providers[1].amount;
      sum.pm1 += r.providers[0].margin;
      sum.pm2 += r.providers[1].margin;
      prev += a;
    }
    expect(sum).toEqual({ cash: 5_000_000, m: 600_000, p1: 6_000_000, p2: 9_000_000, pm1: 60_000, pm2: 135_000 });
  });
});
