import { Check, Column, Entity, Index } from 'typeorm';
import {
  ALLOCATION_STATUSES,
  ORDER_REFUND_STATUSES,
  ORDER_STATUSES,
  type AllocationStatus,
  type OrderFailureReason,
  type OrderStatus,
  type RefundStatusOnOrder,
} from '@bajet/contracts';
import { CreatedAt, EnumCol, IdColumn, MoneyColumn, RefColumn, Timestamp, UpdatedAt, VersionCol } from '../../shared/database/columns';
import type { SettlementTermsSnapshot } from '../settlements/snapshot';

@Entity('order')
@Index('uq_order_merchant_number_active', ['merchantId', 'merchantOrderNumber'], {
  unique: true,
  where: `status NOT IN ('Cancelled', 'Expired', 'Failed')`,
})
@Index('ix_order_status_session', ['status', 'sessionExpiresAt'])
@Index('ix_order_status_deadline', ['status', 'paymentDeadlineAt'])
@Index('ix_order_consumer', ['consumerUserId'])
@Index('ix_order_token', ['checkoutTokenHash'], { unique: true })
@Index('ix_order_created', ['createdAt'])
@Check('ck_order_amounts', `(cash_amount IS NULL AND credit_amount IS NULL) OR (cash_amount + credit_amount = total_amount)`)
export class Order {
  @IdColumn() id: string;
  @RefColumn() merchantId: string;
  @Column({ type: 'varchar', length: 64 }) merchantOrderNumber: string;
  @RefColumn() consumerUserId: string;
  @MoneyColumn() totalAmount: number;
  @MoneyColumn({ nullable: true }) cashAmount: number | null;
  @MoneyColumn({ nullable: true }) creditAmount: number | null;
  /** Snapshotted on first entry to AwaitingSupplierSelection (BR-CALC-05). */
  @Column({ type: 'integer', nullable: true }) cashPaymentBps: number | null;
  @EnumCol(ORDER_STATUSES) status: OrderStatus;
  @Column({ type: 'varchar', length: 30, nullable: true }) failureReason: OrderFailureReason | null;
  @EnumCol(ALLOCATION_STATUSES, { nullable: true }) allocationStatus: AllocationStatus | null;
  @EnumCol(ORDER_REFUND_STATUSES, { default: 'None' }) refundStatus: RefundStatusOnOrder;
  @MoneyColumn({ default: 0 }) refundedAmount: number;
  @Timestamp() sessionExpiresAt: Date;
  @Timestamp({ nullable: true }) paymentDeadlineAt: Date | null;
  @Column({ type: 'integer', default: 0 }) inquiryAttempts: number;
  @Column({ type: 'integer', default: 0 }) reservationAttempts: number;
  @Column({ type: 'varchar', length: 64, nullable: true }) quoteHash: string | null;
  /** True when the consumer confirmed "Pay fully by bank card". */
  @Column({ type: 'boolean', default: false }) cashOnly: boolean;
  @Column({ type: 'varchar', length: 2048 }) returnUrl: string;
  @Column({ type: 'varchar', length: 2048, nullable: true }) callbackUrl: string | null;
  @Column({ type: 'varchar', length: 64 }) checkoutTokenHash: string;
  /** Encrypted so a resumed checkout can return the same checkoutUrl. */
  @Column({ type: 'text' }) checkoutTokenEnc: string;
  @Column({ type: 'varchar', length: 20, nullable: true }) termsVersion: string | null;
  @Timestamp({ nullable: true }) termsAcceptedAt: Date | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) termsAcceptedIp: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) termsAcceptedUserAgent: string | null;
  @Column({ type: 'jsonb', nullable: true }) settlementTermsSnapshot: SettlementTermsSnapshot | null;
  @Timestamp({ nullable: true }) completedAt: Date | null;
  /** The bank transaction that claimed the order (first verified success wins, BR-BANK-01). */
  @RefColumn({ nullable: true }) claimedBankTransactionId: string | null;
  @Timestamp({ nullable: true }) cancelRequestedAt: Date | null;
  /** A cancel request lost to a successful payment (FR-045). */
  @Column({ type: 'boolean', default: false }) cancelNotApplied: boolean;
  @Column({ type: 'jsonb', nullable: true }) metadata: object | null;
  @VersionCol() version: number;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}

/** Append-only order timeline. */
@Entity('order_event')
@Index('ix_order_event_order', ['orderId', 'createdAt'])
export class OrderEvent {
  @IdColumn() id: string;
  @RefColumn() orderId: string;
  @EnumCol(ORDER_STATUSES, { nullable: true }) fromStatus: OrderStatus | null;
  @EnumCol(ORDER_STATUSES) toStatus: OrderStatus;
  @Column({ type: 'varchar', length: 60 }) actor: string;
  @Column({ type: 'varchar', length: 300, nullable: true }) reason: string | null;
  @CreatedAt() createdAt: Date;
}
