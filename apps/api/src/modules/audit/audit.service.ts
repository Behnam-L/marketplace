import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { AuditLogDto, Page } from '@bajet/contracts';
import { paginate } from '../../shared/database/pagination';
import { newId } from '../../shared/util/ids';
import { maskPii } from '../../shared/util/mask';
import { AuditLog } from './audit-log.entity';

export interface AuditEntry {
  actorId: string | null;
  actorName?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditQuery {
  cursor?: string;
  limit?: number;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  from?: string;
  to?: string;
}

/** FR-083 audit log. PII in before/after is masked before storage. */
@Injectable()
export class AuditService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async record(entry: AuditEntry, m: EntityManager = this.ds.manager): Promise<void> {
    await m.insert(AuditLog, {
      id: newId('aud'),
      actorId: entry.actorId,
      actorName: entry.actorName ?? null,
      action: entry.action.slice(0, 120),
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      before: (maskPii(entry.before) ?? null) as object,
      after: (maskPii(entry.after) ?? null) as object,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent?.slice(0, 500) ?? null,
    });
  }

  list(q: AuditQuery): Promise<Page<AuditLogDto>> {
    const qb = this.ds.manager.createQueryBuilder(AuditLog, 'a');
    if (q.actorId) qb.andWhere('a.actorId = :actorId', { actorId: q.actorId });
    if (q.entityType) qb.andWhere('a.entityType = :entityType', { entityType: q.entityType });
    if (q.entityId) qb.andWhere('a.entityId = :entityId', { entityId: q.entityId });
    if (q.action) qb.andWhere('a.action ILIKE :action', { action: `%${q.action}%` });
    if (q.from) qb.andWhere('a.createdAt >= :from', { from: q.from });
    if (q.to) qb.andWhere('a.createdAt < :to', { to: q.to });
    return paginate(qb, 'a', q, (rows) =>
      rows.map((r) => ({
        id: r.id,
        actorId: r.actorId,
        actorName: r.actorName,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        before: r.before,
        after: r.after,
        ip: r.ip,
        userAgent: r.userAgent,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  }
}
