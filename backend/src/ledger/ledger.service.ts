import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  resolvePagination,
  paginate,
  Paginated,
} from '../common/pagination/paginate';
import { PaginationQueryDto } from '../common/pagination/pagination.dto';

export interface MemberBalanceDto {
  memberId: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  balance: number; // minor units (signed integer)
}

export interface TripBalancesResponse {
  tripId: string;
  totalSum: number;
  balances: MemberBalanceDto[];
}

export interface MemberLedgerEntryDto {
  postingId: string;
  amount: number;
  createdAt: Date;
  runningBalance: number;
  businessEvent: {
    id: string;
    type: string;
    notes: string | null;
    category: string | null;
    amount: number;
    createdAt: Date;
    createdById: string;
    createdBy: {
      id: string;
      name: string;
      email: string;
    };
    refundOfId: string | null;
  };
}

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /trips/:tripId/ledger/balances
   * Computes live balances per member: Balance(member) = SUM(Posting.amount) WHERE memberId = X
   */
  async getTripBalances(tripId: string): Promise<TripBalancesResponse> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const members = await this.prisma.member.findMany({
      where: { tripId, leftAt: null },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const postingSums = await this.prisma.posting.groupBy({
      by: ['memberId'],
      where: { member: { tripId } },
      _sum: { amount: true },
    });

    const postingMap = new Map<string, number>();
    for (const ps of postingSums) {
      postingMap.set(ps.memberId, ps._sum.amount ?? 0);
    }

    const balances: MemberBalanceDto[] = members.map((member) => ({
      memberId: member.id,
      userId: member.user.id,
      userName: member.user.name,
      userEmail: member.user.email,
      role: member.role,
      balance: postingMap.get(member.id) ?? 0,
    }));

    const totalSum = balances.reduce((acc, b) => acc + b.balance, 0);

    return {
      tripId,
      totalSum,
      balances,
    };
  }

  /**
   * GET /trips/:tripId/ledger/members/:memberId
   * Returns a member's ledger: all postings where memberId = X, ordered by time with running balance.
   * Paginated — running balances stay correct across pages (the sum of all
   * postings before the window is fetched and accumulated from).
   */
  async getMemberLedger(
    tripId: string,
    memberId: string,
    query: PaginationQueryDto = {},
  ): Promise<Paginated<MemberLedgerEntryDto> & {
    memberId: string;
    userName: string;
    currentBalance: number;
  }> {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, tripId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found in this trip');
    }

    const { page, pageSize, skip } = resolvePagination(query);
    const orderBy: Prisma.PostingOrderByWithRelationInput[] = [
      { createdAt: 'asc' },
      { id: 'asc' },
    ];

    const [total, postings, priorPostings, finalSum] = await Promise.all([
      this.prisma.posting.count({ where: { memberId } }),
      this.prisma.posting.findMany({
        where: { memberId },
        orderBy,
        skip,
        take: pageSize,
        include: {
          businessEvent: {
            include: {
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
      // Amounts of every posting strictly before this page's window, so
      // runningBalance stays exact no matter which page is requested.
      // take: 0 is valid and returns an empty array when skip === 0.
      this.prisma.posting.findMany({
        where: { memberId },
        orderBy,
        select: { amount: true },
        take: skip,
      }),
      // True current position of the member — independent of the page window.
      this.prisma.posting.aggregate({
        where: { memberId },
        _sum: { amount: true },
      }),
    ]);

    const currentBalance = finalSum._sum.amount ?? 0;
    let runningBalance = priorPostings.reduce((sum, p) => sum + p.amount, 0);
    const entries: MemberLedgerEntryDto[] = postings.map((posting) => {
      runningBalance += posting.amount;
      return {
        postingId: posting.id,
        amount: posting.amount,
        createdAt: posting.createdAt,
        runningBalance,
        businessEvent: {
          id: posting.businessEvent.id,
          type: posting.businessEvent.type,
          notes: posting.businessEvent.notes,
          category: posting.businessEvent.category,
          amount: posting.businessEvent.amount,
          createdAt: posting.businessEvent.createdAt,
          createdById: posting.businessEvent.createdById,
          createdBy: posting.businessEvent.createdBy,
          refundOfId: posting.businessEvent.refundOfId,
        },
      };
    });

    return {
      memberId: member.id,
      userName: member.user.name,
      currentBalance,
      ...paginate(entries.reverse(), total, page, pageSize),
    };
  }

  /**
   * GET /trips/:tripId/ledger
   * Returns the unified journal for a trip (all postings ordered newest first).
   */
  async getTripLedger(
    tripId: string,
    query: PaginationQueryDto = {},
  ): Promise<Paginated<unknown>> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const { page, pageSize, skip } = resolvePagination(query);

    const [total, items] = await Promise.all([
      this.prisma.posting.count({ where: { member: { tripId } } }),
      this.prisma.posting.findMany({
        where: { member: { tripId } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          member: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          businessEvent: {
            include: {
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return paginate(items, total, page, pageSize);
  }

  /**
   * Rebuilds BalanceSnapshot projection table from ground-truth Postings.
   */
  async rebuildBalanceSnapshots(tripId?: string) {
    const members = await this.prisma.member.findMany({
      where: tripId ? { tripId, leftAt: null } : { leftAt: null },
      select: { id: true },
    });

    const postingSums = await this.prisma.posting.groupBy({
      by: ['memberId'],
      where: tripId ? { member: { tripId } } : undefined,
      _sum: { amount: true },
    });

    const postingMap = new Map<string, number>();
    for (const ps of postingSums) {
      postingMap.set(ps.memberId, ps._sum.amount ?? 0);
    }

    const now = new Date();
    await this.prisma.$transaction(
      members.map((m) =>
        this.prisma.balanceSnapshot.upsert({
          where: { memberId: m.id },
          create: {
            memberId: m.id,
            balance: postingMap.get(m.id) ?? 0,
            computedAt: now,
          },
          update: {
            balance: postingMap.get(m.id) ?? 0,
            computedAt: now,
          },
        }),
      ),
    );

    return {
      rebuiltCount: members.length,
      computedAt: now,
    };
  }
}
