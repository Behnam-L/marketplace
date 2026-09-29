import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MESSAGE_STATUSES, type MessageTemplateInput } from '@bajet/contracts';
import { ListQueryDto } from '../../shared/http/list-query.dto';

export class MessageTemplateDto implements MessageTemplateInput {
  @IsString() @MaxLength(60) event: string;
  @IsIn(['SMS']) channel: 'SMS';
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @IsString() @MinLength(1) @MaxLength(1000) content: string;
  @IsIn(['Active', 'Inactive']) status: 'Active' | 'Inactive';
}

export class UpdateMessageTemplateDto implements Partial<MessageTemplateInput> {
  @IsOptional() @IsString() @MaxLength(60) event?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(1000) content?: string;
  @IsOptional() @IsIn(['Active', 'Inactive']) status?: 'Active' | 'Inactive';
}

export class MessageLogQueryDto extends ListQueryDto {
  @IsOptional() @IsString() @MaxLength(60) event?: string;
  @IsOptional() @IsIn(MESSAGE_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(20) recipient?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}
