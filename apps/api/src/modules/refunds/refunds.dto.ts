import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { REFUND_STATUSES, type CreateRefundRequest, type SetPayeeIbanRequest } from '@bajet/contracts';
import { ListQueryDto } from '../../shared/http/list-query.dto';
import { IsMoney } from '../../shared/http/validators';

export class CreateRefundDto implements CreateRefundRequest {
  @IsMoney() amount: number;
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

export class RefundQueryDto extends ListQueryDto {
  @IsOptional() @IsIn(REFUND_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(40) orderId?: string;
  @IsOptional() @IsString() @MaxLength(40) merchantId?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}

export class SetPayeeIbanDto implements SetPayeeIbanRequest {
  @IsString() @MaxLength(40) iban: string;
}
