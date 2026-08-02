import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const supertest = require('supertest') as (app: unknown) => import('supertest').SuperTest<import('supertest').Test>;
import { AppModule } from '../src/app.module';

/**
 * Phase H3 — health endpoints: liveness and DB-backed readiness.
 * Runs against the real tally_test PostgreSQL database.
 */
describe('Health endpoints (Phase H3)', () => {
  let app: INestApplication;

  const getTestDbUrl = () =>
    process.env.DATABASE_URL ||
    process.env.TEST_DATABASE_URL ||
    'postgresql://hirushikanth@127.0.0.1:5432/tally_test';

  beforeAll(async () => {
    process.env.DATABASE_URL = getTestDbUrl();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health — liveness returns ok without auth', async () => {
    const res = await supertest(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health/ready — readiness reports the database up', async () => {
    const res = await supertest(app.getHttpServer())
      .get('/health/ready')
      .expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.details.database.status).toBe('up');
  });
});
