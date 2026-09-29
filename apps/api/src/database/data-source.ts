import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../config/env';
import { typeormOptions } from './typeorm.options';

/** DataSource for the TypeORM CLI (migration:generate) and the migrate/seed scripts. */
export default new DataSource(typeormOptions(loadConfig().databaseUrl));
