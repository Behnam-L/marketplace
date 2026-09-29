import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from '../../test-utils/test-app';
import { as, createAdmin, type TestAdmin } from '../../test-utils/admin-session';
import { NotificationsService } from './notifications.service';
import { SMS_PROVIDERS, type MockSmsProvider } from './sms/sms-provider';

describe('Messaging (FR-012 failover, FR-150/151)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let admin: TestAdmin;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
    admin = await createAdmin(app, ds);
  });
  afterAll(() => app.close());

  it('templates must contain the event’s required params; one active per event', async () => {
    const bad = await as(app, admin).post('/v1/admin/message-templates').send({ event: 'otp.sent', channel: 'SMS', name: 'OTP', content: 'Your code', status: 'Active' }).expect(400);
    expect(bad.body.error.message).toContain('{{code}}');
    await as(app, admin).post('/v1/admin/message-templates').send({ event: 'otp.sent', channel: 'SMS', name: 'OTP', content: 'کد: {{code}}', status: 'Active' }).expect(201);
    const dup = await as(app, admin).post('/v1/admin/message-templates').send({ event: 'otp.sent', channel: 'SMS', name: 'OTP 2', content: '{{code}}', status: 'Active' }).expect(409);
    expect(dup.body.error.code).toBe('DUPLICATE_ENTITY');
    await as(app, admin).post('/v1/admin/message-templates').send({ event: 'otp.sent', channel: 'SMS', name: 'OTP draft', content: '{{code}}!', status: 'Inactive' }).expect(201);
  });

  it('fails over to the secondary provider and logs every send; both down → SMS_UNAVAILABLE', async () => {
    const providers = app.get<MockSmsProvider[]>(SMS_PROVIDERS);
    const n = app.get(NotificationsService);
    providers[0].failing = true;
    const r = await n.sendSms('otp.sent', '+989121112222', { code: '12345' });
    expect(r.provider).toBe('mock-sms-secondary');
    providers[1].failing = true;
    await expect(n.sendSms('otp.sent', '+989121112222', { code: '12345' })).rejects.toMatchObject({ code: 'SMS_UNAVAILABLE' });
    expect(n.isReachable()).toBe(false);
    providers[0].failing = false;
    providers[1].failing = false;
    const logs = await as(app, admin).get('/v1/admin/message-logs?recipient=09121112222').expect(200);
    expect(logs.body.items.map((l: { status: string }) => l.status).sort()).toEqual(['Delivered', 'Failed']);
    const rows: { error: string }[] = await ds.query(`SELECT error FROM message_log WHERE status = 'Failed'`);
    expect(rows[0].error).toContain('mock-sms-primary');
    expect(JSON.stringify(logs.body)).not.toContain('12345');
  });
});
