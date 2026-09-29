import { Type } from 'class-transformer';
import { ArrayMaxSize, Equals, IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import {
  ORDER_NUMBER_PATTERN,
  type AcceptTermsRequest,
  type ConfirmRequest,
  type CreateCheckoutRequest,
  type CreateCheckoutSessionRequest,
  type DobRequest,
  type NationalIdRequest,
  type QuoteRequest,
  type VerifyOtpRequest,
} from '@bajet/contracts';
import { IsHttpsUrl, IsIranPhone, IsMoney } from '../../shared/http/validators';

export class AvailabilityQueryDto {
  @Type(() => Number) @IsInt({ message: 'amount must be an integer (Toman).' }) @Min(1) amount: number;
}

export class CreateCheckoutDto implements CreateCheckoutRequest {
  @Matches(ORDER_NUMBER_PATTERN, { message: 'orderNumber must be 1–64 characters: letters, digits, _ or -.' }) orderNumber: string;
  @IsMoney() amount: number;
  @IsIranPhone() phoneNumber: string;
  @IsHttpsUrl() returnUrl: string;
  @IsOptional() @IsHttpsUrl() callbackUrl?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateSessionDto implements CreateCheckoutSessionRequest {
  @IsString() @MaxLength(100) checkoutToken: string;
}

export class AcceptTermsDto implements AcceptTermsRequest {
  @IsString() @MaxLength(20) termsVersion: string;
  @Equals(true, { message: 'Please accept the terms and conditions to continue.' }) accepted: true;
}

export class VerifyOtpDto implements VerifyOtpRequest {
  @IsString() @MaxLength(40) otpSessionId: string;
  @Matches(/^\d{5}$/, { message: 'Enter the 5-digit code.' }) code: string;
}

export class NationalIdDto implements NationalIdRequest {
  @IsString() @MaxLength(20) nationalId: string;
}

export class DobDto implements DobRequest {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must be YYYY-MM-DD (Gregorian).' }) dateOfBirth: string;
}

export class QuoteDto implements QuoteRequest {
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) providerIds: string[];
  @IsBoolean() cashOnly: boolean;
}

export class ConfirmDto implements ConfirmRequest {
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) providerIds: string[];
  @IsBoolean() cashOnly: boolean;
  @IsString() @MaxLength(64) quoteHash: string;
}
