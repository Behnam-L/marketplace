import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, ROW_COUNT_CAP, type Page } from '@bajet/contracts';
import { AppError } from '../errors/app-error';

interface Cursor {
  c: string;
  i: string;
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ c: createdAt.toISOString(), i: id })).toString('base64url');
}

function decodeCursor(cursor: string): Cursor {
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Cursor;
    if (typeof v.c !== 'string' || typeof v.i !== 'string') throw new Error('bad');
    return v;
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid cursor.', { fields: [{ field: 'cursor', message: 'Invalid cursor.' }] });
  }
}

export function clampLimit(limit?: number | string): number {
  const n = Number(limit ?? DEFAULT_PAGE_LIMIT);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_PAGE_LIMIT;
  return Math.min(n, MAX_PAGE_LIMIT);
}

/**
 * Keyset pagination ordered by (createdAt DESC, id DESC) with a capped row count.
 */
export async function paginate<E extends ObjectLiteral & { id: string; createdAt: Date }, R = E>(
  qb: SelectQueryBuilder<E>,
  alias: string,
  query: { cursor?: string; limit?: number | string },
  map?: (rows: E[]) => Promise<R[]> | R[],
): Promise<Page<R>> {
  const limit = clampLimit(query.limit);
  const countQb = qb.clone().orderBy().select(`${alias}.id`).limit(ROW_COUNT_CAP + 1);
  const [countSql, countParams] = countQb.getQueryAndParameters();
  const countRows: { n: string }[] = await qb.connection.query(`SELECT count(*) AS n FROM (${countSql}) t`, countParams);
  const total = Number(countRows[0]?.n ?? 0);

  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    qb.andWhere(`(${alias}.createdAt, ${alias}.id) < (:cursorC, :cursorI)`, { cursorC: c.c, cursorI: c.i });
  }
  qb.orderBy(`${alias}.createdAt`, 'DESC').addOrderBy(`${alias}.id`, 'DESC').take(limit + 1);
  const rows = await qb.getMany();
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const last = pageRows[pageRows.length - 1];
  const items = map ? await map(pageRows) : (pageRows as unknown as R[]);
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    total: Math.min(total, ROW_COUNT_CAP),
    capped: total > ROW_COUNT_CAP,
  };
}
