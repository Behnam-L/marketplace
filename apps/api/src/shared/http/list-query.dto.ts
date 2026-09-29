import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** `?cursor=&limit=` (limit ≤ 100, default 25). */
export class ListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
