import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { from, Observable, of, switchMap, tap, catchError, throwError } from 'rxjs';
import { HEADER_IDEMPOTENCY_KEY } from '@bajet/contracts';
import { AppError } from '../errors/app-error';
import { IdempotencyService } from './idempotency.service';
import { actorScopeOf } from '../http/auth-context';

const IDEMPOTENT = 'bajet:idempotent';
/** Marks a handler as requiring `Idempotency-Key` (IK). */
export const Idempotent = (): MethodDecorator => SetMetadata(IDEMPOTENT, true);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly idem: IdempotencyService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.reflector.get<boolean>(IDEMPOTENT, ctx.getHandler())) return next.handle();
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const key = IdempotencyService.validateKey(req.header(HEADER_IDEMPOTENCY_KEY));
    const scope = actorScopeOf(req);
    const hash = IdempotencyService.hashRequest(req.method, req.path, req.body);
    return from(this.idem.begin(scope, key, hash)).pipe(
      switchMap((start) => {
        if (start.kind === 'replay') {
          res.status(start.response.status);
          res.setHeader('Idempotent-Replayed', 'true');
          if (start.response.status >= 400) {
            const body = start.response.body as { error: { code: never; message: string; details?: Record<string, unknown> } };
            return throwError(() => new AppError(body.error.code, body.error.message, body.error.details));
          }
          return of(start.response.body);
        }
        return next.handle().pipe(
          switchMap((body: unknown) =>
            from(this.idem.complete(scope, key, { status: res.statusCode, body })).pipe(switchMap(() => of(body))),
          ),
          catchError((err: unknown) => {
            const store =
              err instanceof AppError && err.status < 500 && err.code !== 'STATE_CHANGED' && err.code !== 'IDEMPOTENCY_IN_PROGRESS'
                ? this.idem.complete(scope, key, {
                    status: err.status,
                    body: { error: { code: err.code, message: err.message, details: err.details } },
                  })
                : this.idem.abandon(scope, key);
            return from(store).pipe(switchMap(() => throwError(() => err)));
          }),
          tap(() => undefined),
        );
      }),
    );
  }
}
