import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import {
  addDaysIso,
  applyBpsHalfUp,
  endOfJalaliMonthMaturity,
  splitInstallments,
  tehranDateOf,
  type CounterpartyType,
  type CreateManualDocumentRequest,
  type Direction,
  type DocumentDetail,
  type DocumentKind,
  type DocumentListItem,
  type Page,
} from '@bajet/contracts';
import { AppError, notFound, stateChanged, validationError } from '../../shared/errors/app-error';
import { paginate } from '../../shared/database/pagination';
import { dbNow } from '../../shared/database/tx';
import { newId } from '../../shared/util/ids';
import { JobsGate } from '../../shared/util/jobs-gate';
import { LedgerService } from '../accounting/ledger.service';
import { Accounts } from '../accounting/accounts';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SettlementDocument } from './settlement.entity';
import { CounterpartyRegistry } from './counterparties';
import { nextDailyNumber } from './sequences';
import type { SettlementTermsSnapshot } from './snapshot';

export interface DocumentQuery {
  cursor?: string;
  limit?: number;
  direction?: Direction;
  status?: string;
  kind?: string;
  counterpartyType?: string;
  counterpartyId?: string;
  orderId?: string;
  maturityFrom?: string;
  maturityTo?: string;
}

interface NewDoc {
  direction: Direction;
  counterpartyType: CounterpartyType;
  counterpartyId: string;
  orderId?: string | null;
  refundId?: string | null;
  kind: DocumentKind;
  installmentIndex: number;
  installmentCount: number;
  amount: number;
  maturityDate: string;
  status: 'Scheduled' | 'PendingApproval';
  createdBy: string;
  sourceKey: string;
  reason?: SettlementDocument['reason'];
  note?: string | null;
  awaitingPayeeDetails?: boolean;
}

export interface RefundDocInput {
  key: string;
  direction: Direction;
  counterpartyType: CounterpartyType;
  counterpartyId: string;
  amount: number;
  awaitingPayeeDetails?: boolean;
}

const sourceKey = (parts: (string | number)[]): string => parts.join('|');

