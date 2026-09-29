import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type {
  Page,
  PspReportImportResponse,
  ReconciliationItemDto,
  ReconciliationItemType,
  ReconciliationSeverity,
  UpdateReconciliationItemRequest,
} from '@bajet/contracts';
import { AppError, notFound, validationError } from '../../shared/errors/app-error';
import { paginate } from '../../shared/database/pagination';
import { newId } from '../../shared/util/ids';
import { AlertService } from '../../shared/util/alerts';
import { JobsGate } from '../../shared/util/jobs-gate';
import { PspSettlementLine, ProviderStatementLine, ReconciliationItem } from './reconciliation.entity';

export interface OpenItemInput {
  type: ReconciliationItemType;
  severity?: ReconciliationSeverity;
  orderId?: string | null;
  refs: Record<string, string>;
  expectedAmount?: number | null;
  actualAmount?: number | null;
  /** Defaults to `${type}:${first ref value}`. */
  dedupeKey?: string;
}

export interface ReconciliationQuery {
  cursor?: string;
  limit?: number;
  status?: string;
  type?: string;
  assigneeId?: string;
  orderId?: string;
}

/** Re-drive handler: retries the stuck operation referenced by the item. Returns true if resolved. */
export type RedriveHandler = (item: ReconciliationItem) => Promise<boolean>;
export type PspImporter = (gatewayCode: string, csv: string) => Promise<PspReportImportResponse>;
export type DailyReconciler = () => Promise<void>;
export type DocumentLookup = (id: string) => Promise<boolean>;

const MONEY_AFFECTING = new Set(['ManualDocument', 'WrittenOff']);

