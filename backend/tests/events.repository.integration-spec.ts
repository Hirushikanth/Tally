import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, BusinessEventType } from '@prisma/client';
import { PrismaModule } from '../src/common/prisma/prisma.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { EventsRepository } from '../src/events/events.repository';

describe('EventsRepository Integration Tests (Phase 2 Database Invariants)', () => {
  let testingModule: TestingModule;
  let eventsRepository: EventsRepository;
  let prisma: PrismaService;

  const testDbUrl = process.env.TEST_DATABASE_URL || 'postgresql://hirushikanth@127.0.0.1:5432/tally_test';

  let testUserId: string;
  let testTripId: string;
  let member1Id: string;
  let member2Id: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDbUrl;

    testingModule = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [EventsRepository],
    }).compile();

    eventsRepository = testingModule.get<EventsRepository>(EventsRepository);
    prisma = testingModule.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    if (testingModule) {
      await testingModule.close();
    }
  });

  beforeEach(async () => {
    // Clean up test database tables using raw SQL (bypassing append-only triggers for cleanup if needed via TRUNCATE)
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Posting", "Attachment", "BusinessEvent", "Member", "Trip", "User" CASCADE;`);

    // Seed test user, trip, and members
    const user = await prisma.user.create({
      data: { name: 'Test User', email: `test-${Date.now()}@example.com` },
    });
    testUserId = user.id;

    const trip = await prisma.trip.create({
      data: { name: 'Test Trip', createdById: testUserId },
    });
    testTripId = trip.id;

    const m1 = await prisma.member.create({
      data: { tripId: testTripId, userId: testUserId },
    });
    member1Id = m1.id;

    const u2 = await prisma.user.create({
      data: { name: 'User 2', email: `test2-${Date.now()}@example.com` },
    });
    const m2 = await prisma.member.create({
      data: { tripId: testTripId, userId: u2.id },
    });
    member2Id = m2.id;
  });

  describe('Atomic Event & Posting Save', () => {
    it('saves a BusinessEvent and Postings atomically in a single transaction', async () => {
      const result = await eventsRepository.saveEvent({
        tripId: testTripId,
        type: BusinessEventType.SHARED_EXPENSE,
        metadata: {
          amount: 10000,
          createdById: testUserId,
          category: 'Food',
          notes: 'Dinner payment',
        },
        postings: [
          { memberId: member1Id, amount: 5000 },
          { memberId: member2Id, amount: -5000 },
        ],
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.type).toBe(BusinessEventType.SHARED_EXPENSE);
      expect(result.amount).toBe(10000);
      expect(result.postings).toHaveLength(2);

      const dbEvent = await prisma.businessEvent.findUnique({
        where: { id: result.id },
        include: { postings: true },
      });
      expect(dbEvent).toBeDefined();
      expect(dbEvent?.postings).toHaveLength(2);
      const postingSum = dbEvent?.postings.reduce((sum, p) => sum + p.amount, 0);
      expect(postingSum).toBe(0);
    });

    it('retrieves event via findById', async () => {
      const saved = await eventsRepository.saveEvent({
        tripId: testTripId,
        type: BusinessEventType.LOAN,
        metadata: { amount: 2000, createdById: testUserId },
        postings: [
          { memberId: member1Id, amount: 2000 },
          { memberId: member2Id, amount: -2000 },
        ],
      });

      const fetched = await eventsRepository.findById(saved.id);
      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(saved.id);
      expect(fetched?.postings).toHaveLength(2);
    });
  });

  describe('Database Invariant Enforcement (Postgres Triggers & Constraints)', () => {
    it('rejects non-zero-sum postings at the database trigger level', async () => {
      // Direct raw query in transaction inserting non-zero-sum postings
      await expect(
        prisma.$transaction(async (tx) => {
          const event = await tx.businessEvent.create({
            data: {
              tripId: testTripId,
              type: BusinessEventType.SHARED_EXPENSE,
              amount: 5000,
              createdById: testUserId,
            },
          });
          await tx.posting.create({
            data: { businessEventId: event.id, memberId: member1Id, amount: 3000 },
          });
          await tx.posting.create({
            data: { businessEventId: event.id, memberId: member2Id, amount: -1000 }, // sum = +2000 != 0
          });
        }),
      ).rejects.toThrow(/do not sum to zero|Accounting invariant violation/i);
    });

    it('rejects BusinessEvent with 0 postings at the database trigger level', async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.businessEvent.create({
            data: {
              tripId: testTripId,
              type: BusinessEventType.SHARED_EXPENSE,
              amount: 5000,
              createdById: testUserId,
            },
          });
          // No postings created
        }),
      ).rejects.toThrow(/must have at least 1 posting|Accounting invariant violation/i);
    });

    it('rejects REFUND BusinessEvent without refundOfId via CHECK constraint', async () => {
      await expect(
        prisma.businessEvent.create({
          data: {
            tripId: testTripId,
            type: BusinessEventType.REFUND,
            amount: 1000,
            createdById: testUserId,
            refundOfId: null, // Null refundOfId on REFUND type
          },
        }),
      ).rejects.toThrow(/check_refund_has_refundof/i);
    });

    it('rejects UPDATE operations on BusinessEvent via append-only trigger', async () => {
      const saved = await eventsRepository.saveEvent({
        tripId: testTripId,
        type: BusinessEventType.SHARED_EXPENSE,
        metadata: { amount: 1000, createdById: testUserId },
        postings: [
          { memberId: member1Id, amount: 1000 },
          { memberId: member2Id, amount: -1000 },
        ],
      });

      await expect(
        prisma.businessEvent.update({
          where: { id: saved.id },
          data: { notes: 'Attempted update' },
        }),
      ).rejects.toThrow(/Immutability violation: BusinessEvent records are append-only/i);
    });

    it('rejects DELETE operations on BusinessEvent via append-only trigger', async () => {
      const saved = await eventsRepository.saveEvent({
        tripId: testTripId,
        type: BusinessEventType.SHARED_EXPENSE,
        metadata: { amount: 1000, createdById: testUserId },
        postings: [
          { memberId: member1Id, amount: 1000 },
          { memberId: member2Id, amount: -1000 },
        ],
      });

      await expect(
        prisma.businessEvent.delete({
          where: { id: saved.id },
        }),
      ).rejects.toThrow(/Immutability violation: BusinessEvent records are append-only/i);
    });

    it('rejects UPDATE operations on Posting via append-only trigger', async () => {
      const saved = await eventsRepository.saveEvent({
        tripId: testTripId,
        type: BusinessEventType.SHARED_EXPENSE,
        metadata: { amount: 1000, createdById: testUserId },
        postings: [
          { memberId: member1Id, amount: 1000 },
          { memberId: member2Id, amount: -1000 },
        ],
      });

      const posting = saved.postings[0];
      await expect(
        prisma.posting.update({
          where: { id: posting.id },
          data: { amount: 5000 },
        }),
      ).rejects.toThrow(/Immutability violation: Posting records are append-only/i);
    });

    it('rejects DELETE operations on Posting via append-only trigger', async () => {
      const saved = await eventsRepository.saveEvent({
        tripId: testTripId,
        type: BusinessEventType.SHARED_EXPENSE,
        metadata: { amount: 1000, createdById: testUserId },
        postings: [
          { memberId: member1Id, amount: 1000 },
          { memberId: member2Id, amount: -1000 },
        ],
      });

      const posting = saved.postings[0];
      await expect(
        prisma.posting.delete({
          where: { id: posting.id },
        }),
      ).rejects.toThrow(/Immutability violation: Posting records are append-only/i);
    });
  });
});
