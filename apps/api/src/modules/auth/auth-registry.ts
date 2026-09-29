import { ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

export type AuthKind = 'admin' | 'merchant' | 'checkout';
export type Authenticator = (req: Request, ctx: ExecutionContext) => Promise<void>;

/** Modules register the authenticator for their auth kind; the global guard dispatches. */
@Injectable()
export class AuthRegistry {
  private readonly map = new Map<AuthKind, Authenticator>();

  register(kind: AuthKind, fn: Authenticator): void {
    this.map.set(kind, fn);
  }

  get(kind: AuthKind): Authenticator | undefined {
    return this.map.get(kind);
  }
}
