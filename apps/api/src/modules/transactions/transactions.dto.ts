import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { BANK_TRANSACTION_STATUSES, PROVIDER_TRANSACTION_STATUSES, PROVIDER_TRANSACTION_TYPES } from '@bajet/contracts';
import { ListQueryDto } from '../../shared/http/list-query.dto';

export class BankTxQueryDto extends ListQueryDto {
  @IsOptional() @IsIn(BANK_TRANSACTION_STATUSES) status?: string;
  @IsOptional() @IsIn(['Payment', 'Refund']) type?: string;
  @IsOptional() @IsString() @MaxLength(40) gatewayCode?: string;
  @IsOptional() @IsString() @MaxLength(40) orderId?: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}

export class ProviderTxQueryDto extends ListQueryDto {
  @IsOptional() @IsString() @MaxLength(40) providerId?: string;
  @IsOptional() @IsIn(PROVIDER_TRANSACTION_TYPES) type?: string;
  @IsOptional() @IsIn(PROVIDER_TRANSACTION_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(40) orderId?: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() stuck?: boolean;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}
