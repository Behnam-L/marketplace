import { Column, Entity, Index } from 'typeorm';
import {
  RECONCILIATION_ITEM_TYPES,
  RECONCILIATION_STATUSES,
  RESOLUTION_TYPES,
  type ReconciliationItemType,
  type ReconciliationSeverity,
  type ReconciliationStatus,
  type ResolutionType,
} from '@bajet/contracts';
import { CreatedAt, EnumCol, IdColumn, MoneyColumn, RefColumn, Timestamp, UpdatedAt } from '../../shared/database/columns';

@Entity('reconciliation_item')
@Index('uq_recon_open_dedupe', ['dedupeKey'], { unique: true, where: `status <> 'Resolved'` })
@Index('ix_recon_status', ['status', 'createdAt'])
export class ReconciliationItem {
  @IdColumn() id: string;
  @EnumCol(RECONCILIATION_ITEM_TYPES) type: ReconciliationItemType;
  @EnumCol(['Low', 'Medium', 'High']) severity: ReconciliationSeverity;
  @RefColumn({ nullable: true }) orderId: string | null;
  @Column({ type: 'jsonb', default: {} }) refs: Record<string, string>;
  @MoneyColumn({ nullable: true }) expectedAmount: number | null;
  @MoneyColumn({ nullable: true }) actualAmount: number | null;
  @EnumCol(RECONCILIATION_STATUSES) status: ReconciliationStatus;
  @RefColumn({ nullable: true }) assigneeId: string | null;
  @EnumCol(RESOLUTION_TYPES, { nullable: true }) resolutionType: ResolutionType | null;
  @Column({ type: 'varchar', length: 1000, nullable: true }) note: string | null;
  @RefColumn({ nullable: true }) linkedDocumentId: string | null;
  /** One open item per underlying problem. */
  @Column({ type: 'varchar', length: 200 }) dedupeKey: string;
  @Timestamp({ nullable: true }) resolvedAt: Date | null;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}

@Entity('psp_settlement_line')
@Index('uq_psp_line', ['source', 'reference'], { unique: true })
export class PspSettlementLine {
  @IdColumn() id: string;
  /** Gateway code (API import) or `csv:<gateway>` (upload). */
  @Column({ type: 'varchar', length: 40 }) source: string;
  @Column({ type: 'varchar', length: 40 }) gatewayCode: string;
  @Column({ type: 'date' }) reportDate: string;
  @Column({ type: 'varchar', length: 100 }) reference: string;
  @MoneyColumn() amount: number;
  @MoneyColumn({ default: 0 }) fee: number;
  @RefColumn({ nullable: true }) matchedTxId: string | null;
  @CreatedAt() createdAt: Date;
}

@Entity('provider_statement_line')
@Index('uq_provider_statement_line', ['source', 'reference'], { unique: true })
export class ProviderStatementLine {
  @IdColumn() id: string;
  /** Provider id. */
  @Column({ type: 'varchar', length: 40 }) source: string;
  @Column({ type: 'date' }) statementDate: string;
  @Column({ type: 'varchar', length: 100 }) reference: string;
  @Column({ type: 'varchar', length: 20 }) operation: string;
  @Column({ type: 'varchar', length: 20 }) state: string;
  @MoneyColumn() amount: number;
  @RefColumn({ nullable: true }) matchedTxId: string | null;
  @CreatedAt() createdAt: Date;
}
