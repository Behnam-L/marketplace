import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp } from '../../test-utils/test-app';
import { as, createAdmin, idemKey, type TestAdmin } from '../../test-utils/admin-session';
import { createProviderPlan, providerBody } from '../../test-utils/fixtures';
import { FilesService } from './files.service';

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

describe('Files (FR-090 staging, §9.3)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let admin: TestAdmin;

  beforeAll(async () => {
    ({ app, ds } = await createTestApp());
    admin = await createAdmin(app, ds);
  });
  afterAll(() => app.close());

  it('rejects SVG / wrong type / infected files; accepts PNG icons', async () => {
    const svg = await as(app, admin).post('/v1/admin/files').field('kind', 'Icon').attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'i.svg').expect(400);
    expect(svg.body.error.code).toBe('VALIDATION_ERROR');
    await as(app, admin).post('/v1/admin/files').field('kind', 'Contract').attach('file', PNG, 'c.png').expect(400);
    const eicar = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')]);
    const infected = await as(app, admin).post('/v1/admin/files').field('kind', 'Contract').attach('file', eicar, 'c.pdf').expect(422);
    expect(infected.body.error.code).toBe('FILE_REJECTED');
    const ok = await as(app, admin).post('/v1/admin/files').field('kind', 'Icon').attach('file', PNG, 'i.png').expect(201);
    expect(ok.body.fileId).toMatch(/^fil_/);
  });

  it('commits with the record; public icon is served inert; uncommitted files are purged (E-18)', async () => {
    const up = await as(app, admin).post('/v1/admin/files').field('kind', 'Icon').attach('file', PNG, 'i.png').expect(201);
    await request(app.getHttpServer()).get(`/v1/public/icons/${up.body.fileId}`).expect(404); // staged
    const plan = await createProviderPlan(app, admin);
    await as(app, admin).post('/v1/admin/providers').set('Idempotency-Key', idemKey()).send(providerBody(plan, { iconFileId: up.body.fileId })).expect(201);
    const icon = await request(app.getHttpServer()).get(`/v1/public/icons/${up.body.fileId}`).expect(200);
    expect(icon.headers['content-type']).toBe('image/png');
    expect(icon.headers['x-content-type-options']).toBe('nosniff');
    const reuse = await as(app, admin).post('/v1/admin/providers').set('Idempotency-Key', idemKey()).send(providerBody(plan, { iconFileId: up.body.fileId })).expect(422);
    expect(reuse.body.error.code).toBe('FILE_NOT_STAGED');
    const stale = await as(app, admin).post('/v1/admin/files').field('kind', 'Icon').attach('file', PNG, 'i.png').expect(201);
    await ds.query(`UPDATE file_object SET created_at = now() - interval '25 hours' WHERE id = $1`, [stale.body.fileId]);
    expect(await app.get(FilesService).purgeStaged()).toBe(1);
    const viewer = await createAdmin(app, ds, 'Viewer');
    await as(app, viewer).post('/v1/admin/files').field('kind', 'Icon').attach('file', PNG, 'i.png').expect(403);
  });
});