/** FR-140–142 reconciliation queue. Matching logic lives in the modules that own the data. */
@Injectable()
export class ReconciliationService {
  private readonly redrivers = new Map<ReconciliationItemType, RedriveHandler>();
  private importer?: PspImporter;
  private readonly daily: DailyReconciler[] = [];
  private documentExists?: DocumentLookup;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly alerts: AlertService,
    private readonly jobs: JobsGate,
  ) {}

  registerRedrive(types: ReconciliationItemType[], handler: RedriveHandler): void {
    for (const t of types) this.redrivers.set(t, handler);
  }

  registerPspImporter(fn: PspImporter): void {
    this.importer = fn;
  }

  registerDaily(fn: DailyReconciler): void {
    this.daily.push(fn);
  }

  registerDocumentLookup(fn: DocumentLookup): void {
    this.documentExists = fn;
  }

  /** Opens an item unless an identical one is already open. */
  async open(input: OpenItemInput, m: EntityManager = this.ds.manager): Promise<string | null> {
    const dedupeKey = input.dedupeKey ?? `${input.type}:${Object.values(input.refs)[0] ?? input.orderId ?? ''}`;
    const id = newId('rec');
    const rows: { id: string }[] = await m.query(
      `INSERT INTO reconciliation_item (id, type, severity, order_id, refs, expected_amount, actual_amount, status, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Open', $8)
       ON CONFLICT (dedupe_key) WHERE status <> 'Resolved' DO NOTHING RETURNING id`,
      [id, input.type, input.severity ?? 'Medium', input.orderId ?? null, JSON.stringify(input.refs), input.expectedAmount ?? null, input.actualAmount ?? null, dedupeKey],
    );
    if (rows.length) this.alerts.raise('Operations', `RECONCILIATION_${input.type}`, { itemId: id, ...input.refs });
    return rows[0]?.id ?? null;
  }

  /** Auto-resolution (e.g. a statement confirmed a pending allocation). */
  async autoResolve(dedupeKey: string, note: string, m: EntityManager = this.ds.manager): Promise<void> {
    await m.query(
      `UPDATE reconciliation_item SET status = 'Resolved', resolution_type = 'NoActionNeeded', note = $2, resolved_at = now(), updated_at = now()
        WHERE dedupe_key = $1 AND status <> 'Resolved'`,
      [dedupeKey, note],
    );
  }

  private toDto(r: ReconciliationItem): ReconciliationItemDto {
    return {
      id: r.id,
      type: r.type,
      severity: r.severity,
      orderId: r.orderId,
      refs: r.refs,
      expectedAmount: r.expectedAmount,
      actualAmount: r.actualAmount,
      status: r.status,
      assigneeId: r.assigneeId,
      resolutionType: r.resolutionType,
      note: r.note,
      linkedDocumentId: r.linkedDocumentId,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    };
  }

  list(q: ReconciliationQuery): Promise<Page<ReconciliationItemDto>> {
    const qb = this.ds.manager.createQueryBuilder(ReconciliationItem, 'r');
    if (q.status) qb.andWhere('r.status = :status', { status: q.status });
    if (q.type) qb.andWhere('r.type = :type', { type: q.type });
    if (q.assigneeId) qb.andWhere('r.assigneeId = :a', { a: q.assigneeId });
    if (q.orderId) qb.andWhere('r.orderId = :o', { o: q.orderId });
    return paginate(qb, 'r', q, (rows) => rows.map((r) => this.toDto(r)));
  }

  async forOrder(orderId: string): Promise<ReconciliationItemDto[]> {
    return (await this.ds.manager.find(ReconciliationItem, { where: { orderId }, order: { createdAt: 'ASC' } })).map((r) => this.toDto(r));
  }

  async get(id: string): Promise<ReconciliationItemDto> {
    const r = await this.ds.manager.findOne(ReconciliationItem, { where: { id } });
    if (!r) throw notFound('Reconciliation item');
    return this.toDto(r);
  }

  /** FR-142: assign / review / resolve (resolutionType + note; money-affecting → linked manual document). */
  async update(id: string, input: UpdateReconciliationItemRequest): Promise<{ before: ReconciliationItemDto; after: ReconciliationItemDto }> {
    const before = await this.get(id);
    if (before.status === 'Resolved') throw new AppError('STATE_CHANGED', 'Resolved items cannot be reopened; create a new item.');
    const patch: Partial<ReconciliationItem> = {};
    if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId;
    if (input.status === 'InReview') patch.status = 'InReview';
    if (input.status === 'Resolved') {
      if (!input.resolutionType) throw validationError('resolutionType', 'A resolution type is required.');
      if (!input.note || input.note.trim().length < 5) throw validationError('note', 'A resolution note is required.');
      if (MONEY_AFFECTING.has(input.resolutionType)) {
        if (!input.linkedDocumentId) throw validationError('linkedDocumentId', 'Money-affecting resolutions must link a manual document.');
        if (this.documentExists && !(await this.documentExists(input.linkedDocumentId))) {
          throw validationError('linkedDocumentId', 'Linked document not found.');
        }
      }
      patch.status = 'Resolved';
      patch.resolutionType = input.resolutionType;
      patch.linkedDocumentId = input.linkedDocumentId ?? null;
      patch.resolvedAt = new Date();
    }
    if (input.note !== undefined) patch.note = input.note.trim().slice(0, 1000);
    await this.ds.manager.update(ReconciliationItem, { id }, patch);
    return { before, after: await this.get(id) };
  }

  /** "Re-drive": retries the stuck provider/bank operation. */
  async redrive(id: string): Promise<ReconciliationItemDto> {
    const item = await this.ds.manager.findOne(ReconciliationItem, { where: { id } });
    if (!item) throw notFound('Reconciliation item');
    if (item.status === 'Resolved') throw new AppError('STATE_CHANGED', 'Item already resolved.');
    const handler = this.redrivers.get(item.type);
    if (!handler) throw new AppError('STATE_CHANGED', 'This item type cannot be re-driven; resolve it manually.');
    const resolved = await handler(item);
    if (resolved) {
      await this.ds.manager.update(ReconciliationItem, { id }, {
        status: 'Resolved', resolutionType: 'Redriven', resolvedAt: new Date(), note: `${item.note ?? ''}\n[re-drive succeeded]`.trim(),
      });
    } else {
      await this.ds.manager.update(ReconciliationItem, { id }, { status: 'InReview', note: `${item.note ?? ''}\n[re-drive attempted, not yet resolved]`.trim() });
    }
    return this.get(id);
  }

  async importPspReport(gatewayCode: string, csv: string): Promise<PspReportImportResponse> {
    if (!this.importer) throw new AppError('SERVICE_UNAVAILABLE', 'No PSP importer is registered.');
    return this.importer(gatewayCode, csv);
  }

  /* Line storage used by the owning modules. */
  async storePspLine(line: Omit<PspSettlementLine, 'id' | 'createdAt'>): Promise<PspSettlementLine | null> {
    const id = newId('psl');
    const rows: { id: string }[] = await this.ds.query(
      `INSERT INTO psp_settlement_line (id, source, gateway_code, report_date, reference, amount, fee, matched_tx_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (source, reference) DO NOTHING RETURNING id`,
      [id, line.source, line.gatewayCode, line.reportDate, line.reference, line.amount, line.fee, line.matchedTxId],
    );
    return rows.length ? this.ds.manager.findOneOrFail(PspSettlementLine, { where: { id } }) : null;
  }

  pspLineExists(gatewayCode: string, reference: string): Promise<boolean> {
    return this.ds.manager.exists(PspSettlementLine, { where: { gatewayCode, reference } });
  }

  async storeStatementLine(line: Omit<ProviderStatementLine, 'id' | 'createdAt'>): Promise<boolean> {
    const rows: unknown[] = await this.ds.query(
      `INSERT INTO provider_statement_line (id, source, statement_date, reference, operation, state, amount, matched_tx_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (source, reference) DO NOTHING RETURNING id`,
      [newId('pvs'), line.source, line.statementDate, line.reference, line.operation, line.state, line.amount, line.matchedTxId],
    );
    return rows.length > 0;
  }

  /** Daily reconciliation run (FR-140/141). */
  async runDaily(): Promise<void> {
    for (const fn of this.daily) await fn();
  }

  @Cron('0 3 * * *', { timeZone: 'Asia/Tehran', name: 'daily-reconciliation' })
  async dailyJob(): Promise<void> {
    await this.jobs.run('daily-reconciliation', () => this.runDaily());
  }
}
