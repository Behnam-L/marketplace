import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import type { ProviderInput } from '@bajet/contracts';
import { IsHttpsUrl, IsIban } from '../../shared/http/validators';
import { ListQueryDto } from '../../shared/http/list-query.dto';

const CONTACT = /^[0-9۰-۹+\s-]{8,20}$/;

export class ProviderDto implements ProviderInput {
  @IsString() @MinLength(1) @MaxLength(200) legalName: string;
  @IsString() @MinLength(1) @MaxLength(100) displayName: string;
  @IsOptional() @ValidateIf((o: ProviderDto) => o.iconFileId !== null) @IsString() @MaxLength(40) iconFileId: string | null;
  @IsString() @MaxLength(11) nationalId: string;
  @IsString() @MaxLength(12) economicId: string;
  @IsHttpsUrl() websiteUrl: string;
  @Matches(CONTACT, { message: 'Please enter a valid contact number.' }) contactNumber: string;
  @IsString() @MinLength(1) @MaxLength(500) officeAddress: string;
  @IsIban() iban: string;
  @IsOptional() @ValidateIf((o: ProviderDto) => o.contractFileId !== null) @IsString() @MaxLength(40) contractFileId: string | null;
  @IsString() @MaxLength(40) providerSettlementPlanId: string;
  @IsIn(['Enabled', 'Disabled']) displayStatus: 'Enabled' | 'Disabled';
  @IsIn(['Mock']) adapterType: 'Mock';
  @IsHttpsUrl() apiBaseUrl: string;
  @IsString() @MinLength(1) @MaxLength(200) credentialsRef: string;
  @IsIn(['NationalId', 'Phone']) inquiryKey: 'NationalId' | 'Phone';
  @IsInt() @Min(0) @Max(10000) sortOrder: number;
}

export class UpdateProviderDto implements Partial<ProviderInput> {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) legalName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) displayName?: string;
  @IsOptional() @ValidateIf((o: UpdateProviderDto) => o.iconFileId !== null) @IsString() @MaxLength(40) iconFileId?: string | null;
  @IsOptional() @IsString() @MaxLength(11) nationalId?: string;
  @IsOptional() @IsString() @MaxLength(12) economicId?: string;
  @IsOptional() @IsHttpsUrl() websiteUrl?: string;
  @IsOptional() @Matches(CONTACT, { message: 'Please enter a valid contact number.' }) contactNumber?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) officeAddress?: string;
  @IsOptional() @IsIban() iban?: string;
  @IsOptional() @ValidateIf((o: UpdateProviderDto) => o.contractFileId !== null) @IsString() @MaxLength(40) contractFileId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) providerSettlementPlanId?: string;
  @IsOptional() @IsIn(['Enabled', 'Disabled']) displayStatus?: 'Enabled' | 'Disabled';
  @IsOptional() @IsIn(['Mock']) adapterType?: 'Mock';
  @IsOptional() @IsHttpsUrl() apiBaseUrl?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) credentialsRef?: string;
  @IsOptional() @IsIn(['NationalId', 'Phone']) inquiryKey?: 'NationalId' | 'Phone';
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000) sortOrder?: number;
}

export class ProviderQueryDto extends ListQueryDto {
  @IsOptional() @IsIn(['Enabled', 'Disabled']) displayStatus?: string;
  @IsOptional() @IsIn(['Connected', 'Degraded', 'Disconnected']) connectionStatus?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(['createdAt', 'sortOrder', 'displayName']) sort?: 'createdAt' | 'sortOrder' | 'displayName';
}
