import { Column, Entity, Index } from 'typeorm';
import type { ConnectionStatus, EnabledStatus, InquiryKey, ProviderAdapterType } from '@bajet/contracts';
import { CreatedAt, EnumCol, IdColumn, RefColumn, Timestamp, UpdatedAt, VersionCol } from '../../shared/database/columns';

@Entity('credit_provider')
@Index('uq_provider_national_id', ['nationalId'], { unique: true })
@Index('uq_provider_economic_id', ['economicId'], { unique: true })
export class CreditProvider {
  @IdColumn() id: string;
  @Column({ type: 'varchar', length: 200 }) legalName: string;
  @Column({ type: 'varchar', length: 100 }) displayName: string;
  @RefColumn({ nullable: true }) iconFileId: string | null;
  @Column({ type: 'varchar', length: 11 }) nationalId: string;
  @Column({ type: 'varchar', length: 12 }) economicId: string;
  @Column({ type: 'varchar', length: 2048 }) websiteUrl: string;
  @Column({ type: 'varchar', length: 16 }) contactNumber: string;
  @Column({ type: 'varchar', length: 500 }) officeAddress: string;
  @Column({ type: 'varchar', length: 26 }) iban: string;
  @RefColumn({ nullable: true }) contractFileId: string | null;
  @RefColumn() providerSettlementPlanId: string;
  @EnumCol(['Enabled', 'Disabled']) displayStatus: EnabledStatus;
  @EnumCol(['Connected', 'Degraded', 'Disconnected']) connectionStatus: ConnectionStatus;
  @Timestamp({ nullable: true }) connectionStatusChangedAt: Date | null;
  @EnumCol(['Mock']) adapterType: ProviderAdapterType;
  @Column({ type: 'varchar', length: 2048 }) apiBaseUrl: string;
  /** Reference into the secret store; never the secret itself. */
  @Column({ type: 'varchar', length: 200 }) credentialsRef: string;
  @EnumCol(['NationalId', 'Phone']) inquiryKey: InquiryKey;
  @Column({ type: 'integer', default: 0 }) sortOrder: number;
  @VersionCol() version: number;
  @CreatedAt() createdAt: Date;
  @UpdatedAt() updatedAt: Date;
}

/** Append-only log of provider calls (redacted). */
@Entity('provider_call_log')
@Index('ix_pcl_provider_created', ['providerId', 'createdAt'])
@Index('ix_pcl_ptx', ['providerTransactionId'])
export class ProviderCallLog {
  @IdColumn() id: string;
  @RefColumn({ nullable: true }) providerTransactionId: string | null;
  @RefColumn() providerId: string;
  @Column({ type: 'varchar', length: 30 }) operation: string;
  @Column({ type: 'jsonb', nullable: true }) request: object | null;
  @Column({ type: 'jsonb', nullable: true }) response: object | null;
  @Column({ type: 'integer', nullable: true }) httpStatus: number | null;
  @Column({ type: 'integer' }) latencyMs: number;
  @Column({ type: 'varchar', length: 20 }) outcome: string;
  @CreatedAt() createdAt: Date;
}
