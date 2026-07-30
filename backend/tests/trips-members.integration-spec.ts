import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const supertest = require('supertest') as (app: unknown) => import('supertest').SuperTest<import('supertest').Test>;
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * E2E integration tests for Phase 3: Auth, Trips, Members, Role enforcement.
 * Runs against the real tally_test PostgreSQL database.
 */
describe('Phase 3 — Auth, Trips & Members E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testDbUrl =
    process.env.DATABASE_URL ||
    process.env.TEST_DATABASE_URL ||
    'postgresql://hirushikanth@127.0.0.1:5432/tally_test';

  beforeAll(async () => {
    process.env.DATABASE_URL = testDbUrl;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "Posting", "Attachment", "BusinessEvent", "BalanceSnapshot", "Member", "Trip", "User" CASCADE;`,
    );
  });

  // ─── Auth ──────────────────────────────────────────────────────────────────

  describe('POST /auth/register', () => {
    it('registers a new user and returns a JWT', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Alice', email: 'alice@example.com', password: 'password123' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe('alice@example.com');
    });

    it('returns 409 if email is already taken', async () => {
      await supertest(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Alice', email: 'alice@example.com', password: 'password123' });

      await supertest(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Alice2', email: 'alice@example.com', password: 'password123' })
        .expect(409);
    });

    it('returns 400 for invalid email format', async () => {
      await supertest(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Alice', email: 'not-an-email', password: 'password123' })
        .expect(400);
    });

    it('returns 400 for a short password', async () => {
      await supertest(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Alice', email: 'alice@example.com', password: 'short' })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await supertest(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Alice', email: 'alice@example.com', password: 'password123' });
    });

    it('returns a JWT for valid credentials', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'alice@example.com', password: 'password123' })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
    });

    it('returns 401 for wrong password', async () => {
      await supertest(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'alice@example.com', password: 'wrongpassword' })
        .expect(401);
    });

    it('returns 401 for unknown email', async () => {
      await supertest(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ghost@example.com', password: 'password123' })
        .expect(401);
    });
  });

  // ─── Trips ─────────────────────────────────────────────────────────────────

  describe('Trips API', () => {
    let aliceToken: string;
    let bobToken: string;

    beforeEach(async () => {
      const aliceRes = await supertest(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Alice', email: 'alice@example.com', password: 'password123' });
      aliceToken = aliceRes.body.accessToken as string;

      const bobRes = await supertest(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Bob', email: 'bob@example.com', password: 'password123' });
      bobToken = bobRes.body.accessToken as string;
    });

    it('POST /trips — creates a trip and assigns creator as OWNER', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ name: 'Thailand Trip', currency: 'THB' })
        .expect(201);

      expect(res.body.name).toBe('Thailand Trip');
      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0].role).toBe('OWNER');
    });

    it('GET /trips — returns only trips where user is a member', async () => {
      await supertest(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ name: 'Alice Trip' });

      const res = await supertest(app.getHttpServer())
        .get('/trips')
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Alice Trip');

      // Bob has no trips
      const bobRes = await supertest(app.getHttpServer())
        .get('/trips')
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);
      expect(bobRes.body).toHaveLength(0);
    });

    it('GET /trips/:id — returns trip for a member', async () => {
      const createRes = await supertest(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ name: 'Alice Trip' });
      const tripId = createRes.body.id as string;

      const res = await supertest(app.getHttpServer())
        .get(`/trips/${tripId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      expect(res.body.id).toBe(tripId);
    });

    it('GET /trips/:id — returns 404 for non-member', async () => {
      const createRes = await supertest(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ name: 'Alice Trip' });
      const tripId = createRes.body.id as string;

      await supertest(app.getHttpServer())
        .get(`/trips/${tripId}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(404);
    });

    it('POST /trips/:id/archive — OWNER can archive trip', async () => {
      const createRes = await supertest(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ name: 'Alice Trip' });
      const tripId = createRes.body.id as string;

      const res = await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/archive`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      expect(res.body.status).toBe('ARCHIVED');
    });

    it('POST /trips/:id/archive — returns 401 without a token', async () => {
      const createRes = await supertest(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ name: 'Alice Trip' });
      const tripId = createRes.body.id as string;

      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/archive`)
        .expect(401);
    });
  });

  // ─── Members ───────────────────────────────────────────────────────────────

  describe('Members API', () => {
    let aliceToken: string;
    let bobToken: string;
    let viewerToken: string;
    let tripId: string;

    beforeEach(async () => {
      const aliceRes = await supertest(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Alice', email: 'alice@example.com', password: 'password123' });
      aliceToken = aliceRes.body.accessToken as string;

      const bobRes = await supertest(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Bob', email: 'bob@example.com', password: 'password123' });
      bobToken = bobRes.body.accessToken as string;

      await supertest(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Viewer', email: 'viewer@example.com', password: 'password123' });
      // viewer's token — we'll get it via login
      const viewerRes = await supertest(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'viewer@example.com', password: 'password123' });
      viewerToken = viewerRes.body.accessToken as string;

      const createRes = await supertest(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ name: 'Group Trip' });
      tripId = createRes.body.id as string;
    });

    it('GET /trips/:tripId/members — OWNER can list members', async () => {
      const res = await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/members`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].role).toBe('OWNER');
    });

    it('POST /trips/:tripId/members — OWNER can add a MEMBER', async () => {
      const res = await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/members`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ email: 'bob@example.com', role: 'MEMBER' })
        .expect(201);

      expect(res.body.role).toBe('MEMBER');
      expect(res.body.user.email).toBe('bob@example.com');
    });

    it('POST /trips/:tripId/members — OWNER can add a VIEWER', async () => {
      const res = await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/members`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ email: 'viewer@example.com', role: 'VIEWER' })
        .expect(201);

      expect(res.body.role).toBe('VIEWER');
    });

    it('GET /trips/:tripId/members — VIEWER can read members (role = VIEWER allowed)', async () => {
      // Add viewer to trip
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/members`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ email: 'viewer@example.com', role: 'VIEWER' });

      const res = await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/members`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /trips/:tripId/members — VIEWER cannot add members (403 Forbidden)', async () => {
      // Add viewer to trip
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/members`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ email: 'viewer@example.com', role: 'VIEWER' });

      // Viewer tries to add Bob — should be 403
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/members`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ email: 'bob@example.com', role: 'MEMBER' })
        .expect(403);
    });

    it('POST /trips/:tripId/members — non-member cannot add members (403 Forbidden)', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/members`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ email: 'viewer@example.com', role: 'MEMBER' })
        .expect(403);
    });

    it('POST /trips/:tripId/members/leave — MEMBER can leave trip', async () => {
      // Add Bob as MEMBER
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/members`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ email: 'bob@example.com', role: 'MEMBER' });

      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/members/leave`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);

      // Bob is no longer in the list
      const members = await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/members`)
        .set('Authorization', `Bearer ${aliceToken}`);
      const bobMember = (members.body as { user: { email: string } }[]).find(
        (m) => m.user.email === 'bob@example.com',
      );
      expect(bobMember).toBeUndefined();
    });

    it('POST /trips/:tripId/members/leave — OWNER cannot leave trip (400 Bad Request)', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/members/leave`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(400);
    });
  });
});
