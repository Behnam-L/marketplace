import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import {
  isValidEconomicId,
  isValidLegalNationalId,
  normaliseText,
  toAsciiDigits,
  type Page,
  type ProviderDetail,
  type ProviderInput,
  type ProviderListItem,
} from '@bajet/contracts';
import { AppError, notFound, stateChanged, validationError } from '../../shared/errors/app-error';
import { isUniqueViolation } from '../../shared/database/tx';
import { paginate } from '../../shared/database/pagination';
import { newId } from '../../shared/util/ids';
import { FilesService } from '../files/files.service';
import { PlansService } from '../settlements/plans.service';
import { InvoicesService } from '../settlements/invoices.service';
import { CounterpartyRegistry } from '../settlements/counterparties';
import { CreditProvider } from './credit-provider.entity';

export interface ProviderQuery {
  cursor?: string;
  limit?: number;
  displayStatus?: string;
  connectionStatus?: string;
  q?: string;
  sort?: 'createdAt' | 'sortOrder' | 'displayName';
}

export interface InquirableProvider {
  id: string;
  displayName: string;
  iconFileId: string | null;
  inquiryKey: 'NationalId' | 'Phone';
  connectionStatus: 'Connected' | 'Degraded' | 'Disconnected';
  providerSettlementPlanId: string;
  sortOrder: number;
}

