import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import {
  DOCUMENT_STATUSES,
  INVOICE_STATUSES,
  type CreateManualDocumentRequest,
  type ManualDocumentReason,
  type MerchantPlanInput,
  type ProviderPlanInput,
  type RecordInvoicePaymentRequest,
} from '@bajet/contracts';
import { ListQueryDto } from '../../shared/http/list-query.dto';
import { IsBps, IsMoney } from '../../shared/http/validators';

export class ProviderPlanDto implements ProviderPlanInput {
  @IsBps() providerPayableMarginBps: number;
  @IsInt() @Min(1) @Max(6) installmentCount: number;
  @IsIn(['EndOfJalaliMonth']) maturityRule: 'EndOfJalaliMonth';
}

export class UpdateProviderPlanDto implements Partial<ProviderPlanInput> {
  @IsOptional() @IsBps() providerPayableMarginBps?: number;
  @IsOptional() @IsInt() @Min(1) @Max(6) installmentCount?: number;
  @IsOptional() @IsIn(['EndOfJalaliMonth']) maturityRule?: 'EndOfJalaliMonth';
  @IsOptional() @IsInt() version?: number;
}

export class MerchantPlanDto implements MerchantPlanInput {
  @IsBps() merchantReceivableMarginBps: number;
  @IsBoolean() cashSettlementEnabled: boolean;
  @ValidateIf((o: MerchantPlanDto) => o.cashSettlementBps !== null && o.cashSettlementBps !== undefined)
  @IsInt()
  cashSettlementBps: number | null;
  @IsInt() @Min(1) @Max(6) installmentCount: number;
  @IsIn(['EndOfJalaliMonth']) maturityRule: 'EndOfJalaliMonth';
}

export class UpdateMerchantPlanDto implements Partial<MerchantPlanInput> {
  @IsOptional() @IsBps() merchantReceivableMarginBps?: number;
  @IsOptional() @IsBoolean() cashSettlementEnabled?: boolean;
  @IsOptional() @ValidateIf((o: UpdateMerchantPlanDto) => o.cashSettlementBps !== null) @IsInt() cashSettlementBps?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(6) installmentCount?: number;
  @IsOptional() @IsIn(['EndOfJalaliMonth']) maturityRule?: 'EndOfJalaliMonth';
  @IsOptional() @IsInt() version?: number;
}

export class PlanQueryDto {
  @IsOptional() @IsIn(['Active', 'Archived']) status?: string;
}

export class CreateManualDocumentDto implements CreateManualDocumentRequest {
  @IsIn(['Payable', 'Receivable']) direction: 'Payable' | 'Receivable';
  @IsIn(['Merchant', 'Provider', 'Consumer']) counterpartyType: 'Merchant' | 'Provider' | 'Consumer';
  @IsString() @MaxLength(40) counterpartyId: string;
  @IsMoney() amount: number;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'maturityDate must be YYYY-MM-DD' }) maturityDate: string;
  @IsOptional() @IsString() @MaxLength(40) orderId?: string | null;
  @IsIn(['Adjustment', 'ReconciliationResolution', 'Other']) reason: ManualDocumentReason;
  @IsString() @MinLength(10, { message: 'Note must be at least 10 characters.' }) @MaxLength(1000) note: string;
}

export class DocumentActionDto {
  @IsString() @MaxLength(500) note: string;
}

export class DocumentQueryDto extends ListQueryDto {
  @IsOptional() @IsIn(['Payable', 'Receivable']) direction?: 'Payable' | 'Receivable';
  @IsOptional() @IsIn(DOCUMENT_STATUSES) status?: string;
  @IsOptional() @IsIn(['OrderSettlement', 'CashSettlement', 'Refund', 'Manual']) kind?: string;
  @IsOptional() @IsIn(['Merchant', 'Provider', 'Consumer']) counterpartyType?: string;
  @IsOptional() @IsString() @MaxLength(40) counterpartyId?: string;
  @IsOptional() @IsString() @MaxLength(40) orderId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) maturityFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) maturityTo?: string;
}

export class InvoiceQueryDto extends ListQueryDto {
  @IsOptional() @IsIn(['Payable', 'Receivable']) direction?: 'Payable' | 'Receivable';
  @IsOptional() @IsIn(INVOICE_STATUSES) status?: string;
  @IsOptional() @IsIn(['Merchant', 'Provider', 'Consumer']) counterpartyType?: string;
  @IsOptional() @IsString() @MaxLength(40) counterpartyId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dueFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dueTo?: string;
}

export class RecordPaymentDto implements RecordInvoicePaymentRequest {
  @IsMoney() amount: number;
  @IsISO8601() paidAt: string;
  @IsString() @MinLength(3) @MaxLength(100) bankReference: string;
}

export class VersionQuery {
  @IsOptional() @Type(() => Number) @IsInt() version?: number;
}
