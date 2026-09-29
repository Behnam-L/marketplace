import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CONSUMER_STATUSES, type SetConsumerStatusRequest } from '@bajet/contracts';
import { ListQueryDto } from '../../shared/http/list-query.dto';

export class ConsumerQueryDto extends ListQueryDto {
  @IsOptional() @IsIn(CONSUMER_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
}

export class SetConsumerStatusDto implements SetConsumerStatusRequest {
  @IsIn(['Active', 'Blocked']) status: 'Active' | 'Blocked';
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}
