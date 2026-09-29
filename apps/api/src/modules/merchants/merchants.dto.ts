import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import type { MerchantInput } from '@bajet/contracts';
import { IsHttpsUrl, IsIban } from '../../shared/http/validators';
import { ListQueryDto } from '../../shared/http/list-query.dto';

const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const CONTACT = /^[0-9۰-۹+\s-]{8,20}$/;

export class MerchantDto implements MerchantInput {
  @IsString() @MinLength(1) @MaxLength(100) displayName: string;
  @IsIn(['Individual', 'Legal']) entityType: 'Individual' | 'Legal';
  @IsString() @MinLength(1) @MaxLength(200) legalName: string;
  @IsString() @MaxLength(11) nationalId: string;
  @IsOptional() @ValidateIf((o: MerchantDto) => o.economicId !== null) @IsString() @MaxLength(12) economicId: string | null;
  @IsString() @MinLength(1) @MaxLength(100) managerName: string;
  @IsString() @MaxLength(10) managerNationalCode: string;
  @Matches(CONTACT, { message: 'Please enter a valid contact number.' }) contactNumber: string;
  @IsHttpsUrl() websiteUrl: string;
  @IsString() @MinLength(1) @MaxLength(500) officeAddress: string;
  @IsIban() iban: string;
  @IsOptional() @ValidateIf((o: MerchantDto) => o.contractFileId !== null) @IsString() @MaxLength(40) contractFileId: string | null;
  @IsString() @MaxLength(40) merchantSettlementPlanId: string;
  @IsIn(['Enabled', 'Disabled']) status: 'Enabled' | 'Disabled';
  @IsArray() @ArrayMaxSize(20) @Matches(HOST, { each: true, message: 'Each return URL domain must be a host name.' }) returnUrlDomains: string[];
  @IsOptional() @ValidateIf((o: MerchantDto) => o.webhookUrl !== null) @IsHttpsUrl() webhookUrl: string | null;
}

export class UpdateMerchantDto implements Partial<MerchantInput> {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) displayName?: string;
  @IsOptional() @IsIn(['Individual', 'Legal']) entityType?: 'Individual' | 'Legal';
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) legalName?: string;
  @IsOptional() @IsString() @MaxLength(11) nationalId?: string;
  @IsOptional() @ValidateIf((o: UpdateMerchantDto) => o.economicId !== null) @IsString() @MaxLength(12) economicId?: string | null;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) managerName?: string;
  @IsOptional() @IsString() @MaxLength(10) managerNationalCode?: string;
  @IsOptional() @Matches(CONTACT, { message: 'Please enter a valid contact number.' }) contactNumber?: string;
  @IsOptional() @IsHttpsUrl() websiteUrl?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) officeAddress?: string;
  @IsOptional() @IsIban() iban?: string;
  @IsOptional() @ValidateIf((o: UpdateMerchantDto) => o.contractFileId !== null) @IsString() @MaxLength(40) contractFileId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) merchantSettlementPlanId?: string;
  @IsOptional() @IsIn(['Enabled', 'Disabled']) status?: 'Enabled' | 'Disabled';
  @IsOptional() @IsArray() @ArrayMaxSize(20) @Matches(HOST, { each: true, message: 'Each return URL domain must be a host name.' }) returnUrlDomains?: string[];
  @IsOptional() @ValidateIf((o: UpdateMerchantDto) => o.webhookUrl !== null) @IsHttpsUrl() webhookUrl?: string | null;
}

export class MerchantQueryDto extends ListQueryDto {
  @IsOptional() @IsIn(['Enabled', 'Disabled']) status?: string;
  @IsOptional() @IsIn(['Individual', 'Legal']) entityType?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}
