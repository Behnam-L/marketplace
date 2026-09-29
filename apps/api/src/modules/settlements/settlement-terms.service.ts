import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { applyBpsHalfUp, tehranDateOf } from '@bajet/contracts';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { PlansService } from './plans.service';
import type { SettlementTermsSnapshot } from './snapshot';

export interface SnapshotInput {
  completedAt: Date;
  totalAmount: number;
  cashAmount: number;
  gatewayCode: string | null;
  merchant: { merchantId: string; planId: string };
  providers: { providerId: string; planId: string; creditAmount: number }[];
}

/** Freezes settlement terms at completion so later plan edits affect only future orders (D-13). */
@Injectable()
export class SettlementTermsService {
  constructor(
    private readonly plans: PlansService,
    private readonly settings: SystemSettingsService,
  ) {}

  async buildSnapshot(m: EntityManager, input: SnapshotInput): Promise<SettlementTermsSnapshot> {
    const mp = await this.plans.merchantPlanRow(input.merchant.planId, m);
    if (!mp) throw new Error(`Merchant plan ${input.merchant.planId} missing`);
    const delay = await this.settings.get('merchantCashSettlementDelayDays', m);
    const providers: SettlementTermsSnapshot['providers'] = {};
    for (const p of input.providers) {
      const pp = await this.plans.providerPlanRow(p.planId, m);
      if (!pp) throw new Error(`Provider plan ${p.planId} missing`);
      providers[p.providerId] = {
        planId: pp.id,
        planNumber: pp.planNumber,
        providerPayableMarginBps: pp.providerPayableMarginBps,
        installmentCount: pp.installmentCount,
        maturityRule: pp.maturityRule,
        creditAmount: p.creditAmount,
        marginAmount: applyBpsHalfUp(p.creditAmount, pp.providerPayableMarginBps),
      };
    }
    return {
      completedAt: input.completedAt.toISOString(),
      completedDate: tehranDateOf(input.completedAt),
      totalAmount: input.totalAmount,
      cashAmount: input.cashAmount,
      gatewayCode: input.gatewayCode,
      merchant: {
        merchantId: input.merchant.merchantId,
        planId: mp.id,
        planNumber: mp.planNumber,
        merchantReceivableMarginBps: mp.merchantReceivableMarginBps,
        cashSettlementEnabled: mp.cashSettlementEnabled,
        cashSettlementBps: mp.cashSettlementBps,
        installmentCount: mp.installmentCount,
        maturityRule: mp.maturityRule,
        cashSettlementDelayDays: delay,
        commissionAmount: applyBpsHalfUp(input.totalAmount, mp.merchantReceivableMarginBps),
      },
      providers,
    };
  }
}
