import { Column, ColumnOptions, CreateDateColumn, PrimaryColumn, UpdateDateColumn, ValueTransformer } from 'typeorm';

/** Postgres `bigint` ↔ JS safe integer (money is integer Toman). */
export const bigintTransformer: ValueTransformer = {
  to: (v: number | null | undefined) => v,
  from: (v: string | null) => {
    if (v === null || v === undefined) return v;
    const n = Number(v);
    if (!Number.isSafeInteger(n)) throw new Error(`bigint ${v} exceeds safe integer range`);
    return n;
  },
};

export const MoneyColumn = (opts: ColumnOptions = {}): PropertyDecorator =>
  Column({ type: 'bigint', transformer: bigintTransformer, ...opts });

export const IdColumn = (): PropertyDecorator => PrimaryColumn({ type: 'varchar', length: 40 });
export const RefColumn = (opts: ColumnOptions = {}): PropertyDecorator =>
  Column({ type: 'varchar', length: 40, ...opts });
export const CreatedAt = (): PropertyDecorator => CreateDateColumn({ type: 'timestamptz' });
export const UpdatedAt = (): PropertyDecorator => UpdateDateColumn({ type: 'timestamptz' });
export const VersionCol = (): PropertyDecorator => Column({ type: 'integer', default: 1 });
export const Timestamp = (opts: ColumnOptions = {}): PropertyDecorator => Column({ type: 'timestamptz', ...opts });
export const EnumCol = (values: readonly string[], opts: ColumnOptions = {}): PropertyDecorator =>
  Column({ type: 'varchar', length: 40, enum: values as string[], ...opts });
