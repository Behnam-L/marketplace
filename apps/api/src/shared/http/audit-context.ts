import type { Request } from 'express';

/** Lets a controller attach the entity state before a mutation for the audit log. */
export interface AuditHint {
  before?: unknown;
  entityType?: string;
  entityId?: string;
  action?: string;
  skip?: boolean;
}
const KEY = Symbol('auditHint');

export function setAuditBefore(req: Request, before: unknown, entityType?: string, entityId?: string): void {
  const hint = auditHintOf(req);
  (req as unknown as Record<symbol, AuditHint>)[KEY] = { ...hint, before, entityType, entityId };
}

export function setAuditHint(req: Request, hint: AuditHint): void {
  (req as unknown as Record<symbol, AuditHint>)[KEY] = { ...auditHintOf(req), ...hint };
}

export function auditHintOf(req: Request): AuditHint {
  return (req as unknown as Record<symbol, AuditHint | undefined>)[KEY] ?? {};
}
