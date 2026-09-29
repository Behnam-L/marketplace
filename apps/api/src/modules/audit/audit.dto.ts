import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListQueryDto } from '../../shared/http/list-query.dto';

export class AuditQueryDto extends ListQueryDto {
  @IsOptional() @IsString() @MaxLength(40) actorId?: string;
  @IsOptional() @IsString() @MaxLength(60) entityType?: string;
  @IsOptional() @IsString() @MaxLength(80) entityId?: string;
  @IsOptional() @IsString() @MaxLength(120) action?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}
