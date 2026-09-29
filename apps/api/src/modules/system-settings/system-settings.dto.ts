import { IsDefined, IsString, MaxLength, MinLength } from 'class-validator';
import type { UpdateSettingRequest } from '@bajet/contracts';

export class UpdateSettingDto implements UpdateSettingRequest {
  /** Integer or boolean, validated against the key's type and range. */
  @IsDefined()
  value: number | boolean;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
