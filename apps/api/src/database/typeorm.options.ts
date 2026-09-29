import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { types } from 'pg';
import { SnakeNamingStrategy } from '../shared/database/naming.strategy';

// Calendar dates stay 'YYYY-MM-DD' strings (no implicit local-time Date conversion).
types.setTypeParser(1082, (v: string) => v);

/** Shared by the Nest module, the migration CLI and tests. */
export function typeormOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    namingStrategy: new SnakeNamingStrategy(),
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'schema_migrations',
    synchronize: false,
    logging: process.env.NODE_ENV === 'test' ? false : ['error'],
    extra: { max: 20, options: '-c timezone=UTC' },
  };
}
