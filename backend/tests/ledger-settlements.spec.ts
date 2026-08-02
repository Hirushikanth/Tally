import { NotFoundException } from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import {
  LedgerService,
  MemberBalanceDto,
} from '../src/ledger/ledger.service';
import { SettlementSuggestionService } from '../src/settlements/settlement-suggestion.service';

describe('Phase 5 — Read Path & Debt Simplification', () => {
  describe('SettlementSuggestionService (Debt Simplification Engine)', () => {
    let service: SettlementSuggestionService;

    beforeEach(() => {
      service = new SettlementSuggestionService();
    });

    it('simplifies a 2-person debt (A owes B $50)', () => {
      const balances: MemberBalanceDto[] = [
        {
          memberId: 'm1',
          userId: 'u1',
          userName: 'Alice',
          userEmail: 'alice@example.com',
          role: MemberRole.MEMBER,
          balance: -5000, // Owes 50.00
        },
        {
          memberId: 'm2',
          userId: 'u2',
          userName: 'Bob',
          userEmail: 'bob@example.com',
          role: MemberRole.MEMBER,
          balance: 5000, // Should receive 50.00
        },
      ];

      const suggestions = service.computeSuggestedSettlements(balances);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toEqual({
        fromMemberId: 'm1',
        fromMemberName: 'Alice',
        toMemberId: 'm2',
        toMemberName: 'Bob',
        amount: 5000,
      });
    });

    it('simplifies a 3-person chain debt (A: -30, B: -20, C: +50)', () => {
      const balances: MemberBalanceDto[] = [
        {
          memberId: 'm1',
          userId: 'u1',
          userName: 'Alice',
          userEmail: 'alice@example.com',
          role: MemberRole.MEMBER,
          balance: -3000,
        },
        {
          memberId: 'm2',
          userId: 'u2',
          userName: 'Bob',
          userEmail: 'bob@example.com',
          role: MemberRole.MEMBER,
          balance: -2000,
        },
        {
          memberId: 'm3',
          userId: 'u3',
          userName: 'Charlie',
          userEmail: 'charlie@example.com',
          role: MemberRole.MEMBER,
          balance: 5000,
        },
      ];

      const suggestions = service.computeSuggestedSettlements(balances);

      expect(suggestions).toHaveLength(2);

      const totalSuggested = suggestions.reduce((sum, s) => sum + s.amount, 0);
      expect(totalSuggested).toBe(5000);

      expect(suggestions).toContainEqual({
        fromMemberId: 'm1',
        fromMemberName: 'Alice',
        toMemberId: 'm3',
        toMemberName: 'Charlie',
        amount: 3000,
      });

      expect(suggestions).toContainEqual({
        fromMemberId: 'm2',
        fromMemberName: 'Bob',
        toMemberId: 'm3',
        toMemberName: 'Charlie',
        amount: 2000,
      });
    });

    it('handles complex 5-member debt netting in minimal transactions', () => {
      const balances: MemberBalanceDto[] = [
        {
          memberId: 'm1',
          userId: 'u1',
          userName: 'Alice',
          userEmail: 'alice@example.com',
          role: MemberRole.MEMBER,
          balance: -4000,
        },
        {
          memberId: 'm2',
          userId: 'u2',
          userName: 'Bob',
          userEmail: 'bob@example.com',
          role: MemberRole.MEMBER,
          balance: -2000,
        },
        {
          memberId: 'm3',
          userId: 'u3',
          userName: 'Charlie',
          userEmail: 'charlie@example.com',
          role: MemberRole.MEMBER,
          balance: -2000,
        },
        {
          memberId: 'm4',
          userId: 'u4',
          userName: 'David',
          userEmail: 'david@example.com',
          role: MemberRole.MEMBER,
          balance: 5000,
        },
        {
          memberId: 'm5',
          userId: 'u5',
          userName: 'Eve',
          userEmail: 'eve@example.com',
          role: MemberRole.MEMBER,
          balance: 3000,
        },
      ];

      const suggestions = service.computeSuggestedSettlements(balances);

      // Verify zero sum conservation
      const totalFrom = suggestions.reduce((acc, s) => acc + s.amount, 0);
      expect(totalFrom).toBe(8000);

      // Theoretical upper bound for 3 debtors + 2 creditors is N + M - 1 = 4
      expect(suggestions.length).toBeLessThanOrEqual(4);
    });

    it('ignores members with zero balance', () => {
      const balances: MemberBalanceDto[] = [
        {
          memberId: 'm1',
          userId: 'u1',
          userName: 'Alice',
          userEmail: 'alice@example.com',
          role: MemberRole.MEMBER,
          balance: -1000,
        },
        {
          memberId: 'm2',
          userId: 'u2',
          userName: 'Bob',
          userEmail: 'bob@example.com',
          role: MemberRole.MEMBER,
          balance: 0, // Neutral
        },
        {
          memberId: 'm3',
          userId: 'u3',
          userName: 'Charlie',
          userEmail: 'charlie@example.com',
          role: MemberRole.MEMBER,
          balance: 1000,
        },
      ];

      const suggestions = service.computeSuggestedSettlements(balances);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].fromMemberId).toBe('m1');
      expect(suggestions[0].toMemberId).toBe('m3');
    });

    it('ACCOUNTING.md §3.7 invariant: pure function with zero database access', () => {
      // SettlementSuggestionService is instantiated with zero dependencies
      const keys = Object.keys(service);
      expect(keys).toHaveLength(0);
    });
  });

  describe('LedgerService', () => {
    let service: LedgerService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        trip: {
          findUnique: jest.fn(),
        },
        member: {
          findMany: jest.fn(),
          findFirst: jest.fn(),
        },
        posting: {
          groupBy: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn(),
          aggregate: jest.fn(),
        },
        balanceSnapshot: {
          upsert: jest.fn(),
        },
        $transaction: jest.fn((promises) => Promise.all(promises)),
      };

      service = new LedgerService(mockPrisma as unknown as PrismaService);
    });

    describe('getTripBalances', () => {
      it('calculates live balances per member correctly and verifies total sum = 0', async () => {
        mockPrisma.trip.findUnique.mockResolvedValue({ id: 'trip-1' });

        mockPrisma.member.findMany.mockResolvedValue([
          {
            id: 'm1',
            role: MemberRole.MEMBER,
            user: { id: 'u1', name: 'Alice', email: 'alice@test.com' },
          },
          {
            id: 'm2',
            role: MemberRole.MEMBER,
            user: { id: 'u2', name: 'Bob', email: 'bob@test.com' },
          },
        ]);

        mockPrisma.posting.groupBy.mockResolvedValue([
          { memberId: 'm1', _sum: { amount: 4000 } },
          { memberId: 'm2', _sum: { amount: -4000 } },
        ]);

        const result = await service.getTripBalances('trip-1');

        expect(result.tripId).toBe('trip-1');
        expect(result.totalSum).toBe(0);
        expect(result.balances).toEqual([
          {
            memberId: 'm1',
            userId: 'u1',
            userName: 'Alice',
            userEmail: 'alice@test.com',
            role: MemberRole.MEMBER,
            balance: 4000,
          },
          {
            memberId: 'm2',
            userId: 'u2',
            userName: 'Bob',
            userEmail: 'bob@test.com',
            role: MemberRole.MEMBER,
            balance: -4000,
          },
        ]);
      });

      it('throws NotFoundException when trip does not exist', async () => {
        mockPrisma.trip.findUnique.mockResolvedValue(null);

        await expect(service.getTripBalances('invalid-trip')).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('getMemberLedger', () => {
      it('returns paginated postings in reverse chronological order with accurately computed running balances', async () => {
        mockPrisma.member.findFirst.mockResolvedValue({
          id: 'm1',
          user: { id: 'u1', name: 'Alice', email: 'alice@test.com' },
        });
        mockPrisma.posting.count.mockResolvedValue(2);
        mockPrisma.posting.aggregate.mockResolvedValue({
          _sum: { amount: 6000 },
        });

        const createdDate1 = new Date('2026-01-01T10:00:00Z');
        const createdDate2 = new Date('2026-01-02T10:00:00Z');

        const postings = [
          {
            id: 'p1',
            amount: 8000,
            createdAt: createdDate1,
            businessEvent: {
              id: 'e1',
              type: 'SHARED_EXPENSE',
              notes: 'Hotel',
              category: 'Accommodation',
              amount: 10000,
              createdAt: createdDate1,
              createdById: 'u1',
              createdBy: { id: 'u1', name: 'Alice', email: 'alice@test.com' },
              refundOfId: null,
            },
          },
          {
            id: 'p2',
            amount: -2000,
            createdAt: createdDate2,
            businessEvent: {
              id: 'e2',
              type: 'SHARED_EXPENSE',
              notes: 'Dinner',
              category: 'Food',
              amount: 4000,
              createdAt: createdDate2,
              createdById: 'u2',
              createdBy: { id: 'u2', name: 'Bob', email: 'bob@test.com' },
              refundOfId: null,
            },
          },
        ];
        // First findMany = the page window; second = prior-sum probe (take: 0 on page 1).
        mockPrisma.posting.findMany
          .mockResolvedValueOnce(postings)
          .mockResolvedValueOnce([]);

        const result = await service.getMemberLedger('trip-1', 'm1');

        expect(result.memberId).toBe('m1');
        expect(result.userName).toBe('Alice');
        expect(result.currentBalance).toBe(6000);
        expect(result.total).toBe(2);
        expect(result.page).toBe(1);
        expect(result.pageSize).toBe(50);

        // Result items are reversed (newest first)
        expect(result.items).toHaveLength(2);
        expect(result.items[0].postingId).toBe('p2');
        expect(result.items[0].runningBalance).toBe(6000);
        expect(result.items[1].postingId).toBe('p1');
        expect(result.items[1].runningBalance).toBe(8000);
      });

      it('keeps running balances exact on later pages (prior-sum baseline)', async () => {
        mockPrisma.member.findFirst.mockResolvedValue({
          id: 'm1',
          user: { id: 'u1', name: 'Alice', email: 'alice@test.com' },
        });
        mockPrisma.posting.count.mockResolvedValue(3);
        mockPrisma.posting.aggregate.mockResolvedValue({
          _sum: { amount: 7000 },
        });

        const created = new Date('2026-01-01T10:00:00Z');
        mockPrisma.posting.findMany
          .mockResolvedValueOnce([
            // Page 2 window: the two newest postings
            {
              id: 'p2',
              amount: -2000,
              createdAt: created,
              businessEvent: { id: 'e2', type: 'SHARED_EXPENSE', notes: null, category: null, amount: 4000, createdAt: created, createdById: 'u1', createdBy: { id: 'u1', name: 'Alice', email: 'a@t.com' }, refundOfId: null },
            },
            {
              id: 'p3',
              amount: 1000,
              createdAt: created,
              businessEvent: { id: 'e3', type: 'LOAN', notes: null, category: null, amount: 1000, createdAt: created, createdById: 'u1', createdBy: { id: 'u1', name: 'Alice', email: 'a@t.com' }, refundOfId: null },
            },
          ])
          // Prior sum probe: one older posting of +8000 sits before the window
          .mockResolvedValueOnce([{ amount: 8000 }]);

        const result = await service.getMemberLedger('trip-1', 'm1', {
          page: 2,
          pageSize: 2,
        });

        expect(result.items).toHaveLength(2);
        expect(result.items[0].runningBalance).toBe(7000); // 8000 - 2000 + 1000 (p3, newest)
        expect(result.items[1].runningBalance).toBe(6000); // 8000 - 2000 (p2)
        expect(result.currentBalance).toBe(7000);
      });

      it('throws NotFoundException when member does not exist in trip', async () => {
        mockPrisma.member.findFirst.mockResolvedValue(null);

        await expect(
          service.getMemberLedger('trip-1', 'invalid-member'),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('rebuildBalanceSnapshots', () => {
      it('recomputes balance snapshots for all members', async () => {
        mockPrisma.member.findMany.mockResolvedValue([
          { id: 'm1' },
          { id: 'm2' },
        ]);

        mockPrisma.posting.groupBy.mockResolvedValue([
          { memberId: 'm1', _sum: { amount: 5000 } },
          { memberId: 'm2', _sum: { amount: -5000 } },
        ]);

        mockPrisma.balanceSnapshot.upsert.mockResolvedValue({});

        const result = await service.rebuildBalanceSnapshots('trip-1');

        expect(result.rebuiltCount).toBe(2);
        expect(mockPrisma.balanceSnapshot.upsert).toHaveBeenCalledTimes(2);
      });
    });
  });
});
