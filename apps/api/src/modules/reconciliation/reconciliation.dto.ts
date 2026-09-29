import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { RECONCILIATION_ITEM_TYPES, RECONCILIATION_STATUSES, RESOLUTION_TYPES, type ResolutionType, type UpdateReconciliationItemRequest } from '@bajet/contracts';
import { ListQueryDto } from '../../shared/http/list-query.dto';

export class ReconciliationQueryDto extends ListQueryDto {
  @IsOptional() @IsIn(RECONCILIATION_STATUSES) status?: string;
  @IsOptional() @IsIn(RECONCILIATION_ITEM_TYPES) type?: string;
  @IsOptional() @IsString() @MaxLength(40) assigneeId?: string;
  @IsOptional() @IsString() @MaxLength(40) orderId?: string;
}

export class UpdateReconciliationItemDto implements UpdateReconciliationItemRequest {
  @IsOptional() @IsIn(['InReview', 'Resolved']) status?: 'InReview' | 'Resolved';
  @IsOptional() @ValidateIf((o: UpdateReconciliationItemDto) => o.assigneeId !== null) @IsString() @MaxLength(40) assigneeId?: string | null;
  @IsOptional() @IsIn(RESOLUTION_TYPES) resolutionType?: ResolutionType;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @ValidateIf((o: UpdateReconciliationItemDto) => o.linkedDocumentId !== null) @IsString() @MaxLength(40) linkedDocumentId?: string | null;
}

export class PspReportDto {
  @IsString() @MaxLength(40) gatewayCode: string;
}
