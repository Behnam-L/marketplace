import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AcceptInvitationResponse, AdminSessionInfo, LoginResponse, MeResponse } from '@bajet/contracts';
import { AdminAuth, CurrentAdmin, type AdminPrincipal } from '../../shared/http/auth-context';
import { setAuditHint } from '../../shared/http/audit-context';
import { ReqMeta, type RequestMeta } from '../../shared/http/request-meta';
import { AuthService } from './auth.service';
import {
  AcceptInvitationDto,
  ConfirmTotpDto,
  LoginDto,
  MfaDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  StepUpDto,
} from './auth.dto';

@ApiTags('admin: auth')
@Controller('admin')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Step 1: phone + password → short-lived `mfaToken`. */
  @Post('auth/login')
  @HttpCode(200)
  login(@Body() body: LoginDto, @ReqMeta() meta: RequestMeta): Promise<LoginResponse> {
    return this.auth.login(body.phone, body.password, meta);
  }

  /** Step 2: TOTP → session cookie. */
  @Post('auth/mfa')
  @HttpCode(200)
  mfa(@Body() body: MfaDto, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response): Promise<AdminSessionInfo> {
    return this.auth.completeMfa(body.mfaToken, body.totp, meta, res);
  }

  @Post('auth/logout')
  @HttpCode(204)
  @AdminAuth()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response, @ReqMeta() meta: RequestMeta): Promise<void> {
    await this.auth.logout(req, res, meta);
  }

  /** Fresh TOTP (≤ 5 min) required for sensitive permissions (§9.1). */
  @Post('auth/step-up')
  @HttpCode(200)
  @AdminAuth()
  stepUp(@Body() body: StepUpDto, @CurrentAdmin() admin: AdminPrincipal, @Req() req: Request): Promise<AdminSessionInfo> {
    setAuditHint(req, { action: 'auth.step_up', entityType: 'AdminUser', entityId: admin.adminId });
    return this.auth.stepUp(admin, body.totp);
  }

  @Post('auth/invitations/accept')
  @HttpCode(200)
  accept(@Body() body: AcceptInvitationDto): Promise<AcceptInvitationResponse> {
    return this.auth.acceptInvitation(body.token, body.password);
  }

  @Post('auth/totp/confirm')
  @HttpCode(204)
  async confirmTotp(@Body() body: ConfirmTotpDto, @ReqMeta() meta: RequestMeta): Promise<void> {
    await this.auth.confirmTotp(body.token, body.totp, meta);
  }

  @Post('auth/password-reset/request')
  @HttpCode(202)
  async resetRequest(@Body() body: PasswordResetRequestDto, @ReqMeta() meta: RequestMeta): Promise<void> {
    await this.auth.requestPasswordReset(body.phone, meta);
  }

  @Post('auth/password-reset/confirm')
  @HttpCode(204)
  async resetConfirm(@Body() body: PasswordResetConfirmDto, @ReqMeta() meta: RequestMeta): Promise<void> {
    await this.auth.confirmPasswordReset(body.token, body.newPassword, body.totp, meta);
  }

  @Get('me')
  @AdminAuth()
  me(@CurrentAdmin() admin: AdminPrincipal): Promise<MeResponse> {
    return this.auth.me(admin);
  }
}
