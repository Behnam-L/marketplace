import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { MerchantPlanDto, MerchantPlanInput, ProviderPlanDto, ProviderPlanInput } from '@bajet/contracts';
import { AppError, notFound, stateChanged, validationError } from '../../shared/errors/app-error';
import { newId } from '../../shared/util/ids';
import { MerchantSettlementPlan, ProviderSettlementPlan } from './settlement.entity';
import { nextPlanNumber } from './sequences';

export type PlanUsageCounter = (planId: string) => Promise<number>;

/** FR-100 settlement plans: editable and audited; referenced plans are archived, never deleted. */
@Injectable()
export class PlansService {
  private providerUsage: PlanUsageCounter = () => Promise.resolve(0);
  private merchantUsage: PlanUsageCounter = () => Promise.resolve(0);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  registerUsage(kind: 'provider' | 'merchant', counter: PlanUsageCounter): void {
    if (kind === 'provider') this.providerUsage = counter;
    else this.merchantUsage = counter;
  }

  private async providerDto(p: ProviderSettlementPlan): Promise<ProviderPlanDto> {
    return {
      id: p.id,
      planNumber: p.planNumber,
      providerPayableMarginBps: p.providerPayableMarginBps,
      installmentCount: p.installmentCount,
      maturityRule: p.maturityRule,
      status: p.status,
      inUse: (await this.providerUsage(p.id)) > 0,
      version: p.version,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private async merchantDto(p: MerchantSettlementPlan): Promise<MerchantPlanDto> {
    return {
      id: p.id,
      planNumber: p.planNumber,
      merchantReceivableMarginBps: p.merchantReceivableMarginBps,
      cashSettlementEnabled: p.cashSettlementEnabled,
      cashSettlementBps: p.cashSettlementBps,
      installmentCount: p.installmentCount,
      maturityRule: p.maturityRule,
      status: p.status,
      inUse: (await this.merchantUsage(p.id)) > 0,
      version: p.version,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private validateMerchant(input: MerchantPlanInput): void {
    if (!input.cashSettlementEnabled && input.cashSettlementBps !== null && input.cashSettlementBps !== undefined) {
      throw validationError('cashSettlementBps', 'Cash settlement percentage only applies when cash settlement is enabled.');
    }
    if (input.cashSettlementEnabled) {
      const b = input.cashSettlementBps;
      if (b === null || b === undefined || !Number.isInteger(b) || b < 100 || b > 10000) {
        throw validationError('cashSettlementBps', 'Cash settlement percentage must be between 1% and 100%.');
      }
    }
  }

  async listProvider(status?: string): Promise<ProviderPlanDto[]> {
    const rows = await this.ds.manager.find(ProviderSettlementPlan, { where: status ? { status: status as 'Active' } : {}, order: { createdAt: 'DESC' } });
    return Promise.all(rows.map((r) => this.providerDto(r)));
  }

  async listMerchant(status?: string): Promise<MerchantPlanDto[]> {
    const rows = await this.ds.manager.find(MerchantSettlementPlan, { where: status ? { status: status as 'Active' } : {}, order: { createdAt: 'DESC' } });
    return Promise.all(rows.map((r) => this.merchantDto(r)));
  }

  async getProvider(id: string, m: EntityManager = this.ds.manager): Promise<ProviderPlanDto> {
    const p = await m.findOne(ProviderSettlementPlan, { where: { id } });
    if (!p) throw notFound('Plan');
    return this.providerDto(p);
  }

  async getMerchant(id: string, m: EntityManager = this.ds.manager): Promise<MerchantPlanDto> {
    const p = await m.findOne(MerchantSettlementPlan, { where: { id } });
    if (!p) throw notFound('Plan');
    return this.merchantDto(p);
  }

  async createProvider(input: ProviderPlanInput): Promise<ProviderPlanDto> {
    const id = newId('pln');
    await this.ds.transaction(async (m) => {
      await m.insert(ProviderSettlementPlan, { id, ...input, planNumber: await nextPlanNumber(m, 'PP'), status: 'Active', version: 1 });
    });
    return this.getProvider(id);
  }

  async createMerchant(input: MerchantPlanInput): Promise<MerchantPlanDto> {
    this.validateMerchant(input);
    const id = newId('pln');
    await this.ds.transaction(async (m) => {
      await m.insert(MerchantSettlementPlan, {
        id,
        ...input,
        cashSettlementBps: input.cashSettlementEnabled ? input.cashSettlementBps : null,
        planNumber: await nextPlanNumber(m, 'MP'),
        status: 'Active',
        version: 1,
      });
    });
    return this.getMerchant(id);
  }

  async updateProvider(id: string, input: Partial<ProviderPlanInput>, expectedVersion?: number): Promise<{ before: ProviderPlanDto; after: ProviderPlanDto }> {
    const before = await this.getProvider(id);
    if (before.status === 'Archived') throw new AppError('PLAN_ARCHIVED', 'Archived plans cannot be edited.');
    const r = await this.ds.manager
      .createQueryBuilder()
      .update(ProviderSettlementPlan)
      .set({ ...input, version: () => 'version + 1' })
      .where('id = :id AND version = :v', { id, v: expectedVersion ?? before.version })
      .execute();
    if (!r.affected) throw stateChanged();
    return { before, after: await this.getProvider(id) };
  }

  async updateMerchant(id: string, input: Partial<MerchantPlanInput>, expectedVersion?: number): Promise<{ before: MerchantPlanDto; after: MerchantPlanDto }> {
    const before = await this.getMerchant(id);
    if (before.status === 'Archived') throw new AppError('PLAN_ARCHIVED', 'Archived plans cannot be edited.');
    const merged: MerchantPlanInput = {
      merchantReceivableMarginBps: input.merchantReceivableMarginBps ?? before.merchantReceivableMarginBps,
      cashSettlementEnabled: input.cashSettlementEnabled ?? before.cashSettlementEnabled,
      cashSettlementBps: input.cashSettlementBps !== undefined ? input.cashSettlementBps : before.cashSettlementBps,
      installmentCount: input.installmentCount ?? before.installmentCount,
      maturityRule: input.maturityRule ?? before.maturityRule,
    };
    if (input.cashSettlementEnabled === false && input.cashSettlementBps === undefined) merged.cashSettlementBps = null;
    this.validateMerchant(merged);
    const r = await this.ds.manager
      .createQueryBuilder()
      .update(MerchantSettlementPlan)
      .set({ ...merged, version: () => 'version + 1' })
      .where('id = :id AND version = :v', { id, v: expectedVersion ?? before.version })
      .execute();
    if (!r.affected) throw stateChanged();
    return { before, after: await this.getMerchant(id) };
  }

  async archive(kind: 'provider' | 'merchant', id: string): Promise<ProviderPlanDto | MerchantPlanDto> {
    const entity = kind === 'provider' ? ProviderSettlementPlan : MerchantSettlementPlan;
    const r = await this.ds.manager.update(entity, { id, status: 'Active' }, { status: 'Archived', version: () => 'version + 1' });
    if (!r.affected) {
      if (!(await this.ds.manager.exists(entity, { where: { id } }))) throw notFound('Plan');
      throw stateChanged();
    }
    return kind === 'provider' ? this.getProvider(id) : this.getMerchant(id);
  }

  /** Assignment requires an existing, active plan (422 PLAN_ARCHIVED). */
  async assertAssignable(kind: 'provider' | 'merchant', id: string, m: EntityManager = this.ds.manager): Promise<void> {
    const entity = kind === 'provider' ? ProviderSettlementPlan : MerchantSettlementPlan;
    const p = await m.findOne(entity, { where: { id } });
    const field = kind === 'provider' ? 'providerSettlementPlanId' : 'merchantSettlementPlanId';
    if (!p) throw validationError(field, 'Settlement plan not found.');
    if (p.status === 'Archived') throw new AppError('PLAN_ARCHIVED', 'Archived plans cannot be assigned.', { field });
  }

  planNumber(kind: 'provider' | 'merchant', id: string): Promise<string | null> {
    const entity = kind === 'provider' ? ProviderSettlementPlan : MerchantSettlementPlan;
    return this.ds.manager.findOne(entity, { where: { id } }).then((p) => p?.planNumber ?? null);
  }

  providerPlanRow(id: string, m: EntityManager): Promise<ProviderSettlementPlan | null> {
    return m.findOne(ProviderSettlementPlan, { where: { id } });
  }

  merchantPlanRow(id: string, m: EntityManager): Promise<MerchantSettlementPlan | null> {
    return m.findOne(MerchantSettlementPlan, { where: { id } });
  }
}
