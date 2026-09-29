import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { principalOf } from '../../shared/http/auth-context';
import { auditHintOf } from '../../shared/http/audit-context';
import { AuditService } from './audit.service';

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Records every successful admin mutation (FR-083). Controllers may attach the
 * previous state and entity identity via `setAuditBefore`/`setAuditHint`.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!MUTATIONS.has(req.method)) return next.handle();
    return next.handle().pipe(
      tap((result: unknown) => {
        const p = principalOf(req);
        const hint = auditHintOf(req);
        if (!p || p.kind !== 'admin' || hint.skip) return;
        const params = req.params as Record<string, string>;
        const resultId = result && typeof result === 'object' && 'id' in result ? String((result as { id: unknown }).id) : null;
        void this.audit
          .record({
            actorId: p.adminId,
            actorName: p.name,
            action: hint.action ?? `${ctx.getClass().name.replace(/Controller$/, '')}.${ctx.getHandler().name}`,
            entityType: hint.entityType ?? ctx.getClass().name.replace(/(Admin)?Controller$/, ''),
            entityId: hint.entityId ?? params.id ?? params.key ?? resultId,
            before: hint.before ?? null,
            after: result ?? req.body ?? null,
            ip: req.ip ?? null,
            userAgent: req.header('user-agent') ?? null,
          })
          .catch((e: unknown) => this.logger.error(`audit write failed: ${(e as Error).message}`));
      }),
    );
  }
}
