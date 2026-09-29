import { Column, Entity, Index } from 'typeorm';
import type { ApiKeyStatus, EnabledStatus, MerchantEntityType, WebhookEventStatus } from '@bajet/contracts';
import { CreatedAt, EnumCol, IdColumn, RefColumn, Timestamp, UpdatedAt, VersionCol } from '../../shared/database/columns';

@Entity('merchant')
@Index('uq_merchant_national_id', ['nationalId'], { unique: true })
@Index('uq_merchant_economic_id', ['economicId'], { unique: true, where: 'economic_id IS NOT NULL' })
export class Merchant {
  @IdColumn() id: string;
  @Column({ type: 'varchar', length: 100 }) displayName: string;
  @EnumCol(['Individual', 'Legal']) entityType: MerchantEntityType;
  @Column({ type: 'varchar', length: 200 }) legalName: string;
  @Column({ type: 'varchar', length: 11 }) nationalId: string;
  @Column({ type: 'varchar', length: 12, nullable: true }) economicId: string | null;
  @Column({ type: 'varchar', length: 100 }) managerName: string;
  @Column({ type: 'varchar', length: 10 }) managerNationalCode: string;
  @Column({ type: 'varchar', length: 16 }) contactNumber: string;
  @Column({ type: 'varchar', length: 2048 }) websiteUrl: string;
  @Column({ type: 'varchar', length: 500 }) officeAddress: string;
  @Column({ type: 'varchar', length: 26 }) iban: string;
  @RefColumn({ nullable: true }) contractFileId: string | null;
  @RefColumn() merchantSettlementPlanId: string;
  @EnumCol(['Enabled', 'Disabled']) status: EnabledStatus;
  @Column({ type: 'text', array: true, default: '{}' }) returnUrlDomains: string[];
  @Column({ type: 'varchar', length: 2048, nullable: true }) webhookUrl: string | null;
  @VersionCol() version: number;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}

@Entity('merchant_api_key')
@Index('uq_api_key_id', ['keyId'], { unique: true })
@Index('ix_api_key_merchant', ['merchantId'])
export class MerchantApiKey {
  @IdColumn() id: string;
  @RefColumn() merchantId: string;
  @Column({ type: 'varchar', length: 40 }) keyId: string;
  @Column({ type: 'text' }) secretEnc: string;
  @EnumCol(['Active', 'Revoked']) status: ApiKeyStatus;
  @Timestamp({ nullable: true }) lastUsedAt: Date | null;
  @Timestamp({ nullable: true }) revokedAt: Date | null;
  @CreatedAt() createdAt: Date;
}

@Entity('merchant_webhook_event')
@Index('ix_webhook_due', ['status', 'nextAttemptAt'])
@Index('ix_webhook_merchant', ['merchantId'])
export class MerchantWebhookEvent {
  @IdColumn() id: string;
  @RefColumn() merchantId: string;
  @Column({ type: 'varchar', length: 40 }) eventType: string;
  @Column({ type: 'jsonb' }) payload: object;
  @Column({ type: 'varchar', length: 2048 }) targetUrl: string;
  @EnumCol(['Pending', 'Retrying', 'Delivered', 'Exhausted']) status: WebhookEventStatus;
  @Column({ type: 'integer', default: 0 }) attempts: number;
  @Timestamp({ nullable: true }) nextAttemptAt: Date | null;
  @Column({ type: 'integer', nullable: true }) lastHttpStatus: number | null;
  @Column({ type: 'varchar', length: 300, nullable: true }) lastError: string | null;
  @Timestamp({ nullable: true }) deliveredAt: Date | null;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}
