import { Column, Entity, Index } from 'typeorm';
import {
  CONSUMER_STATUSES,
  type ConsumerStatus,
  type IdentityAttemptOutcome,
  type IdentityAttemptStep,
  type IdentityLinkageStatus,
} from '@bajet/contracts';
import { CreatedAt, EnumCol, IdColumn, RefColumn, Timestamp, UpdatedAt, VersionCol } from '../../shared/database/columns';

@Entity('consumer_user')
@Index('uq_consumer_phone', ['phoneE164'], { unique: true })
export class ConsumerUser {
  @IdColumn() id: string;
  @Column({ type: 'varchar', length: 16 }) phoneE164: string;
  @EnumCol(CONSUMER_STATUSES) status: ConsumerStatus;
  @Column({ type: 'varchar', length: 100, nullable: true }) firstName: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) lastName: string | null;
  @Timestamp({ nullable: true }) cooldownUntil: Date | null;
  @Timestamp({ nullable: true }) lastTransactionAt: Date | null;
  /** First successful OTP verification (Inactive → Active). */
  @Timestamp({ nullable: true }) otpVerifiedAt: Date | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) statusReason: string | null;
  @VersionCol() version: number;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}

@Entity('identity_linkage')
@Index('uq_linkage_verified', ['consumerUserId'], { unique: true, where: `status = 'Verified'` })
@Index('ix_linkage_order', ['orderId'])
@Index('ix_linkage_consumer', ['consumerUserId'])
export class IdentityLinkage {
  @IdColumn() id: string;
  @RefColumn() consumerUserId: string;
  @Column({ type: 'text' }) nationalIdEnc: string;
  @Column({ type: 'varchar', length: 64 }) nationalIdHash: string;
  @Column({ type: 'text', nullable: true }) dobEnc: string | null;
  @EnumCol(['PendingVerification', 'Verified', 'Abandoned', 'Revoked']) status: IdentityLinkageStatus;
  /** Order that created a PendingVerification linkage (never trusted by other orders). */
  @RefColumn({ nullable: true }) orderId: string | null;
  @Timestamp({ nullable: true }) verifiedAt: Date | null;
  @Timestamp({ nullable: true }) lastMatchedAt: Date | null;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}

/** Append-only. */
@Entity('identity_attempt')
@Index('ix_identity_attempt_order', ['orderId'])
@Index('ix_identity_attempt_consumer', ['consumerUserId', 'createdAt'])
export class IdentityAttempt {
  @IdColumn() id: string;
  @RefColumn() orderId: string;
  @RefColumn() consumerUserId: string;
  @EnumCol(['NationalId', 'Dob', 'Rematch']) step: IdentityAttemptStep;
  @EnumCol(['Match', 'Mismatch', 'Error']) outcome: IdentityAttemptOutcome;
  @CreatedAt() createdAt: Date;
}
