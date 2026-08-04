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

const SECURITY_QUESTIONS = [
  { question: 'What was the name of your first pet?', answer: 'Fluffy' },
  { question: 'In which city were you born?', answer: 'Kandy' },
];

function registerUser(
  server: import('supertest').SuperTest<import('supertest').Test>,
  name: string,
  email: string,
  password = 'password123',
) {
  return server
    .post('/auth/register')
    .send({ name, email, password, securityQuestions: SECURITY_QUESTIONS });
}

function loginUser(
  server: import('supertest').SuperTest<import('supertest').Test>,
  email: string,
  password = 'password123',
) {
  return server.post('/auth/login').send({ email, password });
}

describe('Phase 3 — Auth, Trips & Members E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: import('supertest').SuperTest<import('supertest').Test>;

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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    server = supertest(app.getHttpServer());

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "Posting", "Attachment", "BusinessEvent", "BalanceSnapshot", "Member", "Trip", "User", "RefreshToken", "SecurityQuestion", "PasswordResetToken" CASCADE;`,
    );
  });

  // ─── Auth ──────────────────────────────────────────────────────────────────

  describe('POST /auth/register', () => {
    it('creates an account WITHOUT a session — user signs in afterwards', async () => {
      const res = await registerUser(
        server,
        'Alice',
        'alice@example.com',
      ).expect(201);

      expect(res.body.user.email).toBe('alice@example.com');
      expect(res.body.accessToken).toBeUndefined();
      expect(res.body.refreshToken).toBeUndefined();

      const login = await loginUser(server, 'alice@example.com').expect(200);
      expect(login.body.accessToken).toBeDefined();
    });

    it('returns 409 if email is already taken', async () => {
      await registerUser(server, 'Alice', 'alice@example.com');

      await registerUser(server, 'Alice2', 'alice@example.com').expect(409);
    });

    it('returns 409 (not 500) when two concurrent registrations race on the same email', async () => {
      const attempt = () =>
        registerUser(server, 'Racer', 'racer@example.com');

      const [a, b] = await Promise.all([attempt(), attempt()]);
      const statuses = [a.status, b.status].sort();
      // P2002 unique violation surfaces as 409 via the global filter,
      // never a masked 500.
      expect(statuses).toEqual([201, 409]);
    });

    it('returns 400 for invalid email format', async () => {
      await registerUser(server, 'Alice', 'not-an-email').expect(400);
    });

    it('returns 400 for a short password', async () => {
      await registerUser(server, 'Alice', 'alice@example.com', 'short').expect(
        400,
      );
    });

    it('returns 400 for a password without a letter or number', async () => {
      await registerUser(
        server,
        'Alice',
        'alice@example.com',
        'lettersonly',
      ).expect(400);
      await registerUser(server, 'Alice', 'alice@example.com', '12345678').expect(
        400,
      );
    });

    it('returns 400 when security questions are missing or invalid', async () => {
      await supertest(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'NoQuestions',
          email: 'noquestions@example.com',
          password: 'password123',
        })
        .expect(400);

      await supertest(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'BadQuestions',
          email: 'badquestions@example.com',
          password: 'password123',
          securityQuestions: [
            { question: 'Only one question?', answer: 'Yes' },
          ],
        })
        .expect(400);

      await supertest(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'ShortAnswer',
          email: 'shortanswer@example.com',
          password: 'password123',
          securityQuestions: [
            { question: 'Q1', answer: 'x' },
            { question: 'Q2', answer: 'y' },
          ],
        })
        .expect(400);
    });

    it('normalizes email to trimmed lowercase before storing', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Alice',
          email: '  Alice@Example.COM ',
          password: 'password123',
          securityQuestions: SECURITY_QUESTIONS,
        })
        .expect(201);

      expect(res.body.user.email).toBe('alice@example.com');

      // Login with the normalized email also succeeds
      const login = await loginUser(server, 'ALICE@example.com').expect(200);
      expect(login.body.user.email).toBe('alice@example.com');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await registerUser(server, 'Alice', 'alice@example.com');
    });

    it('returns a JWT for valid credentials', async () => {
      const res = await loginUser(server, 'alice@example.com').expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.email).toBe('alice@example.com');
    });

    it('returns 401 for wrong password', async () => {
      await loginUser(server, 'alice@example.com', 'wrongpassword').expect(401);
    });

    it('returns 401 for unknown email', async () => {
      await loginUser(server, 'ghost@example.com').expect(401);
    });
  });

  // ─── Forgot password (security questions) ──────────────────────────────────

  describe('POST /auth/forgot-password', () => {
    it('returns the security questions for an existing account', async () => {
      await registerUser(server, 'Alice', 'alice@example.com');

      const res = await supertest(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'alice@example.com' })
        .expect(200);

      expect(res.body.found).toBe(true);
      expect(res.body.questions).toHaveLength(2);
      expect(res.body.questions[0].question).toBe(
        'What was the name of your first pet?',
      );
      expect(res.body.questions[0].id).toBeDefined();
      // Never leak answer hashes
      expect(res.body.questions[0].answerHash).toBeUndefined();
    });

    it('returns found:false for an unknown email', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'ghost@example.com' })
        .expect(200);

      expect(res.body.found).toBe(false);
      expect(res.body.questions).toEqual([]);
    });
  });

  describe('POST /auth/verify-answers', () => {
    async function lookupQuestions(email: string) {
      const res = await supertest(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email })
        .expect(200);
      return res.body.questions as { id: string; question: string }[];
    }

    it('returns a one-time reset token for correct answers', async () => {
      await registerUser(server, 'Alice', 'alice@example.com');
      const questions = await lookupQuestions('alice@example.com');

      const res = await supertest(app.getHttpServer())
        .post('/auth/verify-answers')
        .send({
          email: 'alice@example.com',
          answers: questions.map((q) => ({
            questionId: q.id,
            answer: SECURITY_QUESTIONS.find((sq) => sq.question === q.question)
              ?.answer,
          })),
        })
        .expect(200);

      expect(res.body.resetToken).toBeDefined();
    });

    it('returns 401 for incorrect answers', async () => {
      await registerUser(server, 'Alice', 'alice@example.com');
      const questions = await lookupQuestions('alice@example.com');

      await supertest(app.getHttpServer())
        .post('/auth/verify-answers')
        .send({
          email: 'alice@example.com',
          answers: questions.map((q) => ({
            questionId: q.id,
            answer: 'totally-wrong',
          })),
        })
        .expect(401);
    });

    it('returns 401 for answers on a different account', async () => {
      await registerUser(server, 'Alice', 'alice@example.com');
      const questions = await lookupQuestions('alice@example.com');

      // Replay Alice's question ids from Bob's account
      await registerUser(server, 'Bob', 'bob@example.com');
      await supertest(app.getHttpServer())
        .post('/auth/verify-answers')
        .send({
          email: 'bob@example.com',
          answers: questions.map((q) => ({
            questionId: q.id,
            answer: 'Fluffy',
          })),
        })
        .expect(401);
    });
  });

  describe('POST /auth/reset-password', () => {
    async function getResetToken(email: string) {
      const lookup = await supertest(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email })
        .expect(200);
      const res = await supertest(app.getHttpServer())
        .post('/auth/verify-answers')
        .send({
          email,
          answers: (lookup.body.questions as {
            id: string;
            question: string;
          }[]).map((q) => ({
            questionId: q.id,
            answer:
              SECURITY_QUESTIONS.find((sq) => sq.question === q.question)
                ?.answer ?? '',
          })),
        })
        .expect(200);
      return res.body.resetToken as string;
    }

    it('resets the password and revokes existing sessions', async () => {
      await registerUser(server, 'Alice', 'alice@example.com');
      const login = await loginUser(server, 'alice@example.com').expect(200);
      const oldRefreshToken = login.body.refreshToken as string;

      const token = await getResetToken('alice@example.com');
      const res = await supertest(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, password: 'newpassword456' })
        .expect(200);
      expect(res.body.success).toBe(true);

      // Old password no longer works, new one does
      await loginUser(server, 'alice@example.com', 'password123').expect(401);
      await loginUser(server, 'alice@example.com', 'newpassword456').expect(200);

      // Old session was revoked
      await supertest(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(401);
    });

    it('rejects a used reset token', async () => {
      await registerUser(server, 'Alice', 'alice@example.com');
      const token = await getResetToken('alice@example.com');

      await supertest(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, password: 'newpassword456' })
        .expect(200);
      await supertest(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, password: 'anotherpass123' })
        .expect(401);
    });

    it('rejects a bogus reset token', async () => {
      await supertest(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: 'bogus-token', password: 'newpassword456' })
        .expect(401);
    });
  });

  // ─── Refresh tokens ───────────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    it('rotates the refresh token and issues a fresh access token', async () => {
      await registerUser(server, 'Dana', 'dana@example.com');
      const login = await loginUser(server, 'dana@example.com').expect(200);
      const firstRefresh = login.body.refreshToken as string;

      const res = await supertest(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: firstRefresh })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.refreshToken).not.toBe(firstRefresh);
      expect(res.body.user.email).toBe('dana@example.com');
    });

    it('rejects a rotated (reused) refresh token', async () => {
      await registerUser(server, 'Eve', 'eve@example.com');
      const login = await loginUser(server, 'eve@example.com').expect(200);
      const firstRefresh = login.body.refreshToken as string;

      await supertest(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: firstRefresh })
        .expect(200);

      // Replay of the presented token after rotation must fail
      await supertest(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: firstRefresh })
        .expect(401);
    });

    it('returns 401 for an unknown token', async () => {
      await supertest(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'totally-bogus-token' })
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the refresh token so it can no longer be used', async () => {
      await registerUser(server, 'Frank', 'frank@example.com');
      const login = await loginUser(server, 'frank@example.com').expect(200);
      const refreshToken = login.body.refreshToken as string;

      await supertest(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken })
        .expect(200);

      await supertest(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('is idempotent — logging out twice still succeeds', async () => {
      await registerUser(server, 'Grace', 'grace@example.com');
      const login = await loginUser(server, 'grace@example.com').expect(200);
      const refreshToken = login.body.refreshToken as string;

      await supertest(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken })
        .expect(200);
      await supertest(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken })
        .expect(200);
    });
  });

  // ─── Trips ─────────────────────────────────────────────────────────────────

  describe('Trips API', () => {
    let aliceToken: string;
    let bobToken: string;

    beforeEach(async () => {
      await registerUser(server, 'Alice', 'alice@example.com');
      await registerUser(server, 'Bob', 'bob@example.com');
      const aliceLogin = await loginUser(server, 'alice@example.com').expect(200);
      const bobLogin = await loginUser(server, 'bob@example.com').expect(200);
      aliceToken = aliceLogin.body.accessToken as string;
      bobToken = bobLogin.body.accessToken as string;
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
      await registerUser(server, 'Alice', 'alice@example.com');
      await registerUser(server, 'Bob', 'bob@example.com');
      await registerUser(server, 'Viewer', 'viewer@example.com');

      const aliceLogin = await loginUser(server, 'alice@example.com').expect(200);
      const bobLogin = await loginUser(server, 'bob@example.com').expect(200);
      const viewerLogin = await loginUser(server, 'viewer@example.com').expect(200);
      aliceToken = aliceLogin.body.accessToken as string;
      bobToken = bobLogin.body.accessToken as string;
      viewerToken = viewerLogin.body.accessToken as string;

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
