import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type {
  AcceptInvitationRequest,
  ConfirmTotpRequest,
  LoginRequest,
  MfaRequest,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  StepUpRequest,
} from '@bajet/contracts';

export class LoginDto implements LoginRequest {
  @IsString() @MaxLength(20) phone: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
}
export class MfaDto implements MfaRequest {
  @IsString() @MaxLength(100) mfaToken: string;
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code.' }) totp: string;
}
export class AcceptInvitationDto implements AcceptInvitationRequest {
  @IsString() @MaxLength(100) token: string;
  @IsString() @MaxLength(200) password: string;
}
export class ConfirmTotpDto implements ConfirmTotpRequest {
  @IsString() @MaxLength(100) token: string;
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code.' }) totp: string;
}
export class PasswordResetRequestDto implements PasswordResetRequest {
  @IsString() @MaxLength(20) phone: string;
}
export class PasswordResetConfirmDto implements PasswordResetConfirmRequest {
  @IsString() @MaxLength(100) token: string;
  @IsString() @MaxLength(200) newPassword: string;
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code.' }) totp: string;
}
export class StepUpDto implements StepUpRequest {
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code.' }) totp: string;
}
