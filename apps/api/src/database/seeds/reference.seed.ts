import { DataSource } from 'typeorm';
import { newId } from '../../shared/util/ids';
import { MESSAGE_EVENTS, extractParams } from '../../modules/notifications/message-events';

/** Bank gateways (mock PSPs) and default SMS templates. Idempotent. */
export async function seedReference(ds: DataSource): Promise<void> {
  await ds.query(
    `INSERT INTO bank_gateway (id, code, name, priority, health_status, supports_reverse, supports_refund, credentials_ref)
     VALUES ($1, 'MOCK', 'درگاه نمایشی اصلی', 1, 'Healthy', true, true, 'vault://psp/mock'),
            ($2, 'MOCK_B', 'درگاه نمایشی پشتیبان', 2, 'Healthy', false, false, 'vault://psp/mock-b')
     ON CONFLICT (code) DO NOTHING`,
    [newId('gtw'), newId('gtw')],
  );
  for (const e of MESSAGE_EVENTS) {
    const exists: unknown[] = await ds.query(`SELECT 1 FROM message_template WHERE event = $1`, [e.event]);
    if (exists.length) continue;
    await ds.query(
      `INSERT INTO message_template (id, event, channel, name, content, params, status) VALUES ($1, $2, 'SMS', $3, $4, $5, 'Active')`,
      [newId('tpl'), e.event, e.description, e.fallback, extractParams(e.fallback)],
    );
  }
}
