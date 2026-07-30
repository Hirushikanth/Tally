import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

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

export interface MemberLedgerResponse {
  memberId: string;
  userName: string;
  currentBalance: number;
  entries: MemberLedgerEntryDto[];
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
   */
  async getMemberLedger(
    tripId: string,
    memberId: string,
  ): Promise<MemberLedgerResponse> {
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

    const postings = await this.prisma.posting.findMany({
      where: { memberId },
      orderBy: { createdAt: 'asc' },
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
    });

    let runningBalance = 0;
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

    // Return entries in reverse chronological order (newest first)
    return {
      memberId: member.id,
      userName: member.user.name,
      currentBalance: runningBalance,
      entries: entries.reverse(),
    };
  }

  /**
   * GET /trips/:tripId/ledger
   * Returns the unified journal for a trip (all postings ordered newest first).
   */
  async getTripLedger(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    return this.prisma.posting.findMany({
      where: { member: { tripId } },
      orderBy: { createdAt: 'desc' },
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
    });
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
