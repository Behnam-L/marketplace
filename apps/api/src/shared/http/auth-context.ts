import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Permission } from '@bajet/contracts';

/** Authenticated principals attached to the request by the guards. */
export interface AdminPrincipal {
  kind: 'admin';
  adminId: string;
  sessionId: string;
  roleId: string;
  permissions: Set<Permission>;
  name: string;
  stepUpAt: Date | null;
}
export interface MerchantPrincipal {
  kind: 'merchant';
  merchantId: string;
  keyId: string;
}
export interface CheckoutPrincipal {
  kind: 'checkout';
  sessionId: string;
  orderId: string;
  otpVerified: boolean;
}
export type Principal = AdminPrincipal | MerchantPrincipal | CheckoutPrincipal;

const PRINCIPAL = Symbol('principal');

export function setPrincipal(req: Request, p: Principal): void {
  (req as unknown as Record<symbol, Principal>)[PRINCIPAL] = p;
}
export function principalOf(req: Request): Principal | undefined {
  return (req as unknown as Record<symbol, Principal | undefined>)[PRINCIPAL];
}

export function actorScopeOf(req: Request): string {
  const p = principalOf(req);
  if (!p) return `anon:${req.ip}`;
  if (p.kind === 'admin') return `admin:${p.adminId}`;
  if (p.kind === 'merchant') return `merchant:${p.merchantId}`;
  return `checkout:${p.orderId}`;
}

/* Route metadata consumed by the guards. */
export const AUTH_KIND = 'bajet:auth-kind';
export const ADMIN_PERMISSIONS = 'bajet:admin-permissions';
export const CHECKOUT_OTP = 'bajet:checkout-otp';

/** `ADM:<perm>` — admin session + CSRF + all listed permissions (empty = any admin). */
export const AdminAuth = (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  ((target: object, key?: string | symbol, desc?: PropertyDescriptor) => {
    SetMetadata(AUTH_KIND, 'admin')(target, key as string, desc as PropertyDescriptor);
    SetMetadata(ADMIN_PERMISSIONS, permissions)(target, key as string, desc as PropertyDescriptor);
  }) as MethodDecorator & ClassDecorator;

/** `MER` — merchant HMAC request signing. */
export const MerchantAuth = (): MethodDecorator & ClassDecorator => SetMetadata(AUTH_KIND, 'merchant');

/** `CHK` — checkout session cookie; `otp = true` requires OTP verification on this session (✓). */
export const CheckoutAuth = (otp = false): MethodDecorator & ClassDecorator =>
  ((target: object, key?: string | symbol, desc?: PropertyDescriptor) => {
    SetMetadata(AUTH_KIND, 'checkout')(target, key as string, desc as PropertyDescriptor);
    SetMetadata(CHECKOUT_OTP, otp)(target, key as string, desc as PropertyDescriptor);
  }) as MethodDecorator & ClassDecorator;

export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext): AdminPrincipal => {
  const p = principalOf(ctx.switchToHttp().getRequest<Request>());
  if (!p || p.kind !== 'admin') throw new Error('No admin principal');
  return p;
});
export const CurrentMerchant = createParamDecorator((_: unknown, ctx: ExecutionContext): MerchantPrincipal => {
  const p = principalOf(ctx.switchToHttp().getRequest<Request>());
  if (!p || p.kind !== 'merchant') throw new Error('No merchant principal');
  return p;
});
export const CurrentCheckout = createParamDecorator((_: unknown, ctx: ExecutionContext): CheckoutPrincipal => {
  const p = principalOf(ctx.switchToHttp().getRequest<Request>());
  if (!p || p.kind !== 'checkout') throw new Error('No checkout principal');
  return p;
});
