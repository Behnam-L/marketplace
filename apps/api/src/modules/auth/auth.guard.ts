import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUTH_KIND } from '../../shared/http/auth-context';
import { AppError } from '../../shared/errors/app-error';
import { AuthKind, AuthRegistry } from './auth-registry';

@Injectable()
export class GlobalAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly registry: AuthRegistry,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const kind = this.reflector.getAllAndOverride<AuthKind | undefined>(AUTH_KIND, [ctx.getHandler(), ctx.getClass()]);
    if (!kind) return true;
    const authenticator = this.registry.get(kind);
    if (!authenticator) throw new AppError('SERVICE_UNAVAILABLE', `No authenticator registered for ${kind}.`);
    await authenticator(ctx.switchToHttp().getRequest<Request>(), ctx);
    return true;
  }
}
