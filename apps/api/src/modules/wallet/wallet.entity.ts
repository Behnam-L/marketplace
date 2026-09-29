import { Column, Entity, Index } from 'typeorm';
import {
  PROVIDER_TRANSACTION_STATUSES,
  PROVIDER_TRANSACTION_TYPES,
  type InquiryKind,
  type InquiryOutcome,
  type ProviderTransactionStatus,
  type ProviderTransactionType,
  type ReservationStatus,
} from '@bajet/contracts';
import { CreatedAt, EnumCol, IdColumn, MoneyColumn, RefColumn, Timestamp, UpdatedAt, VersionCol } from '../../shared/database/columns';

@Entity('credit_inquiry')
@Index('uq_inquiry_attempt', ['orderId', 'attemptNo'], { unique: true })
export class CreditInquiry {
  @IdColumn() id: string;
  @RefColumn() orderId: string;
  @Column({ type: 'integer' }) attemptNo: number;
  @EnumCol(['Initial', 'Retry', 'Recheck']) kind: InquiryKind;
  @EnumCol(['InProgress', 'Finished']) status: 'InProgress' | 'Finished';
  @Column({ type: 'integer' }) providerCount: number;
  /** Providers asked in this inquiry (drives per-provider spinners). */
  @Column({ type: 'text', array: true, default: '{}' }) providerIds: string[];
  @Timestamp({ nullable: true }) finishedAt: Date | null;
  @CreatedAt() createdAt: Date;
}

@Entity('credit_inquiry_result')
@Index('uq_inquiry_result', ['inquiryId', 'providerId'], { unique: true })
export class CreditInquiryResult {
  @IdColumn() id: string;
  @RefColumn() inquiryId: string;
  @RefColumn() providerId: string;
  @EnumCol(['Ok', 'NoAccount', 'Error', 'Timeout', 'Late']) outcome: InquiryOutcome;
  @MoneyColumn({ nullable: true }) availableAmount: number | null;
  @Column({ type: 'integer' }) latencyMs: number;
  @CreatedAt() createdAt: Date;
}

@Entity('credit_reservation')
@Index('uq_reservation_attempt', ['orderId', 'providerId', 'attemptNo'], { unique: true })
@Index('ix_reservation_status', ['status'])
@Index('ix_reservation_consumer', ['consumerUserId'])
export class CreditReservation {
  @IdColumn() id: string;
  @RefColumn() orderId: string;
  @RefColumn() providerId: string;
  @RefColumn() consumerUserId: string;
  @Column({ type: 'integer' }) attemptNo: number;
  @MoneyColumn() amount: number;
  @EnumCol(['Requested', 'Reserved', 'Failed', 'ReleasePending', 'Released', 'AllocationPending', 'Allocated', 'NeedsReconciliation']) status: ReservationStatus;
  /** Direction of an unresolved NeedsReconciliation (never switches, §5.2). */
  @Column({ type: 'varchar', length: 12, nullable: true }) reconDirection: 'Allocation' | 'Release' | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) providerReference: string | null;
  /** The order's payment deadline at reservation time (for the `stuck` filter, FR-112). */
  @Timestamp({ nullable: true }) holdDeadlineAt: Date | null;
  @Timestamp({ nullable: true }) reservedAt: Date | null;
  @Timestamp({ nullable: true }) allocatedAt: Date | null;
  @Timestamp({ nullable: true }) releasedAt: Date | null;
  @MoneyColumn({ default: 0 }) reversedAmount: number;
  @VersionCol() version: number;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}

@Entity('provider_transaction')
@Index('ix_ptx_due', ['status', 'nextAttemptAt'])
@Index('ix_ptx_order', ['orderId'])
@Index('ix_ptx_reservation', ['reservationId'])
export class ProviderTransaction {
  /** Doubles as the idempotency reference sent to the provider (BR-PRV-04). */
  @IdColumn() id: string;
  @RefColumn({ nullable: true }) orderId: string | null;
  @RefColumn({ nullable: true }) reservationId: string | null;
  @RefColumn({ nullable: true }) refundLegId: string | null;
  @RefColumn() providerId: string;
  @EnumCol(PROVIDER_TRANSACTION_TYPES) type: ProviderTransactionType;
  @MoneyColumn() amount: number;
  @EnumCol(PROVIDER_TRANSACTION_STATUSES) status: ProviderTransactionStatus;
  @Column({ type: 'varchar', length: 100, nullable: true }) providerReference: string | null;
  @Column({ type: 'integer', default: 0 }) attempts: number;
  @Timestamp({ nullable: true }) nextAttemptAt: Date | null;
  @Column({ type: 'varchar', length: 300, nullable: true }) lastError: string | null;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}
