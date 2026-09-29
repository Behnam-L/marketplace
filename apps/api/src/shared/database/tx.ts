import { DataSource, EntityManager, QueryFailedError } from 'typeorm';

/** Runs `fn` in a READ COMMITTED transaction (row locks + CAS provide isolation). */
export function inTransaction<T>(ds: DataSource, fn: (m: EntityManager) => Promise<T>): Promise<T> {
  return ds.transaction('READ COMMITTED', fn);
}

export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  if (!(e instanceof QueryFailedError)) return false;
  const err = e as QueryFailedError & { code?: string; constraint?: string };
  return err.code === '23505' && (!constraint || err.constraint === constraint);
}

/** Database server time — all deadlines are compared against DB time (PRD conventions). */
export async function dbNow(m: EntityManager | DataSource): Promise<Date> {
  const rows: { now: Date }[] = await m.query('SELECT now() AS now');
  return new Date(rows[0].now);
}
