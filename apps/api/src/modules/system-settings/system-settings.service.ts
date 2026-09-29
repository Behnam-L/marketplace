import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  SETTINGS,
  SETTING_KEYS,
  defaultSettings,
  validateSettingValue,
  type SettingChangeDto,
  type SettingDto,
  type SettingKey,
  type SettingsValues,
} from '@bajet/contracts';
import { AppError, validationError } from '../../shared/errors/app-error';
import { newId } from '../../shared/util/ids';
import { SystemSetting, SystemSettingChange } from './system-setting.entity';

/**
 * Typed, range-validated settings (BR-LIM). Values are read from the database on
 * every call so a saved change is effective for the next dependent step (FR-101).
 */
@Injectable()
export class SystemSettingsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  isKey(key: string): key is SettingKey {
    return (SETTING_KEYS as string[]).includes(key);
  }

  async getAll(m: EntityManager = this.ds.manager): Promise<SettingsValues> {
    const rows = await m.find(SystemSetting);
    const values = defaultSettings() as Record<string, number | boolean>;
    for (const r of rows) if (this.isKey(r.key)) values[r.key] = r.valueJson;
    return values as SettingsValues;
  }

  async get<K extends SettingKey>(key: K, m: EntityManager = this.ds.manager): Promise<SettingsValues[K]> {
    const row = await m.findOne(SystemSetting, { where: { key } });
    return (row ? row.valueJson : SETTINGS[key].default) as SettingsValues[K];
  }

  async list(): Promise<SettingDto[]> {
    const rows = await this.ds.manager.find(SystemSetting);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const values = await this.getAll();
    return SETTING_KEYS.map((key) => {
      const def = SETTINGS[key];
      const row = byKey.get(key);
      return {
        key,
        value: values[key],
        default: def.default,
        type: def.type,
        min: def.type === 'int' ? def.min : null,
        max: def.type === 'int' && 'max' in def ? (def.max ?? null) : null,
        description: def.description,
        updatedAt: row?.updatedAt.toISOString() ?? null,
        updatedBy: row?.updatedBy ?? null,
      };
    });
  }

  async update(key: string, value: unknown, reason: string, adminId: string): Promise<{ before: SettingDto; after: SettingDto }> {
    if (!this.isKey(key)) throw new AppError('NOT_FOUND', 'Setting not found.');
    if (!reason || reason.trim().length < 3) throw validationError('reason', 'A reason is required.');
    const before = (await this.list()).find((s) => s.key === key)!;
    await this.ds.transaction(async (m) => {
      // Serialise concurrent edits of related settings (min/max) with a table lock.
      await m.query('LOCK TABLE system_setting IN SHARE ROW EXCLUSIVE MODE');
      const current = await this.getAll(m);
      const error = validateSettingValue(key, value, current);
      if (error) throw validationError('value', error);
      const oldValue = current[key];
      await m.query(
        `INSERT INTO system_setting (key, value_json, updated_by) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [key, JSON.stringify(value), adminId],
      );
      await m.insert(SystemSettingChange, {
        id: newId('stc'),
        key,
        oldValue,
        newValue: value as number | boolean,
        reason: reason.trim(),
        changedBy: adminId,
      });
    });
    const after = (await this.list()).find((s) => s.key === key)!;
    return { before, after };
  }

  async history(key: string): Promise<SettingChangeDto[]> {
    if (!this.isKey(key)) throw new AppError('NOT_FOUND', 'Setting not found.');
    const rows = await this.ds.manager.find(SystemSettingChange, { where: { key }, order: { createdAt: 'DESC' }, take: 200 });
    return rows.map((r) => ({
      id: r.id,
      key: r.key as SettingKey,
      oldValue: r.oldValue,
      newValue: r.newValue,
      reason: r.reason,
      changedBy: r.changedBy,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
