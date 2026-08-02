import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const supertest = require('supertest') as (app: unknown) => import('supertest').SuperTest<import('supertest').Test>;
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * E2E tests for Phase 4: Business Event APIs (Shared Expense, Loan, Cash Movement, Refund, Adjustment)
 * Runs against the real tally_test PostgreSQL database.
 */
describe('Phase 4 — Business Event APIs E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const getTestDbUrl = () =>
    process.env.DATABASE_URL ||
    process.env.TEST_DATABASE_URL ||
    'postgresql://hirushikanth@127.0.0.1:5432/tally_test';

  let ownerToken: string;
  let memberToken: string;
  let viewerToken: string;

  let tripId: string;
  let hirushiMemberId: string;
  let kasunMemberId: string;
  let amalMemberId: string;
  let sahanMemberId: string;
  let nimalMemberId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = getTestDbUrl();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
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

    // Register Users
    const hirushiRes = await supertest(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Hirushi', email: 'hirushi@example.com', password: 'password123' })
      .expect(201);
    ownerToken = hirushiRes.body.accessToken as string;

    const kasunRes = await supertest(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Kasun', email: 'kasun@example.com', password: 'password123' })
      .expect(201);
    memberToken = kasunRes.body.accessToken as string;

    await supertest(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Amal', email: 'amal@example.com', password: 'password123' })
      .expect(201);

    await supertest(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Sahan', email: 'sahan@example.com', password: 'password123' })
      .expect(201);

    await supertest(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Nimal', email: 'nimal@example.com', password: 'password123' })
      .expect(201);

    const viewerRes = await supertest(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'ViewerUser', email: 'viewer@example.com', password: 'password123' })
      .expect(201);
    viewerToken = viewerRes.body.accessToken as string;

    // Create Trip (Hirushi is OWNER)
    const tripRes = await supertest(app.getHttpServer())
      .post('/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Sri Lanka Trip', currency: 'LKR' })
      .expect(201);
    tripId = tripRes.body.id as string;
    hirushiMemberId = tripRes.body.members[0].id as string;

    // Add Members
    const kasunM = await supertest(app.getHttpServer())
      .post(`/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'kasun@example.com', role: 'MEMBER' })
      .expect(201);
    kasunMemberId = kasunM.body.id as string;

    const amalM = await supertest(app.getHttpServer())
      .post(`/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'amal@example.com', role: 'MEMBER' })
      .expect(201);
    amalMemberId = amalM.body.id as string;

    const sahanM = await supertest(app.getHttpServer())
      .post(`/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'sahan@example.com', role: 'MEMBER' })
      .expect(201);
    sahanMemberId = sahanM.body.id as string;

    const nimalM = await supertest(app.getHttpServer())
      .post(`/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'nimal@example.com', role: 'MEMBER' });
    nimalMemberId = nimalM.body.id as string;

    // Add Viewer
    await supertest(app.getHttpServer())
      .post(`/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'viewer@example.com', role: 'VIEWER' });
  });

  // ─── 1. Shared Expense ──────────────────────────────────────────────────────

  describe('POST /trips/:tripId/events/shared-expense', () => {
    it('creates a SHARED_EXPENSE with multi-payer netting (PROJECT_CONTEXT §7.1)', async () => {
      // Hirushi pays $60 (6000), Kasun pays $40 (4000), split 5 ways ($20 each = 2000)
      const res = await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/shared-expense`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amount: 10000,
          payers: [
            { memberId: hirushiMemberId, amountPaid: 6000 },
            { memberId: kasunMemberId, amountPaid: 4000 },
          ],
          split: {
            method: 'EQUAL',
            participantIds: [
              hirushiMemberId,
              kasunMemberId,
              amalMemberId,
              sahanMemberId,
              nimalMemberId,
            ],
          },
          category: 'Hotel',
          notes: 'Beach resort stay',
        })
        .expect(201);

      expect(res.body.type).toBe('SHARED_EXPENSE');
      expect(res.body.postings).toHaveLength(5);

      const postingsMap = new Map<string, number>(
        res.body.postings.map((p: { memberId: string; amount: number }) => [
          p.memberId,
          p.amount,
        ]),
      );

      expect(postingsMap.get(hirushiMemberId)).toBe(4000);  // 6000 - 2000 = +4000
      expect(postingsMap.get(kasunMemberId)).toBe(2000);    // 4000 - 2000 = +2000
      expect(postingsMap.get(amalMemberId)).toBe(-2000);   // 0 - 2000 = -2000
      expect(postingsMap.get(sahanMemberId)).toBe(-2000);  // 0 - 2000 = -2000
      expect(postingsMap.get(nimalMemberId)).toBe(-2000);  // 0 - 2000 = -2000

      // Zero-sum invariant check
      const sum = Array.from(postingsMap.values()).reduce((a, b) => a + b, 0);
      expect(sum).toBe(0);
    });

    it('returns 422 if payer amounts do not equal total amount', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/shared-expense`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amount: 10000,
          payers: [
            { memberId: hirushiMemberId, amountPaid: 5000 }, // sum = 5000 != 10000
          ],
          split: {
            method: 'EQUAL',
            participantIds: [hirushiMemberId, kasunMemberId],
          },
        })
        .expect(422);
    });

    it('returns 400 if member ID does not belong to the trip', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/shared-expense`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amount: 5000,
          payers: [{ memberId: 'invalid-member-id', amountPaid: 5000 }],
          split: {
            method: 'EQUAL',
            participantIds: [hirushiMemberId],
          },
        })
        .expect(400);
    });

    it('returns 403 if VIEWER attempts to create an expense', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/shared-expense`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          amount: 5000,
          payers: [{ memberId: hirushiMemberId, amountPaid: 5000 }],
          split: {
            method: 'EQUAL',
            participantIds: [hirushiMemberId, kasunMemberId],
          },
        })
        .expect(403);
    });

    it('accepts a PERCENTAGE split whose shares sum to 100', async () => {
      const res = await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/shared-expense`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amount: 10000,
          payers: [{ memberId: hirushiMemberId, amountPaid: 10000 }],
          split: {
            method: 'PERCENTAGE',
            shares: [
              { memberId: hirushiMemberId, percent: 50 },
              { memberId: kasunMemberId, percent: 50 },
            ],
          },
        })
        .expect(201);

      expect(res.body.type).toBe('SHARED_EXPENSE');
    });

    it('returns 400 for an unknown split method', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/shared-expense`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amount: 5000,
          payers: [{ memberId: hirushiMemberId, amountPaid: 5000 }],
          split: {
            method: 'SPLIT_EVERYTHING',
            participantIds: [hirushiMemberId, kasunMemberId],
          },
        })
        .expect(400);
    });

    it('returns 400 for a split missing its method discriminator', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/shared-expense`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amount: 5000,
          payers: [{ memberId: hirushiMemberId, amountPaid: 5000 }],
          split: { participantIds: [hirushiMemberId] },
        })
        .expect(400);
    });

    it('returns 400 for percentage shares that do not sum to 100', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/shared-expense`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amount: 5000,
          payers: [{ memberId: hirushiMemberId, amountPaid: 5000 }],
          split: {
            method: 'PERCENTAGE',
            shares: [{ memberId: hirushiMemberId, percent: 90 }],
          },
        })
        .expect(400);
    });

    it('returns 400 when the split payload does not match its method', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/shared-expense`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amount: 5000,
          payers: [{ memberId: hirushiMemberId, amountPaid: 5000 }],
          split: {
            method: 'EQUAL',
            shares: [{ memberId: hirushiMemberId, percent: 100 }],
          },
        })
        .expect(400);
    });

    it('trims notes and category on create', async () => {
      const res = await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/shared-expense`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amount: 5000,
          payers: [{ memberId: hirushiMemberId, amountPaid: 5000 }],
          split: {
            method: 'EQUAL',
            participantIds: [hirushiMemberId],
          },
          category: '  Hotel  ',
          notes: '  Beach resort stay  ',
        })
        .expect(201);

      expect(res.body.category).toBe('Hotel');
      expect(res.body.notes).toBe('Beach resort stay');
    });
  });

  // ─── 2. Loan ────────────────────────────────────────────────────────────────

  describe('POST /trips/:tripId/events/loan', () => {
    it('creates a LOAN event (lender +amount, borrower -amount)', async () => {
      const res = await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/loan`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          lenderMemberId: kasunMemberId,
          borrowerMemberId: amalMemberId,
          amount: 5000,
          notes: 'Cash lent for entrance fee',
        })
        .expect(201);

      expect(res.body.type).toBe('LOAN');

      const postingsMap = new Map<string, number>(
        res.body.postings.map((p: { memberId: string; amount: number }) => [
          p.memberId,
          p.amount,
        ]),
      );

      expect(postingsMap.get(kasunMemberId)).toBe(5000);  // Lender: +5000
      expect(postingsMap.get(amalMemberId)).toBe(-5000);  // Borrower: -5000
    });
  });

  // ─── 3. Cash Movement (Repayment / Settlement) ──────────────────────────────

  describe('POST /trips/:tripId/events/cash-movement', () => {
    it('creates a SETTLEMENT event (payer +amount, receiver -amount)', async () => {
      const res = await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/cash-movement`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          cashPayerMemberId: amalMemberId,
          cashReceiverMemberId: hirushiMemberId,
          amount: 3000,
          type: 'SETTLEMENT',
          notes: 'Partial settlement via Bank transfer',
        })
        .expect(201);

      expect(res.body.type).toBe('SETTLEMENT');

      const postingsMap = new Map<string, number>(
        res.body.postings.map((p: { memberId: string; amount: number }) => [
          p.memberId,
          p.amount,
        ]),
      );

      expect(postingsMap.get(amalMemberId)).toBe(3000);     // Cash Payer: +3000
      expect(postingsMap.get(hirushiMemberId)).toBe(-3000);  // Cash Receiver: -3000
    });

    it('creates a REPAYMENT event using the exact same logic', async () => {
      const res = await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/cash-movement`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          cashPayerMemberId: kasunMemberId,
          cashReceiverMemberId: hirushiMemberId,
          amount: 1500,
          type: 'REPAYMENT',
        })
        .expect(201);

      expect(res.body.type).toBe('REPAYMENT');
    });

    it('rejects a non cash-movement type label (e.g. LOAN) with 400', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/cash-movement`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          cashPayerMemberId: amalMemberId,
          cashReceiverMemberId: hirushiMemberId,
          amount: 1000,
          type: 'LOAN',
        })
        .expect(400);

      const loans = await prisma.businessEvent.findMany({
        where: { type: 'LOAN' },
      });
      expect(loans).toHaveLength(0);
    });
  });

  // ─── 4. Refund ──────────────────────────────────────────────────────────────

  describe('POST /trips/:tripId/events/refund', () => {
    it('creates a proportional REFUND (PROJECT_CONTEXT §7.3 worked example)', async () => {
      // 1. Create original $100 expense
      const originalRes = await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/shared-expense`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amount: 10000,
          payers: [
            { memberId: hirushiMemberId, amountPaid: 6000 },
            { memberId: kasunMemberId, amountPaid: 4000 },
          ],
          split: {
            method: 'EQUAL',
            participantIds: [
              hirushiMemberId,
              kasunMemberId,
              amalMemberId,
              sahanMemberId,
              nimalMemberId,
            ],
          },
        });
      const originalEventId = originalRes.body.id as string;

      // 2. Partial refund of $40 (4000 minor units) -> ratio 0.4
      const res = await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/refund`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          refundOfId: originalEventId,
          refundAmount: 4000,
          notes: 'Partial refund from hotel for cancelled room',
        })
        .expect(201);

      expect(res.body.type).toBe('REFUND');
      expect(res.body.refundOfId).toBe(originalEventId);

      const postingsMap = new Map<string, number>(
        res.body.postings.map((p: { memberId: string; amount: number }) => [
          p.memberId,
          p.amount,
        ]),
      );

      // Original postings were: Hirushi +4000, Kasun +2000, Amal -2000, Sahan -2000, Nimal -2000
      // Scaled by 0.4 and sign-flipped:
      // Hirushi: -1600
      // Kasun: -800
      // Amal: +800
      // Sahan: +800
      // Nimal: +800
      expect(postingsMap.get(hirushiMemberId)).toBe(-1600);
      expect(postingsMap.get(kasunMemberId)).toBe(-800);
      expect(postingsMap.get(amalMemberId)).toBe(800);
      expect(postingsMap.get(sahanMemberId)).toBe(800);
      expect(postingsMap.get(nimalMemberId)).toBe(800);

      const sum = Array.from(postingsMap.values()).reduce((a, b) => a + b, 0);
      expect(sum).toBe(0);
    });

    it('returns 404 for a non-existent refundOfId', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/refund`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          refundOfId: 'non-existent-event-id',
          refundAmount: 1000,
        })
        .expect(404);
    });
  });

  // ─── 5. Adjustment ─────────────────────────────────────────────────────────

  describe('POST /trips/:tripId/events/adjustment', () => {
    it('allows ADMIN/OWNER to record an ADJUSTMENT event', async () => {
      const res = await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/adjustment`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amount: 1500,
          postings: [
            { memberId: hirushiMemberId, amount: 1500 },
            { memberId: kasunMemberId, amount: -1500 },
          ],
          notes: 'Manual balance correction',
        })
        .expect(201);

      expect(res.body.type).toBe('ADJUSTMENT');
    });

    it('returns 403 if normal MEMBER tries to create an ADJUSTMENT', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/adjustment`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          amount: 1500,
          postings: [
            { memberId: hirushiMemberId, amount: 1500 },
            { memberId: kasunMemberId, amount: -1500 },
          ],
        })
        .expect(403);
    });

    it('returns 422 if adjustment postings do not sum to zero', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/adjustment`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amount: 1500,
          postings: [
            { memberId: hirushiMemberId, amount: 1500 },
            { memberId: kasunMemberId, amount: -1000 }, // sum = +500 != 0
          ],
        })
        .expect(422);
    });
  });

  // ─── 6. Event Retrieval Endpoints ──────────────────────────────────────────

  describe('GET /trips/:tripId/events', () => {
    it('returns a paginated list of events with postings and creator info', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/loan`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          lenderMemberId: kasunMemberId,
          borrowerMemberId: amalMemberId,
          amount: 2500,
        });

      const res = await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/events`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(50);
      expect(res.body.items[0].type).toBe('LOAN');
      expect(res.body.items[0].postings).toHaveLength(2);
    });

    it('caps pageSize at 200 and still reports the true total', async () => {
      for (let i = 0; i < 2; i++) {
        await supertest(app.getHttpServer())
          .post(`/trips/${tripId}/events/loan`)
          .set('Authorization', `Bearer ${memberToken}`)
          .send({
            lenderMemberId: kasunMemberId,
            borrowerMemberId: amalMemberId,
            amount: 1000,
          })
          .expect(201);
      }

      const res = await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/events?pageSize=300`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.pageSize).toBe(200);
      expect(res.body.total).toBe(2);
    });

    it('pages through events and exposes totalPages', async () => {
      for (let i = 0; i < 3; i++) {
        await supertest(app.getHttpServer())
          .post(`/trips/${tripId}/events/loan`)
          .set('Authorization', `Bearer ${memberToken}`)
          .send({
            lenderMemberId: kasunMemberId,
            borrowerMemberId: amalMemberId,
            amount: 1000 + i,
          })
          .expect(201);
      }

      const pageOne = await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/events?page=1&pageSize=2`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
      expect(pageOne.body.items).toHaveLength(2);
      expect(pageOne.body.page).toBe(1);
      expect(pageOne.body.totalPages).toBe(2);

      const pageTwo = await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/events?page=2&pageSize=2`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
      expect(pageTwo.body.items).toHaveLength(1);
      expect(pageTwo.body.page).toBe(2);

      // No overlap between pages
      const ids = new Set([
        ...pageOne.body.items.map((e: { id: string }) => e.id),
        ...pageTwo.body.items.map((e: { id: string }) => e.id),
      ]);
      expect(ids.size).toBe(3);
    });

    it('rejects a non-numeric page param with 400', async () => {
      await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/events?page=abc`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(400);
    });
  });
});
