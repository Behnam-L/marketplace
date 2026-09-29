import { Column, Entity, Index } from 'typeorm';
import type { DispatchStatus, OtpSessionStatus } from '@bajet/contracts';
import { CreatedAt, EnumCol, IdColumn, RefColumn, Timestamp } from '../../shared/database/columns';

/** Browser session bound to one order; OTP verification lives here (FR-010, D-28). */
@Entity('checkout_session')
@Index('uq_checkout_session_token', ['tokenHash'], { unique: true })
@Index('ix_checkout_session_order', ['orderId'])
export class CheckoutSession {
  @IdColumn() id: string;
  @RefColumn() orderId: string;
  @Column({ type: 'varchar', length: 64 }) tokenHash: string;
  @Timestamp({ nullable: true }) otpVerifiedAt: Date | null;
  @Timestamp() expiresAt: Date;
  @Column({ type: 'varchar', length: 64, nullable: true }) ip: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) userAgent: string | null;
  @CreatedAt() createdAt: Date;
}

@Entity('otp_session')
@Index('uq_otp_sent_per_order', ['orderId'], { unique: true, where: `status = 'Sent'` })
@Index('ix_otp_consumer_created', ['consumerUserId', 'createdAt'])
export class OtpSession {
  @IdColumn() id: string;
  @RefColumn() orderId: string;
  @RefColumn() checkoutSessionId: string;
  @RefColumn() consumerUserId: string;
  /** HMAC of `${id}:${code}` — the code itself is never stored or logged. */
  @Column({ type: 'varchar', length: 64 }) codeHash: string;
  @Timestamp() expiresAt: Date;
  @Column({ type: 'integer', default: 0 }) attempts: number;
  @EnumCol(['Sent', 'Verified', 'Expired', 'LockedOut', 'Superseded']) status: OtpSessionStatus;
  @EnumCol(['Pending', 'Sent', 'Failed']) dispatchStatus: DispatchStatus;
  @Column({ type: 'varchar', length: 60, nullable: true }) smsProvider: string | null;
  @CreatedAt() createdAt: Date;
}