/** FR-090/091 credit providers. `connectionStatus` is never admin-editable. */
@Injectable()
export class CreditProvidersService implements OnModuleInit {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly files: FilesService,
    private readonly plans: PlansService,
    private readonly invoices: InvoicesService,
    private readonly counterparties: CounterpartyRegistry,
  ) {}

  onModuleInit(): void {
    this.counterparties.register('Provider', {
      names: (ids) => this.names(ids),
      exists: (id) => this.ds.manager.exists(CreditProvider, { where: { id } }),
    });
    this.plans.registerUsage('provider', (planId) => this.ds.manager.count(CreditProvider, { where: { providerSettlementPlanId: planId } }));
  }

  async names(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.ds.manager.find(CreditProvider, { where: { id: In([...new Set(ids)]) }, select: { id: true, displayName: true } });
    return new Map(rows.map((r) => [r.id, r.displayName]));
  }

  private toInquirable(p: CreditProvider): InquirableProvider {
    return {
      id: p.id,
      displayName: p.displayName,
      iconFileId: p.iconFileId,
      inquiryKey: p.inquiryKey,
      connectionStatus: p.connectionStatus,
      providerSettlementPlanId: p.providerSettlementPlanId,
      sortOrder: p.sortOrder,
    };
  }

  /** FR-030: `displayStatus = Enabled` ∧ `connectionStatus ≠ Disconnected`, read when the inquiry starts. */
  async inquirable(m: EntityManager = this.ds.manager): Promise<InquirableProvider[]> {
    const rows = await m.find(CreditProvider, {
      where: { displayStatus: 'Enabled', connectionStatus: Not('Disconnected') },
      order: { sortOrder: 'ASC', displayName: 'ASC' },
    });
    return rows.map((r) => this.toInquirable(r));
  }

  async byIds(ids: string[], m: EntityManager = this.ds.manager): Promise<InquirableProvider[]> {
    if (!ids.length) return [];
    const rows = await m.find(CreditProvider, { where: { id: In(ids) } });
    return rows.map((r) => this.toInquirable(r));
  }

  iconUrl(fileId: string | null): string | null {
    return this.files.urlFor(fileId, 'Icon');
  }

  private normalise(input: ProviderInput): ProviderInput {
    const out: ProviderInput = {
      ...input,
      legalName: normaliseText(input.legalName),
      displayName: normaliseText(input.displayName),
      officeAddress: normaliseText(input.officeAddress),
      nationalId: toAsciiDigits(input.nationalId.trim()),
      economicId: toAsciiDigits(input.economicId.trim()),
      contactNumber: toAsciiDigits(input.contactNumber.replace(/[\s-]/g, '')),
      iban: toAsciiDigits(input.iban.replace(/\s/g, '')).toUpperCase(),
      credentialsRef: input.credentialsRef.trim(),
    };
    if (!isValidLegalNationalId(out.nationalId)) throw validationError('nationalId', 'Please enter a valid 11-digit legal-entity national ID.');
    if (!isValidEconomicId(out.economicId)) throw validationError('economicId', 'Economic ID must be 11–12 digits.');
    return out;
  }

  private toList(r: CreditProvider): ProviderListItem {
    return {
      id: r.id,
      displayName: r.displayName,
      iconUrl: this.iconUrl(r.iconFileId),
      displayStatus: r.displayStatus,
      connectionStatus: r.connectionStatus,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt.toISOString(),
    };
  }

  list(q: ProviderQuery): Promise<Page<ProviderListItem>> {
    const qb = this.ds.manager.createQueryBuilder(CreditProvider, 'p');
    if (q.displayStatus) qb.andWhere('p.displayStatus = :ds', { ds: q.displayStatus });
    if (q.connectionStatus) qb.andWhere('p.connectionStatus = :cs', { cs: q.connectionStatus });
    if (q.q) qb.andWhere('(p.displayName ILIKE :q OR p.legalName ILIKE :q OR p.nationalId = :exact)', { q: `%${q.q}%`, exact: q.q });
    return paginate(qb, 'p', q, (rows) => {
      const items = rows.map((r) => this.toList(r));
      if (q.sort === 'sortOrder') items.sort((a, b) => a.sortOrder - b.sortOrder);
      if (q.sort === 'displayName') items.sort((a, b) => a.displayName.localeCompare(b.displayName, 'fa'));
      return items;
    });
  }

  async get(id: string): Promise<ProviderDetail> {
    const r = await this.ds.manager.findOne(CreditProvider, { where: { id } });
    if (!r) throw notFound('Credit provider');
    return {
      id: r.id,
      legalName: r.legalName,
      displayName: r.displayName,
      iconFileId: r.iconFileId,
      iconUrl: this.iconUrl(r.iconFileId),
      nationalId: r.nationalId,
      economicId: r.economicId,
      websiteUrl: r.websiteUrl,
      contactNumber: r.contactNumber,
      officeAddress: r.officeAddress,
      iban: r.iban,
      contractFileId: r.contractFileId,
      contractUrl: this.files.urlFor(r.contractFileId, 'Contract'),
      providerSettlementPlanId: r.providerSettlementPlanId,
      planNumber: await this.plans.planNumber('provider', r.providerSettlementPlanId),
      displayStatus: r.displayStatus,
      connectionStatus: r.connectionStatus,
      connectionStatusChangedAt: r.connectionStatusChangedAt?.toISOString() ?? null,
      adapterType: r.adapterType,
      apiBaseUrl: r.apiBaseUrl,
      credentialsRef: r.credentialsRef,
      inquiryKey: r.inquiryKey,
      sortOrder: r.sortOrder,
      version: r.version,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      invoiceSummaries: await this.invoices.summaries('Provider', id),
    };
  }

  private duplicate(e: unknown): never {
    if (isUniqueViolation(e, 'uq_provider_national_id')) {
      throw new AppError('DUPLICATE_ENTITY', 'A provider with this national ID already exists.', { field: 'nationalId' });
    }
    if (isUniqueViolation(e, 'uq_provider_economic_id')) {
      throw new AppError('DUPLICATE_ENTITY', 'A provider with this economic ID already exists.', { field: 'economicId' });
    }
    throw e;
  }

  /** New providers start `Disconnected` until health probes pass (FR-090). */
  async create(input: ProviderInput): Promise<ProviderDetail> {
    const data = this.normalise(input);
    const id = newId('prv');
    try {
      await this.ds.transaction(async (m) => {
        await this.plans.assertAssignable('provider', data.providerSettlementPlanId, m);
        await this.files.commit(m, data.iconFileId, 'Icon');
        await this.files.commit(m, data.contractFileId, 'Contract');
        await m.insert(CreditProvider, { id, ...data, connectionStatus: 'Disconnected', connectionStatusChangedAt: new Date(), version: 1 });
      });
    } catch (e) {
      this.duplicate(e);
    }
    return this.get(id);
  }

  async update(id: string, patch: Partial<ProviderInput>, expectedVersion: number): Promise<{ before: ProviderDetail; after: ProviderDetail }> {
    const before = await this.get(id);
    try {
      await this.ds.transaction(async (m) => {
        const c = await m.findOne(CreditProvider, { where: { id }, lock: { mode: 'pessimistic_write' } });
        if (!c) throw notFound('Credit provider');
        if (c.version !== expectedVersion) throw new AppError('STATE_CHANGED', 'This record changed. Reload to see the latest.');
        const merged = this.normalise({
          legalName: patch.legalName ?? c.legalName,
          displayName: patch.displayName ?? c.displayName,
          iconFileId: patch.iconFileId !== undefined ? patch.iconFileId : c.iconFileId,
          nationalId: patch.nationalId ?? c.nationalId,
          economicId: patch.economicId ?? c.economicId,
          websiteUrl: patch.websiteUrl ?? c.websiteUrl,
          contactNumber: patch.contactNumber ?? c.contactNumber,
          officeAddress: patch.officeAddress ?? c.officeAddress,
          iban: patch.iban ?? c.iban,
          contractFileId: patch.contractFileId !== undefined ? patch.contractFileId : c.contractFileId,
          providerSettlementPlanId: patch.providerSettlementPlanId ?? c.providerSettlementPlanId,
          displayStatus: patch.displayStatus ?? c.displayStatus,
          adapterType: patch.adapterType ?? c.adapterType,
          apiBaseUrl: patch.apiBaseUrl ?? c.apiBaseUrl,
          credentialsRef: patch.credentialsRef ?? c.credentialsRef,
          inquiryKey: patch.inquiryKey ?? c.inquiryKey,
          sortOrder: patch.sortOrder ?? c.sortOrder,
        });
        if (merged.providerSettlementPlanId !== c.providerSettlementPlanId) {
          await this.plans.assertAssignable('provider', merged.providerSettlementPlanId, m);
        }
        await this.files.commit(m, merged.iconFileId, 'Icon', c.iconFileId);
        await this.files.commit(m, merged.contractFileId, 'Contract', c.contractFileId);
        const r = await m.update(CreditProvider, { id, version: expectedVersion }, { ...merged, version: expectedVersion + 1 });
        if (!r.affected) throw stateChanged();
      });
    } catch (e) {
      this.duplicate(e);
    }
    return { before, after: await this.get(id) };
  }
}
