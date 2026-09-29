import { Column, Entity, Index } from 'typeorm';
import {
  BANK_TRANSACTION_STATUSES,
  type BankTransactionStatus,
  type BankTransactionType,
  type GatewayHealth,
} from '@bajet/contracts';
import { CreatedAt, EnumCol, IdColumn, MoneyColumn, RefColumn, Timestamp, UpdatedAt, VersionCol } from '../../shared/database/columns';

@Entity('bank_gateway')
@Index('uq_gateway_code', ['code'], { unique: true })
export class BankGateway {
  @IdColumn() id: string;
  @Column({ type: 'varchar', length: 40 }) code: string;
  @Column({ type: 'varchar', length: 100 }) name: string;
  @Column({ type: 'integer' }) priority: number;
  @EnumCol(['Healthy', 'Unhealthy']) healthStatus: GatewayHealth;
  @Column({ type: 'boolean' }) supportsReverse: boolean;
  @Column({ type: 'boolean' }) supportsRefund: boolean;
  @Column({ type: 'varchar', length: 200 }) credentialsRef: string;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}

@Entity('bank_transaction')
@Index('uq_btx_gateway_reference', ['gatewayCode', 'gatewayReference'], { unique: true, where: 'gateway_reference IS NOT NULL' })
@Index('uq_btx_authoritative', ['orderId'], { unique: true, where: 'is_authoritative' })
@Index('ix_btx_order', ['orderId'])
@Index('ix_btx_status', ['status', 'nextAttemptAt'])
export class BankTransaction {
  @IdColumn() id: string;
  @RefColumn({ nullable: true }) orderId: string | null;
  @RefColumn({ nullable: true }) refundLegId: string | null;
  @EnumCol(['Payment', 'Refund']) type: BankTransactionType;
  @Column({ type: 'varchar', length: 40 }) gatewayCode: string;
  @MoneyColumn() amount: number;
  @EnumCol(BANK_TRANSACTION_STATUSES) status: BankTransactionStatus;
  @Column({ type: 'varchar', length: 120, nullable: true }) gatewayToken: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) gatewayReference: string | null;
  @Column({ type: 'varchar', length: 30, nullable: true }) cardMask: string | null;
  @Timestamp({ nullable: true }) authorizedAt: Date | null;
  @Timestamp({ nullable: true }) verifiedAt: Date | null;
  @Column({ type: 'boolean', default: false }) isAuthoritative: boolean;
  @Column({ type: 'varchar', length: 40, nullable: true }) failureCode: string | null;
  /** Retry bookkeeping for reversals (BR-RETRY-01). */
  @Column({ type: 'integer', default: 0 }) attempts: number;
  @Timestamp({ nullable: true }) nextAttemptAt: Date | null;
  @Column({ type: 'varchar', length: 300, nullable: true }) lastError: string | null;
  @VersionCol() version: number;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}

/** Append-only technical log of gateway calls. */
@Entity('bank_call_log')
@Index('ix_bank_call_log_btx', ['bankTransactionId'])
export class BankCallLog {
  @IdColumn() id: string;
  @RefColumn() bankTransactionId: string;
  @Column({ type: 'varchar', length: 30 }) operation: string;
  @Column({ type: 'varchar', length: 30 }) outcome: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) detail: string | null;
  @Column({ type: 'integer' }) latencyMs: number;
  @CreatedAt() createdAt: Date;
}
