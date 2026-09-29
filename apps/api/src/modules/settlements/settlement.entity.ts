import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import {
  DOCUMENT_STATUSES,
  INVOICE_STATUSES,
  type CounterpartyType,
  type Direction,
  type DocumentKind,
  type DocumentStatus,
  type InvoiceStatus,
  type ManualDocumentReason,
  type MaturityRule,
  type PlanStatus,
} from '@bajet/contracts';
import { CreatedAt, EnumCol, IdColumn, MoneyColumn, RefColumn, Timestamp, UpdatedAt, VersionCol } from '../../shared/database/columns';

@Entity('provider_settlement_plan')
@Index('uq_provider_plan_number', ['planNumber'], { unique: true })
@Check('ck_provider_plan_ranges', `provider_payable_margin_bps BETWEEN 0 AND 10000 AND installment_count BETWEEN 1 AND 6`)
export class ProviderSettlementPlan {
  @IdColumn() id: string;
  @Column({ type: 'varchar', length: 20 }) planNumber: string;
  @Column({ type: 'integer' }) providerPayableMarginBps: number;
  @Column({ type: 'integer' }) installmentCount: number;
  @EnumCol(['EndOfJalaliMonth']) maturityRule: MaturityRule;
  @EnumCol(['Active', 'Archived']) status: PlanStatus;
  @VersionCol() version: number;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}

@Entity('merchant_settlement_plan')
@Index('uq_merchant_plan_number', ['planNumber'], { unique: true })
@Check('ck_merchant_plan_ranges', `merchant_receivable_margin_bps BETWEEN 0 AND 10000 AND installment_count BETWEEN 1 AND 6`)
@Check('ck_merchant_plan_cash', `(cash_settlement_enabled AND cash_settlement_bps BETWEEN 100 AND 10000) OR (NOT cash_settlement_enabled AND cash_settlement_bps IS NULL)`)
export class MerchantSettlementPlan {
  @IdColumn() id: string;
  @Column({ type: 'varchar', length: 20 }) planNumber: string;
  @Column({ type: 'integer' }) merchantReceivableMarginBps: number;
  @Column({ type: 'boolean' }) cashSettlementEnabled: boolean;
  @Column({ type: 'integer', nullable: true }) cashSettlementBps: number | null;
  @Column({ type: 'integer' }) installmentCount: number;
  @EnumCol(['EndOfJalaliMonth']) maturityRule: MaturityRule;
  @EnumCol(['Active', 'Archived']) status: PlanStatus;
  @VersionCol() version: number;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}

/** PayableDocument / ReceivableDocument (D-17: one table, `direction`). */
@Entity('settlement_document')
@Index('uq_document_number', ['number'], { unique: true })
@Index('uq_document_source_key', ['sourceKey'], { unique: true })
@Index('ix_document_status_maturity', ['status', 'maturityDate'])
@Index('ix_document_counterparty', ['counterpartyType', 'counterpartyId'])
@Index('ix_document_order', ['orderId'])
@Check('ck_document_amount', `amount > 0`)
export class SettlementDocument {
  @IdColumn() id: string;
  @Column({ type: 'varchar', length: 30 }) number: string;
  @EnumCol(['Payable', 'Receivable']) direction: Direction;
  @EnumCol(['Merchant', 'Provider', 'Consumer']) counterpartyType: CounterpartyType;
  @RefColumn() counterpartyId: string;
  @RefColumn({ nullable: true }) orderId: string | null;
  @RefColumn({ nullable: true }) refundId: string | null;
  @EnumCol(['OrderSettlement', 'CashSettlement', 'Refund', 'Manual']) kind: DocumentKind;
  @Column({ type: 'integer', default: 1 }) installmentIndex: number;
  @Column({ type: 'integer', default: 1 }) installmentCount: number;
  @MoneyColumn() amount: number;
  @Column({ type: 'date' }) maturityDate: string;
  @EnumCol(DOCUMENT_STATUSES) status: DocumentStatus;
  @RefColumn({ nullable: true }) invoiceId: string | null;
  @EnumCol(['Adjustment', 'ReconciliationResolution', 'Other'], { nullable: true }) reason: ManualDocumentReason | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) note: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) cancelReason: string | null;
  /** Consumer refund payables wait for Support to enter the payee IBAN (FR-071). */
  @Column({ type: 'boolean', default: false }) awaitingPayeeDetails: boolean;
  @Column({ type: 'varchar', length: 40 }) createdBy: string;
  @RefColumn({ nullable: true }) approvedBy: string | null;
  @Column({ type: 'varchar', length: 200 }) sourceKey: string;
  @VersionCol() version: number;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}

/** PayableInvoice / ReceivableInvoice via `direction`. */
@Entity('invoice')
@Index('uq_invoice_number', ['number'], { unique: true })
@Index('uq_invoice_counterparty_date', ['direction', 'counterpartyType', 'counterpartyId', 'invoiceDate'], { unique: true })
export class Invoice {
  @IdColumn() id: string;
  @Column({ type: 'varchar', length: 30 }) number: string;
  @EnumCol(['Payable', 'Receivable']) direction: Direction;
  @EnumCol(['Merchant', 'Provider', 'Consumer']) counterpartyType: CounterpartyType;
  @RefColumn() counterpartyId: string;
  @Column({ type: 'date' }) invoiceDate: string;
  @Column({ type: 'date' }) periodFrom: string;
  @Column({ type: 'date' }) periodTo: string;
  @MoneyColumn() totalAmount: number;
  @Column({ type: 'integer' }) documentCount: number;
  @Column({ type: 'date' }) dueDate: string;
  @EnumCol(INVOICE_STATUSES) status: InvoiceStatus;
  @Timestamp({ nullable: true }) paidAt: Date | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) bankReference: string | null;
  @RefColumn({ nullable: true }) recordedBy: string | null;
  @VersionCol() version: number;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}

/** Daily numbering sequences (BR-DOC-01) and plan numbers. */
@Entity('number_sequence')
export class NumberSequence {
  @PrimaryColumn({ type: 'varchar', length: 30 }) scope: string;
  @Column({ type: 'integer' }) lastValue: number;
}
