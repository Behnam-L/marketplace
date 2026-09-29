import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  addDaysIso,
  tehranDateOf,
  type CounterpartyType,
  type Direction,
  type InvoiceDetail,
  type InvoiceListItem,
  type InvoiceSummary,
  type Page,
  type RecordInvoicePaymentRequest,
} from '@bajet/contracts';
import { AppError, notFound, stateChanged } from '../../shared/errors/app-error';
import { paginate } from '../../shared/database/pagination';
import { dbNow } from '../../shared/database/tx';
import { newId } from '../../shared/util/ids';
import { JobsGate } from '../../shared/util/jobs-gate';
import { LedgerService } from '../accounting/ledger.service';
import { Accounts } from '../accounting/accounts';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { Invoice, SettlementDocument } from './settlement.entity';
import { CounterpartyRegistry } from './counterparties';
import { DocumentsService } from './documents.service';
import { nextDailyNumber } from './sequences';

export interface InvoiceQuery {
  cursor?: string;
  limit?: number;
  direction?: Direction;
  status?: string;
  counterpartyType?: string;
  counterpartyId?: string;
  dueFrom?: string;
  dueTo?: string;
}

/** Invoices (FR-133/134, BR-INV): daily generation, full payment only, overdue job. */
@Injectable()
export class InvoicesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly documents: DocumentsService,
    private readonly ledger: LedgerService,
    private readonly settings: SystemSettingsService,
    private readonly counterparties: CounterpartyRegistry,
    private readonly jobs: JobsGate,
  ) {}

  /**
   * FR-133: one invoice per (direction, counterparty) over matured, un-invoiced
   * documents. Rerunnable: the unique (…, invoiceDate) key prevents duplicates.
   */
  async generate(): Promise<number> {
    const now = await dbNow(this.ds);
    const today = tehranDateOf(now);
    const yesterday = addDaysIso(today, -1);
    const dueDays = await this.settings.get('invoiceDueDays');
    let created = 0;
    const docs = await this.documents.maturedUninvoiced(this.ds.manager);
    const groups = new Map<string, SettlementDocument[]>();
    for (const d of docs) {
      const key = `${d.direction}|${d.counterpartyType}|${d.counterpartyId}`;
      groups.set(key, [...(groups.get(key) ?? []), d]);
    }
    for (const [key, group] of groups) {
      const [direction, counterpartyType, counterpartyId] = key.split('|') as [Direction, CounterpartyType, string];
      const done = await this.ds.transaction(async (m) => {
        const existing = await m.findOne(Invoice, { where: { direction, counterpartyType, counterpartyId, invoiceDate: today } });
        if (existing) return false;
        // Lock the documents and re-check they are still invoiceable.
        const locked = await m.find(SettlementDocument, {
          where: { id: In(group.map((d) => d.id)) },
          lock: { mode: 'pessimistic_write' },
        });
        const ready = locked.filter((d) => d.status === 'Matured' && !d.invoiceId && !d.awaitingPayeeDetails);
        if (!ready.length) return false;
        const periodFrom = ready.map((d) => d.maturityDate).sort()[0];
        const latest = ready.map((d) => d.maturityDate).sort().reverse()[0];
        const id = newId('inv');
        await m.insert(Invoice, {
          id,
          number: await nextDailyNumber(m, direction === 'Payable' ? 'PI' : 'RI', now),
          direction,
          counterpartyType,
          counterpartyId,
          invoiceDate: today,
          periodFrom,
          periodTo: latest > yesterday ? latest : yesterday,
          totalAmount: ready.reduce((a, d) => a + d.amount, 0),
          documentCount: ready.length,
          dueDate: addDaysIso(today, dueDays),
          status: 'Generated',
          version: 1,
        });
        await m.update(SettlementDocument, { id: In(ready.map((d) => d.id)) }, { status: 'Invoiced', invoiceId: id, version: () => 'version + 1' });
        return true;
      });
      if (done) created++;
    }
    return created;
  }

  /** FR-134: `Sent` invoices past due become `Overdue`. */
  async markOverdue(): Promise<number> {
    const today = tehranDateOf(await dbNow(this.ds));
    const r = await this.ds.manager
      .createQueryBuilder()
      .update(Invoice)
      .set({ status: 'Overdue', version: () => 'version + 1' })
      .where(`status = 'Sent' AND due_date < :today`, { today })
      .execute();
    return r.affected ?? 0;
  }

  @Cron('0 1 * * *', { timeZone: 'Asia/Tehran', name: 'invoice-generation' })
  async dailyJob(): Promise<void> {
    await this.jobs.run('invoice-generation', async () => {
      await this.generate();
      await this.markOverdue();
    });
  }

  async markSent(id: string): Promise<InvoiceDetail> {
    const r = await this.ds.manager.update(Invoice, { id, status: 'Generated' }, { status: 'Sent', version: () => 'version + 1' });
    if (!r.affected) {
      if (!(await this.ds.manager.exists(Invoice, { where: { id } }))) throw notFound('Invoice');
      throw stateChanged();
    }
    return this.get(id);
  }

  /** FR-134: full payment only; documents → Settled; ledger BR-LED-05. */
  async recordPayment(id: string, input: RecordInvoicePaymentRequest, adminId: string): Promise<InvoiceDetail> {
    await this.ds.transaction(async (m) => {
      const inv = await m.findOne(Invoice, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!inv) throw notFound('Invoice');
      if (!['Generated', 'Sent', 'Overdue'].includes(inv.status)) throw stateChanged();
      if (input.amount !== inv.totalAmount) {
        throw new AppError('PAYMENT_AMOUNT_MISMATCH', 'The payment amount must equal the invoice total. Handle differences with a manual document.');
      }
      inv.status = inv.direction === 'Payable' ? 'Paid' : 'Collected';
      inv.paidAt = new Date(input.paidAt);
      inv.bankReference = input.bankReference.trim();
      inv.recordedBy = adminId;
      inv.version += 1;
      await m.save(Invoice, inv);
      await m.update(SettlementDocument, { invoiceId: id, status: 'Invoiced' }, { status: 'Settled', version: () => 'version + 1' });
      const cp = Accounts.counterparty(inv.counterpartyType, inv.counterpartyId);
      await this.ledger.post(m, {
        eventType: inv.direction === 'Payable' ? 'InvoicePaid' : 'InvoiceCollected',
        sourceType: 'Invoice',
        sourceId: inv.id,
        lines:
          inv.direction === 'Payable'
            ? [{ account: cp, debit: inv.totalAmount }, { account: Accounts.bankOperating, credit: inv.totalAmount }]
            : [{ account: Accounts.bankOperating, debit: inv.totalAmount }, { account: cp, credit: inv.totalAmount }],
      });
    });
    return this.get(id);
  }

  private async toList(rows: Invoice[]): Promise<InvoiceListItem[]> {
    const names = new Map<string, string>();
    for (const type of ['Merchant', 'Provider', 'Consumer'] as const) {
      for (const [k, v] of await this.counterparties.names(type, rows.filter((r) => r.counterpartyType === type).map((r) => r.counterpartyId))) {
        names.set(`${type}:${k}`, v);
      }
    }
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      direction: r.direction,
      counterpartyType: r.counterpartyType,
      counterpartyId: r.counterpartyId,
      counterpartyName: names.get(`${r.counterpartyType}:${r.counterpartyId}`) ?? r.counterpartyId,
      invoiceDate: r.invoiceDate,
      periodFrom: r.periodFrom,
      periodTo: r.periodTo,
      totalAmount: r.totalAmount,
      documentCount: r.documentCount,
      dueDate: r.dueDate,
      status: r.status,
    }));
  }

  list(q: InvoiceQuery): Promise<Page<InvoiceListItem>> {
    const qb = this.ds.manager.createQueryBuilder(Invoice, 'i');
    if (q.direction) qb.andWhere('i.direction = :direction', { direction: q.direction });
    if (q.status) qb.andWhere('i.status = :status', { status: q.status });
    if (q.counterpartyType) qb.andWhere('i.counterpartyType = :ct', { ct: q.counterpartyType });
    if (q.counterpartyId) qb.andWhere('i.counterpartyId = :cid', { cid: q.counterpartyId });
    if (q.dueFrom) qb.andWhere('i.dueDate >= :df', { df: q.dueFrom });
    if (q.dueTo) qb.andWhere('i.dueDate <= :dt', { dt: q.dueTo });
    return paginate(qb, 'i', q, (rows) => this.toList(rows));
  }

  async get(id: string, m: EntityManager = this.ds.manager): Promise<InvoiceDetail> {
    const inv = await m.findOne(Invoice, { where: { id } });
    if (!inv) throw notFound('Invoice');
    const [item] = await this.toList([inv]);
    return {
      ...item,
      paidAt: inv.paidAt?.toISOString() ?? null,
      bankReference: inv.bankReference,
      recordedBy: inv.recordedBy,
      documents: await this.documents.forInvoice(id, m),
    };
  }

  /** Invoice summaries for provider/merchant detail pages (FR-090/092). */
  async summaries(counterpartyType: CounterpartyType, counterpartyId: string): Promise<InvoiceSummary[]> {
    const out: InvoiceSummary[] = [];
    for (const direction of ['Payable', 'Receivable'] as const) {
      const rows = await this.ds.manager.find(Invoice, {
        where: { counterpartyType, counterpartyId, direction },
        order: { invoiceDate: 'DESC' },
      });
      const open = rows.filter((r) => ['Generated', 'Sent', 'Overdue'].includes(r.status));
      out.push({
        direction,
        openCount: open.length,
        openAmount: open.reduce((a, r) => a + r.totalAmount, 0),
        overdueCount: rows.filter((r) => r.status === 'Overdue').length,
        paidCount: rows.filter((r) => r.status === 'Paid' || r.status === 'Collected').length,
        recent: await this.toList(rows.slice(0, 5)),
      });
    }
    return out;
  }
}
