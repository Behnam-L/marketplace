import { Column, Entity, Index } from 'typeorm';
import { REFUND_STATUSES, type RefundInitiator, type RefundLegStatus, type RefundLegType, type RefundStatus } from '@bajet/contracts';
import { CreatedAt, EnumCol, IdColumn, MoneyColumn, RefColumn, UpdatedAt, VersionCol } from '../../shared/database/columns';

@Entity('refund')
@Index('ix_refund_order', ['orderId'])
@Index('ix_refund_created', ['createdAt'])
export class Refund {
  @IdColumn() id: string;
  @RefColumn() orderId: string;
  @RefColumn() merchantId: string;
  @MoneyColumn() amount: number;
  /** Cumulative refunded amount including this refund (Cⱼ, BR-RFD-02). */
  @MoneyColumn() cumulativeAmount: number;
  @MoneyColumn() merchantMarginRefund: number;
  @EnumCol(REFUND_STATUSES) status: RefundStatus;
  @EnumCol(['Merchant', 'Admin']) initiatedBy: RefundInitiator;
  @RefColumn({ nullable: true }) actorId: string | null;
  @Column({ type: 'varchar', length: 500 }) reason: string;
  @VersionCol() version: number;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}

@Entity('refund_leg')
@Index('ix_refund_leg_refund', ['refundId'])
export class RefundLeg {
  @IdColumn() id: string;
  @RefColumn() refundId: string;
  @EnumCol(['Cash', 'Credit']) legType: RefundLegType;
  @RefColumn({ nullable: true }) providerId: string | null;
  @RefColumn({ nullable: true }) reservationId: string | null;
  @MoneyColumn() amount: number;
  @MoneyColumn({ default: 0 }) providerMarginRefund: number;
  @EnumCol(['Pending', 'Succeeded', 'Failed', 'NeedsReconciliation']) status: RefundLegStatus;
  /** Cash leg paid back through the gateway refund API (else a consumer payable document). */
  @Column({ type: 'boolean', default: false }) viaGateway: boolean;
  @Column({ type: 'varchar', length: 40, nullable: true }) gatewayCode: string | null;
  @Column({ type: 'text', nullable: true }) payeeIbanEnc: string | null;
  @RefColumn({ nullable: true }) documentId: string | null;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}
