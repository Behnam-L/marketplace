import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ALLOCATION_STATUSES, ORDER_REFUND_STATUSES, ORDER_STATUSES } from '@bajet/contracts';
import { ListQueryDto } from '../../shared/http/list-query.dto';

export class OrderQueryDto extends ListQueryDto {
  @IsOptional() @IsIn(ORDER_STATUSES) status?: string;
  @IsOptional() @IsIn(ALLOCATION_STATUSES) allocationStatus?: string;
  @IsOptional() @IsIn(ORDER_REFUND_STATUSES) refundStatus?: string;
  @IsOptional() @IsString() @MaxLength(40) merchantId?: string;
  @IsOptional() @IsString() @MaxLength(40) providerId?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(64) orderNumber?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxAmount?: number;
}

export class MerchantOrderQueryDto {
  @IsString() @MaxLength(64) orderNumber: string;
}