/** Settlement documents (FR-130–132, BR-SET, BR-DOC). */
@Injectable()
export class DocumentsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly ledger: LedgerService,
    private readonly settings: SystemSettingsService,
    private readonly counterparties: CounterpartyRegistry,
    private readonly jobs: JobsGate,
  ) {
    this.ledger.registerInvariant((m) => this.counterpartyInvariants(m));
  }

  /** Inserts a document unless its `sourceKey` exists (idempotent, FR-130 AC1). */
  private async insert(m: EntityManager, d: NewDoc): Promise<SettlementDocument | null> {
    if (d.amount <= 0) return null; // BR-SET-05: zero-amount documents are not created.
    if (await m.findOne(SettlementDocument, { where: { sourceKey: d.sourceKey } })) return null;
    const id = newId('doc');
    const number = await nextDailyNumber(m, d.direction === 'Payable' ? 'PD' : 'RD');
    const rows: { id: string }[] = await m.query(
      `INSERT INTO settlement_document (id, number, direction, counterparty_type, counterparty_id, order_id, refund_id, kind,
         installment_index, installment_count, amount, maturity_date, status, reason, note, awaiting_payee_details, created_by, source_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (source_key) DO NOTHING RETURNING id`,
      [
        id, number, d.direction, d.counterpartyType, d.counterpartyId, d.orderId ?? null, d.refundId ?? null, d.kind,
        d.installmentIndex, d.installmentCount, d.amount, d.maturityDate, d.status, d.reason ?? null, d.note ?? null,
        d.awaitingPayeeDetails ?? false, d.createdBy, d.sourceKey,
      ],
    );
    return rows.length ? m.findOneOrFail(SettlementDocument, { where: { id } }) : null;
  }

  /** BR-SET-02/03: merchant payables on completion. */
  async createMerchantDocuments(m: EntityManager, orderId: string, s: SettlementTermsSnapshot): Promise<void> {
    const mp = s.merchant;
    const net = s.totalAmount - mp.commissionAmount;
    let rest = net;
    const base = {
      direction: 'Payable' as const,
      counterpartyType: 'Merchant' as const,
      counterpartyId: mp.merchantId,
      orderId,
      status: 'Scheduled' as const,
      createdBy: 'system',
    };
    if (mp.cashSettlementEnabled && mp.cashSettlementBps) {
      const cashPart = applyBpsHalfUp(net, mp.cashSettlementBps);
      rest = net - cashPart;
      await this.insert(m, {
        ...base,
        kind: 'CashSettlement',
        installmentIndex: 1,
        installmentCount: 1,
        amount: cashPart,
        maturityDate: addDaysIso(s.completedDate, mp.cashSettlementDelayDays),
        sourceKey: sourceKey([orderId, 'Payable', 'Merchant', mp.merchantId, 'CashSettlement', 1]),
      });
    }
    if (rest > 0) {
      const parts = splitInstallments(rest, mp.installmentCount);
      for (let k = 1; k <= parts.length; k++) {
        await this.insert(m, {
          ...base,
          kind: 'OrderSettlement',
          installmentIndex: k,
          installmentCount: parts.length,
          amount: parts[k - 1],
          maturityDate: endOfJalaliMonthMaturity(s.completedDate, k),
          sourceKey: sourceKey([orderId, 'Payable', 'Merchant', mp.merchantId, 'OrderSettlement', k]),
        });
      }
    }
  }

  /** BR-SET-01: provider receivables once its allocation is confirmed (A-19). */
  async createProviderDocuments(m: EntityManager, orderId: string, providerId: string, s: SettlementTermsSnapshot): Promise<void> {
    const p = s.providers[providerId];
    if (!p) throw new Error(`No snapshot terms for provider ${providerId} on ${orderId}`);
    const owed = p.creditAmount - p.marginAmount;
    if (owed <= 0) return;
    const parts = splitInstallments(owed, p.installmentCount);
    for (let k = 1; k <= parts.length; k++) {
      await this.insert(m, {
        direction: 'Receivable',
        counterpartyType: 'Provider',
        counterpartyId: providerId,
        orderId,
        kind: 'OrderSettlement',
        installmentIndex: k,
        installmentCount: parts.length,
        amount: parts[k - 1],
        maturityDate: endOfJalaliMonthMaturity(s.completedDate, k),
        status: 'Scheduled',
        createdBy: 'system',
        sourceKey: sourceKey([orderId, 'Receivable', 'Provider', providerId, 'OrderSettlement', k]),
      });
    }
  }

  /** BR-RFD-03 obligations of a completed refund; they mature today. Returns document ids by input key. */
  async createRefundDocuments(m: EntityManager, refund: { id: string; orderId: string }, docs: RefundDocInput[]): Promise<Map<string, string>> {
    const today = tehranDateOf(await dbNow(m));
    const out = new Map<string, string>();
    for (const d of docs) {
      const key = sourceKey([refund.id, d.direction, d.counterpartyType, d.counterpartyId, 'Refund', d.key]);
      await this.insert(m, {
        direction: d.direction,
        counterpartyType: d.counterpartyType,
        counterpartyId: d.counterpartyId,
        orderId: refund.orderId,
        refundId: refund.id,
        kind: 'Refund',
        installmentIndex: 1,
        installmentCount: 1,
        amount: d.amount,
        maturityDate: today,
        status: 'Scheduled',
        createdBy: 'system',
        awaitingPayeeDetails: d.awaitingPayeeDetails ?? false,
        sourceKey: key,
      });
      const row = await m.findOne(SettlementDocument, { where: { sourceKey: key } });
      if (row) out.set(d.key, row.id);
    }
    return out;
  }

  async markPayeeReady(m: EntityManager, documentId: string): Promise<void> {
    await m.update(SettlementDocument, { id: documentId }, { awaitingPayeeDetails: false });
  }

  /* ─────────── Manual documents (FR-131, BR-DOC-03) ─────────── */

  private async postManual(m: EntityManager, d: SettlementDocument): Promise<void> {
    const cp = Accounts.counterparty(d.counterpartyType, d.counterpartyId);
    await this.ledger.post(m, {
      eventType: 'ManualDocumentScheduled',
      sourceType: 'SettlementDocument',
      sourceId: d.id,
      lines:
        d.direction === 'Payable'
          ? [{ account: Accounts.adjustments, debit: d.amount }, { account: cp, credit: d.amount }]
          : [{ account: cp, debit: d.amount }, { account: Accounts.adjustments, credit: d.amount }],
    });
  }

  async createManual(input: CreateManualDocumentRequest, adminId: string): Promise<DocumentDetail> {
    if (!(await this.counterparties.exists(input.counterpartyType, input.counterpartyId))) {
      throw validationError('counterpartyId', 'Counterparty not found.');
    }
    if (input.orderId) {
      const total = await this.counterparties.totalOfOrder(input.orderId);
      if (total === null) throw validationError('orderId', 'Order not found.');
      if (input.amount > total) throw new AppError('AMOUNT_EXCEEDS_ORDER', 'The amount exceeds the order total.');
    }
    const threshold = await this.settings.get('manualDocApprovalThreshold');
    const id = await this.ds.transaction(async (m) => {
      const doc = await this.insert(m, {
        direction: input.direction,
        counterpartyType: input.counterpartyType,
        counterpartyId: input.counterpartyId,
        orderId: input.orderId ?? null,
        kind: 'Manual',
        installmentIndex: 1,
        installmentCount: 1,
        amount: input.amount,
        maturityDate: input.maturityDate,
        status: input.amount > threshold ? 'PendingApproval' : 'Scheduled',
        createdBy: adminId,
        reason: input.reason,
        note: input.note.trim(),
        sourceKey: sourceKey(['manual', newId('doc')]),
      });
      if (!doc) throw new Error('manual document insert failed');
      if (doc.status === 'Scheduled') await this.postManual(m, doc);
      return doc.id;
    });
    return this.get(id);
  }

  private async lockManual(m: EntityManager, id: string): Promise<SettlementDocument> {
    const d = await m.findOne(SettlementDocument, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!d) throw notFound('Document');
    return d;
  }

  async approve(id: string, adminId: string, note: string): Promise<DocumentDetail> {
    await this.ds.transaction(async (m) => {
      const d = await this.lockManual(m, id);
      if (d.kind !== 'Manual' || d.status !== 'PendingApproval') throw stateChanged();
      if (d.createdBy === adminId) throw new AppError('SELF_APPROVAL_FORBIDDEN', 'A document cannot be approved by its creator.');
      d.status = 'Scheduled';
      d.approvedBy = adminId;
      if (note) d.note = `${d.note ?? ''}\n[approval] ${note}`.trim().slice(0, 1000);
      d.version += 1;
      await m.save(SettlementDocument, d);
      await this.postManual(m, d);
    });
    return this.get(id);
  }

  async reject(id: string, adminId: string, note: string): Promise<DocumentDetail> {
    await this.ds.transaction(async (m) => {
      const d = await this.lockManual(m, id);
      if (d.kind !== 'Manual' || d.status !== 'PendingApproval') throw stateChanged();
      if (d.createdBy === adminId) throw new AppError('SELF_APPROVAL_FORBIDDEN', 'A document cannot be reviewed by its creator.');
      d.status = 'Rejected';
      d.approvedBy = adminId;
      d.cancelReason = (note || 'Rejected').slice(0, 500);
      d.version += 1;
      await m.save(SettlementDocument, d);
    });
    return this.get(id);
  }

  /** FR-132: only manual documents, only from Scheduled/Matured; posts a reversing entry. */
  async cancel(id: string, reason: string): Promise<DocumentDetail> {
    if (!reason || reason.trim().length < 3) throw validationError('note', 'A reason is required.');
    await this.ds.transaction(async (m) => {
      const d = await this.lockManual(m, id);
      if (d.kind !== 'Manual') {
        throw new AppError('STATE_CHANGED', 'Automatic documents cannot be cancelled; create an offsetting manual document.');
      }
      if (d.status !== 'Scheduled' && d.status !== 'Matured') throw stateChanged();
      d.status = 'Cancelled';
      d.cancelReason = reason.trim().slice(0, 500);
      d.version += 1;
      await m.save(SettlementDocument, d);
      await this.ledger.reverse(
        m,
        { eventType: 'ManualDocumentScheduled', sourceId: d.id },
        { eventType: 'ManualDocumentCancelled', sourceType: 'SettlementDocument', sourceId: d.id },
      );
    });
    return this.get(id);
  }

  /* ─────────── Maturity (FR-132) ─────────── */

  async runMaturity(): Promise<number> {
    const today = tehranDateOf(await dbNow(this.ds));
    const r = await this.ds.manager
      .createQueryBuilder()
      .update(SettlementDocument)
      .set({ status: 'Matured', version: () => 'version + 1' })
      .where(`status = 'Scheduled' AND maturity_date <= :today`, { today })
      .execute();
    return r.affected ?? 0;
  }

  @Cron('5 0 * * *', { timeZone: 'Asia/Tehran', name: 'document-maturity' })
  async maturityJob(): Promise<void> {
    await this.jobs.run('document-maturity', () => this.runMaturity());
  }

  /* ─────────── Queries ─────────── */

  async toList(rows: SettlementDocument[]): Promise<DocumentListItem[]> {
    const names = new Map<string, string>();
    for (const type of ['Merchant', 'Provider', 'Consumer'] as const) {
      const ids = rows.filter((r) => r.counterpartyType === type).map((r) => r.counterpartyId);
      for (const [k, v] of await this.counterparties.names(type, ids)) names.set(`${type}:${k}`, v);
    }
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      direction: r.direction,
      counterpartyType: r.counterpartyType,
      counterpartyId: r.counterpartyId,
      counterpartyName: names.get(`${r.counterpartyType}:${r.counterpartyId}`) ?? r.counterpartyId,
      orderId: r.orderId,
      refundId: r.refundId,
      kind: r.kind,
      installmentIndex: r.installmentIndex,
      installmentCount: r.installmentCount,
      amount: r.amount,
      maturityDate: r.maturityDate,
      status: r.status,
      invoiceId: r.invoiceId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  list(q: DocumentQuery): Promise<Page<DocumentListItem>> {
    const qb = this.ds.manager.createQueryBuilder(SettlementDocument, 'd');
    if (q.direction) qb.andWhere('d.direction = :direction', { direction: q.direction });
    if (q.status) qb.andWhere('d.status = :status', { status: q.status });
    if (q.kind) qb.andWhere('d.kind = :kind', { kind: q.kind });
    if (q.counterpartyType) qb.andWhere('d.counterpartyType = :ct', { ct: q.counterpartyType });
    if (q.counterpartyId) qb.andWhere('d.counterpartyId = :cid', { cid: q.counterpartyId });
    if (q.orderId) qb.andWhere('d.orderId = :orderId', { orderId: q.orderId });
    if (q.maturityFrom) qb.andWhere('d.maturityDate >= :mf', { mf: q.maturityFrom });
    if (q.maturityTo) qb.andWhere('d.maturityDate <= :mt', { mt: q.maturityTo });
    return paginate(qb, 'd', q, (rows) => this.toList(rows));
  }

  async forOrder(orderId: string): Promise<DocumentListItem[]> {
    return this.toList(await this.ds.manager.find(SettlementDocument, { where: { orderId }, order: { createdAt: 'ASC' } }));
  }

  async forInvoice(invoiceId: string, m: EntityManager = this.ds.manager): Promise<DocumentListItem[]> {
    return this.toList(await m.find(SettlementDocument, { where: { invoiceId }, order: { maturityDate: 'ASC' } }));
  }

  async get(id: string): Promise<DocumentDetail> {
    const d = await this.ds.manager.findOne(SettlementDocument, { where: { id } });
    if (!d) throw notFound('Document');
    const [item] = await this.toList([d]);
    return {
      ...item,
      reason: d.reason,
      note: d.note,
      createdBy: d.createdBy,
      approvedBy: d.approvedBy,
      cancelReason: d.cancelReason,
      sourceKey: d.sourceKey,
      isManual: d.kind === 'Manual',
    };
  }

  /** Matured, un-invoiced documents ready for invoicing (consumer payables wait for the payee IBAN). */
  maturedUninvoiced(m: EntityManager): Promise<SettlementDocument[]> {
    return m.find(SettlementDocument, {
      where: { status: 'Matured', invoiceId: IsNull(), awaitingPayeeDetails: false },
      order: { maturityDate: 'ASC' },
    });
  }

  /** BR-LED-09: CP balance (credit − debit) = Σ open payable − Σ open receivable documents. */
  private async counterpartyInvariants(m: EntityManager): Promise<{ name: string; expected: number; actual: number }[]> {
    const open: { counterparty_type: CounterpartyType; counterparty_id: string; owed: string }[] = await m.query(
      `SELECT counterparty_type, counterparty_id,
              SUM(CASE WHEN direction = 'Payable' THEN amount ELSE -amount END) AS owed
         FROM settlement_document
        WHERE status IN ('Scheduled', 'Matured', 'Invoiced')
        GROUP BY counterparty_type, counterparty_id`,
    );
    const balances: { account_code: string; owed: string }[] = await m.query(
      `SELECT account_code, SUM(credit) - SUM(debit) AS owed FROM ledger_line WHERE account_code LIKE 'CP:%' GROUP BY account_code`,
    );
    const expected = new Map(open.map((o) => [Accounts.counterparty(o.counterparty_type, o.counterparty_id), Number(o.owed)]));
    const actual = new Map(balances.map((b) => [b.account_code, Number(b.owed)]));
    return [...new Set([...expected.keys(), ...actual.keys()])].map((key) => ({
      name: `COUNTERPARTY ${key}`,
      expected: expected.get(key) ?? 0,
      actual: actual.get(key) ?? 0,
    }));
  }
}
