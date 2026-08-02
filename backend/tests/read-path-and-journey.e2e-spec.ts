import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const supertest = require('supertest') as (app: unknown) => import('supertest').SuperTest<import('supertest').Test>;
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';

/**
 * Phase 9 E2E: full user journey + read path (balances, ledger, settlements,
 * snapshot rebuild) + additional rejection paths, per DEVELOPMENT_TIMELINE.md
 * Phase 9 and PROJECT_CONTEXT.md §14 (Definition of Done).
 * Runs against the real tally_test PostgreSQL database.
 */
describe('Phase 9 — Full Journey & Read Path E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const getTestDbUrl = () =>
    process.env.DATABASE_URL ||
    process.env.TEST_DATABASE_URL ||
    'postgresql://hirushikanth@127.0.0.1:5432/tally_test';

  let ownerToken: string;
  let memberToken: string;
  let strangerToken: string;

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
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new DomainErrorFilter());
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const register = async (name: string, email: string) => {
    const res = await supertest(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'password123' })
      .expect(201);
    return res.body.accessToken as string;
  };

  const addMember = async (email: string, role = 'MEMBER') => {
    const res = await supertest(app.getHttpServer())
      .post(`/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email, role })
      .expect(201);
    return res.body.id as string;
  };

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "Posting", "Attachment", "BusinessEvent", "BalanceSnapshot", "Member", "Trip", "User" CASCADE;`,
    );

    ownerToken = await register('Hirushi', 'hirushi@example.com');
    memberToken = await register('Kasun', 'kasun@example.com');
    await register('Amal', 'amal@example.com');
    await register('Sahan', 'sahan@example.com');
    await register('Nimal', 'nimal@example.com');
    strangerToken = await register('Stranger', 'stranger@example.com');

    const tripRes = await supertest(app.getHttpServer())
      .post('/trips')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Sri Lanka Trip', currency: 'LKR' })
      .expect(201);
    tripId = tripRes.body.id as string;
    hirushiMemberId = tripRes.body.members[0].id as string;

    kasunMemberId = await addMember('kasun@example.com');
    amalMemberId = await addMember('amal@example.com');
    sahanMemberId = await addMember('sahan@example.com');
    nimalMemberId = await addMember('nimal@example.com');
  });

  // ─── 1. Full user journey (DoD §14.6) ─────────────────────────────────────

  describe('Full user journey: trip → members → expense → loan → settlement → balances', () => {
    it('completes the walkthrough with provably correct final balances', async () => {
      // 1. Shared expense: $100 hotel, Hirushi $60 + Kasun $40, split 5 ways
      const expense = await supertest(app.getHttpServer())
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
      expect(expense.body.type).toBe('SHARED_EXPENSE');

      // 2. Loan: Kasun lends Amal $50
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/loan`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          lenderMemberId: kasunMemberId,
          borrowerMemberId: amalMemberId,
          amount: 5000,
          notes: 'Cash lent for entrance fee',
        })
        .expect(201);

      // 3. Settlement: Amal pays Hirushi $30 to true up
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/cash-movement`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          cashPayerMemberId: amalMemberId,
          cashReceiverMemberId: hirushiMemberId,
          amount: 3000,
          type: 'SETTLEMENT',
          notes: 'Bank transfer',
        })
        .expect(201);

      // 4. Balances must equal the derived sums
      //    Expense:  H +4000 K +2000 A -2000 S -2000 N -2000
      //    Loan:     K +5000 A -5000
      //    Settlement: A +3000 H -3000
      //    Final:    H +1000 K +7000 A -4000 S -2000 N -2000  (sum = 0)
      const balancesRes = await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/ledger/balances`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const balanceMap = new Map<string, number>(
        balancesRes.body.balances.map(
          (b: { memberId: string; balance: number }) => [b.memberId, b.balance],
        ),
      );

      expect(balanceMap.get(hirushiMemberId)).toBe(1000);
      expect(balanceMap.get(kasunMemberId)).toBe(7000);
      expect(balanceMap.get(amalMemberId)).toBe(-4000);
      expect(balanceMap.get(sahanMemberId)).toBe(-2000);
      expect(balanceMap.get(nimalMemberId)).toBe(-2000);
      expect(balancesRes.body.totalSum).toBe(0);

      // 5. Member ledger for Kasun: 2 entries, newest first, running balance = 7000
      const kasunLedger = await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/ledger/members/${kasunMemberId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(kasunLedger.body.currentBalance).toBe(7000);
      expect(kasunLedger.body.entries).toHaveLength(2);
      expect(kasunLedger.body.entries[0].amount).toBe(5000); // loan, newest
      expect(kasunLedger.body.entries[0].runningBalance).toBe(7000);
      expect(kasunLedger.body.entries[1].amount).toBe(2000); // expense
      expect(kasunLedger.body.entries[1].runningBalance).toBe(2000);

      // 6. Unified trip ledger: 5 + 2 + 2 = 9 postings
      const tripLedger = await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/ledger`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(tripLedger.body).toHaveLength(9);

      // 7. Events listing shows all three events
      const events = await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/events`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(events.body).toHaveLength(3);
      expect(events.body.map((e: { type: string }) => e.type)).toEqual(
        expect.arrayContaining(['SHARED_EXPENSE', 'LOAN', 'SETTLEMENT']),
      );
    });
  });

  // ─── 2. Settlement suggestions: read-only, zero writes (DoD §14.5) ────────

  describe('GET /trips/:tripId/settlements/suggestions', () => {
    it('computes suggestions and performs ZERO writes to Posting/BusinessEvent', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/shared-expense`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          amount: 10000,
          payers: [{ memberId: hirushiMemberId, amountPaid: 10000 }],
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
        })
        .expect(201);

      const postingsBefore = await prisma.posting.count();
      const eventsBefore = await prisma.businessEvent.count();
      const snapshotsBefore = await prisma.balanceSnapshot.count();

      const res = await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/settlements/suggestions`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.tripId).toBe(tripId);
      expect(res.body.suggestedSettlements).toHaveLength(4);

      // Total suggested = total amount owed = sum of positive balances = 8000
      const totalSuggested = res.body.suggestedSettlements.reduce(
        (sum: number, s: { amount: number }) => sum + s.amount,
        0,
      );
      expect(totalSuggested).toBe(8000);

      // Every suggestion routes money from a debtor to the only creditor
      for (const s of res.body.suggestedSettlements) {
        expect(s.toMemberId).toBe(hirushiMemberId);
      }

      // Zero-write proof: nothing was persisted by the suggestion read-model
      expect(await prisma.posting.count()).toBe(postingsBefore);
      expect(await prisma.businessEvent.count()).toBe(eventsBefore);
      expect(await prisma.balanceSnapshot.count()).toBe(snapshotsBefore);
    });

    it('returns an empty list when everyone is settled up', async () => {
      const res = await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/settlements/suggestions`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);
      expect(res.body.suggestedSettlements).toEqual([]);
    });
  });

  // ─── 3. BalanceSnapshot rebuild (ADMIN/OWNER only) ─────────────────────────

  describe('POST /trips/:tripId/ledger/rebuild-snapshots', () => {
    it('rebuilds snapshots that reconcile to live posting sums', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/loan`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          lenderMemberId: kasunMemberId,
          borrowerMemberId: amalMemberId,
          amount: 2500,
        })
        .expect(201);

      const res = await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/ledger/rebuild-snapshots`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.rebuiltCount).toBe(5);

      const snapshots = await prisma.balanceSnapshot.findMany();
      expect(snapshots).toHaveLength(5);

      const snapshotMap = new Map(snapshots.map((s) => [s.memberId, s.balance]));
      expect(snapshotMap.get(kasunMemberId)).toBe(2500);
      expect(snapshotMap.get(amalMemberId)).toBe(-2500);
      expect(snapshotMap.get(hirushiMemberId)).toBe(0);
    });

    it('returns 403 when a plain MEMBER attempts a rebuild', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/ledger/rebuild-snapshots`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });
  });

  // ─── 4. Additional rejection paths ────────────────────────────────────────

  describe('Rejection paths', () => {
    it('returns 400 for a loan where the borrower is not in the trip', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/loan`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          lenderMemberId: kasunMemberId,
          borrowerMemberId: 'not-a-member',
          amount: 1000,
        })
        .expect(400);
    });

    it('returns 400 for a cash movement where the receiver is not in the trip', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/cash-movement`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          cashPayerMemberId: kasunMemberId,
          cashReceiverMemberId: 'not-a-member',
          amount: 1000,
          type: 'REPAYMENT',
        })
        .expect(400);
    });

    it('returns 400 for a refund without refundOfId (DTO validation)', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/refund`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ refundAmount: 1000 })
        .expect(400);
    });

    it('returns 400 for a refund with an empty refundOfId', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/refund`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ refundOfId: '', refundAmount: 1000 })
        .expect(400);
    });

    it('returns 401 for unauthenticated event creation', async () => {
      await supertest(app.getHttpServer())
        .post(`/trips/${tripId}/events/loan`)
        .send({
          lenderMemberId: kasunMemberId,
          borrowerMemberId: amalMemberId,
          amount: 1000,
        })
        .expect(401);
    });

    it('returns 401 for unauthenticated balance reads', async () => {
      await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/ledger/balances`)
        .expect(401);
    });

    it('returns 403 for a non-member reading balances', async () => {
      await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/ledger/balances`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(403);
    });

    it('returns 403 for a non-member listing events', async () => {
      await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/events`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(403);
    });

    it('returns 404 for a member ledger of a member from another trip', async () => {
      // Create a second trip and grab one of its member ids
      const otherTrip = await supertest(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Other Trip' })
        .expect(201);
      const otherMemberId = otherTrip.body.members[0].id as string;

      await supertest(app.getHttpServer())
        .get(`/trips/${tripId}/ledger/members/${otherMemberId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });
  });
});
