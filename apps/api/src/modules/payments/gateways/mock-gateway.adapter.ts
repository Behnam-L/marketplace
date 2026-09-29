import { randomBytes } from 'node:crypto';
import { tehranDateOf } from '@bajet/contracts';
import {
  GatewayAdapter,
  GatewayInitResult,
  GatewayUnavailableError,
  InquiryResult,
  ParsedCallback,
  SettlementReportLine,
  VerifyResult,
} from './gateway-adapter';

export interface MockPayment {
  token: string;
  ref: string;
  amountRial: number;
  callbackUrl: string;
  state: 'Created' | 'Paid' | 'Failed' | 'Cancelled' | 'Verified' | 'Reversed';
  gatewayReference: string | null;
  cardMask: string | null;
  paidAt: Date | null;
}

export interface MockGatewayBehaviour {
  down?: boolean;
  failOps?: ('initiate' | 'verify' | 'inquiry' | 'reverse' | 'refund')[];
  rejectVerify?: boolean;
  /** Paid amount differs from the requested amount (tamper / partial capture). */
  payAmountOverrideRial?: number;
}

/**
 * Offline PSP simulation. Payments are made on a demo page served by the API at
 * `/v1/mock-gateway/{token}`; unverified payments auto-reverse at the PSP (S-02).
 */
export class MockGatewayAdapter implements GatewayAdapter {
  behaviour: MockGatewayBehaviour = {};
  readonly payments = new Map<string, MockPayment>();
  private readonly byRef = new Map<string, string>();
  private readonly refunds = new Map<string, { gatewayReference: string; amountRial: number }>();

  constructor(
    readonly code: string,
    private readonly publicApiUrl: string,
    private readonly supportsReverse: boolean,
  ) {}

  private gate(op: NonNullable<MockGatewayBehaviour['failOps']>[number]): void {
    if (this.behaviour.down || this.behaviour.failOps?.includes(op)) throw new GatewayUnavailableError(`${this.code} ${op} unavailable`);
  }

  initiate(input: { ref: string; amountRial: number; callbackUrl: string }): Promise<GatewayInitResult> {
    this.gate('initiate');
    const existing = this.byRef.get(input.ref);
    const token = existing ?? randomBytes(12).toString('hex');
    if (!existing) {
      this.payments.set(token, { token, ref: input.ref, amountRial: input.amountRial, callbackUrl: input.callbackUrl, state: 'Created', gatewayReference: null, cardMask: null, paidAt: null });
      this.byRef.set(input.ref, token);
    }
    return Promise.resolve({ token, redirect: { url: `${this.publicApiUrl}/v1/mock-gateway/${this.code}/${token}`, method: 'GET', fields: {} } });
  }

  /** Called by the demo payment page. Returns the callback form data. */
  complete(token: string, action: 'pay' | 'fail' | 'cancel'): { callbackUrl: string; fields: Record<string, string> } | null {
    const p = this.payments.get(token);
    if (!p) return null;
    if (p.state === 'Created') {
      if (action === 'pay') {
        p.state = 'Paid';
        p.gatewayReference = `RRN${Date.now()}${randomBytes(2).toString('hex')}`;
        p.cardMask = '603799******1234';
        p.paidAt = new Date();
        if (this.behaviour.payAmountOverrideRial !== undefined) p.amountRial = this.behaviour.payAmountOverrideRial;
      } else {
        p.state = action === 'fail' ? 'Failed' : 'Cancelled';
      }
    }
    const status = p.state === 'Paid' || p.state === 'Verified' ? 'OK' : p.state === 'Cancelled' ? 'CANCELED' : 'NOK';
    return {
      callbackUrl: p.callbackUrl,
      fields: { ref: p.ref, token: p.token, status, amount: String(p.amountRial), rrn: p.gatewayReference ?? '' },
    };
  }

  parseCallback(payload: Record<string, unknown>): ParsedCallback | null {
    const ref = typeof payload.ref === 'string' ? payload.ref : null;
    if (!ref) return null;
    const s = String(payload.status ?? '');
    const amount = Number(payload.amount);
    return {
      ref,
      reported: s === 'OK' ? 'Success' : s === 'CANCELED' ? 'Cancelled' : 'Failed',
      amountRial: Number.isFinite(amount) ? amount : null,
    };
  }

  verify(input: { ref: string; token: string }): Promise<VerifyResult> {
    this.gate('verify');
    const p = this.payments.get(input.token);
    if (!p || p.ref !== input.ref) return Promise.resolve({ status: 'Failed', reason: 'UNKNOWN_PAYMENT' });
    if (this.behaviour.rejectVerify) return Promise.resolve({ status: 'Failed', reason: 'REJECTED' });
    if (p.state === 'Paid' || p.state === 'Verified') {
      p.state = 'Verified';
      return Promise.resolve({ status: 'Success', amountRial: p.amountRial, gatewayReference: p.gatewayReference!, cardMask: p.cardMask });
    }
    return Promise.resolve({ status: 'Failed', reason: `STATE_${p.state.toUpperCase()}` });
  }

  inquiry(input: { ref: string; token: string }): Promise<InquiryResult> {
    this.gate('inquiry');
    const p = this.payments.get(input.token);
    if (!p) return Promise.resolve({ status: 'Unpaid' });
    if (p.state === 'Created') return Promise.resolve({ status: 'Pending' });
    if (p.state === 'Paid' || p.state === 'Verified') {
      return Promise.resolve({ status: 'Paid', amountRial: p.amountRial, gatewayReference: p.gatewayReference!, cardMask: p.cardMask });
    }
    if (p.state === 'Reversed') return Promise.resolve({ status: 'Reversed' });
    return Promise.resolve({ status: 'Unpaid' });
  }

  reverse(input: { ref: string; token: string }): Promise<void> {
    this.gate('reverse');
    if (!this.supportsReverse) throw new Error('reverse not supported');
    const p = this.payments.get(input.token);
    if (p && (p.state === 'Paid' || p.state === 'Verified')) p.state = 'Reversed';
    return Promise.resolve();
  }

  refund(input: { ref: string; amountRial: number; originalReference: string | null }): Promise<{ status: 'Success'; gatewayReference: string } | { status: 'Failed'; reason: string }> {
    this.gate('refund');
    const prior = this.refunds.get(input.ref);
    if (prior) return Promise.resolve({ status: 'Success', gatewayReference: prior.gatewayReference });
    const gatewayReference = `RFN${Date.now()}${randomBytes(2).toString('hex')}`;
    this.refunds.set(input.ref, { gatewayReference, amountRial: input.amountRial });
    return Promise.resolve({ status: 'Success', gatewayReference });
  }

  /** Verified (captured) payments of a day; fee = 0.1 % (demo). */
  settlementReport(date: string): Promise<SettlementReportLine[]> {
    this.gate('inquiry');
    const out: SettlementReportLine[] = [];
    for (const p of this.payments.values()) {
      if (p.state !== 'Verified' || !p.paidAt || tehranDateOf(p.paidAt) !== date) continue;
      out.push({ gatewayReference: p.gatewayReference!, amountRial: p.amountRial, feeRial: Math.floor(p.amountRial / 1000), date });
    }
    return Promise.resolve(out);
  }

  isHealthy(): boolean {
    return !this.behaviour.down;
  }
}
