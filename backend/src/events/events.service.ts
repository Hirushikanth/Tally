import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { BusinessEventType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { resolvePagination, paginate } from '../common/pagination/paginate';
import { PaginationQueryDto } from '../common/pagination/pagination.dto';
import { EventsRepository } from './events.repository';
import {
  computeSharedExpensePostings,
  computeLoanPostings,
  computeCashMovementPostings,
  computeRefundPostings,
  computeAdjustmentPostings,
  SharedExpenseInput,
} from '../posting-engine/posting-engine';
import {
  CreateSharedExpenseDto,
  CreateLoanDto,
  CreateCashMovementDto,
  CreateRefundDto,
  CreateAdjustmentDto,
} from './dto/events.dto';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsRepository: EventsRepository,
  ) {}

  private async validateMembersInTrip(tripId: string, memberIds: string[]) {
    const uniqueIds = Array.from(new Set(memberIds));
    const count = await this.prisma.member.count({
      where: {
        tripId,
        id: { in: uniqueIds },
        leftAt: null,
      },
    });

    if (count !== uniqueIds.length) {
      throw new BadRequestException(
        'One or more member IDs do not belong to active members of this trip',
      );
    }
  }

  async createSharedExpense(
    tripId: string,
    createdByUserId: string,
    dto: CreateSharedExpenseDto,
  ) {
    // Collect member IDs from payers and split payload for membership validation
    const payerMemberIds = dto.payers.map((p) => p.memberId);
    let participantMemberIds: string[] = [];
    const splitPayload = dto.split as SharedExpenseInput['split'];

    if (splitPayload.method === 'EQUAL') {
      participantMemberIds = splitPayload.participantIds ?? [];
    } else if ('shares' in splitPayload && Array.isArray(splitPayload.shares)) {
      participantMemberIds = splitPayload.shares.map((s) => s.memberId);
    }

    await this.validateMembersInTrip(tripId, [
      ...payerMemberIds,
      ...participantMemberIds,
    ]);

    // Financial facts strictly separated from human metadata
    const input = {
      totalAmount: dto.amount,
      payers: dto.payers.map((p) => ({
        memberId: p.memberId,
        amountPaid: p.amountPaid,
      })),
      split: splitPayload,
    } as SharedExpenseInput;

    const postings = computeSharedExpensePostings(input);

    return this.eventsRepository.saveEvent({
      tripId,
      type: BusinessEventType.SHARED_EXPENSE,
      metadata: {
        amount: dto.amount,
        createdById: createdByUserId,
        notes: dto.notes,
        category: dto.category,
      },
      // Human-facing "what happened": who paid how much, and how it split.
      // Display metadata only — the Posting journal remains the accounting truth.
      details: {
        payers: dto.payers.map((p) => ({
          memberId: p.memberId,
          amountPaid: p.amountPaid,
        })),
        split: splitPayload,
      },
      postings,
    });
  }

  async createLoan(
    tripId: string,
    createdByUserId: string,
    dto: CreateLoanDto,
  ) {
    await this.validateMembersInTrip(tripId, [
      dto.lenderMemberId,
      dto.borrowerMemberId,
    ]);

    const postings = computeLoanPostings({
      lenderId: dto.lenderMemberId,
      borrowerId: dto.borrowerMemberId,
      amount: dto.amount,
    });

    return this.eventsRepository.saveEvent({
      tripId,
      type: BusinessEventType.LOAN,
      metadata: {
        amount: dto.amount,
        createdById: createdByUserId,
        notes: dto.notes,
        category: dto.category,
      },
      details: {
        lenderMemberId: dto.lenderMemberId,
        borrowerMemberId: dto.borrowerMemberId,
      },
      postings,
    });
  }

  async createCashMovement(
    tripId: string,
    createdByUserId: string,
    dto: CreateCashMovementDto,
  ) {
    await this.validateMembersInTrip(tripId, [
      dto.cashPayerMemberId,
      dto.cashReceiverMemberId,
    ]);

    const postings = computeCashMovementPostings({
      cashPayerId: dto.cashPayerMemberId,
      cashReceiverId: dto.cashReceiverMemberId,
      amount: dto.amount,
    });

    return this.eventsRepository.saveEvent({
      tripId,
      type: dto.type,
      metadata: {
        amount: dto.amount,
        createdById: createdByUserId,
        notes: dto.notes,
        category: dto.category,
      },
      details: {
        cashPayerMemberId: dto.cashPayerMemberId,
        cashReceiverMemberId: dto.cashReceiverMemberId,
      },
      postings,
    });
  }

  async createRefund(
    tripId: string,
    createdByUserId: string,
    dto: CreateRefundDto,
  ) {
    const originalEvent =
      await this.eventsRepository.findOriginalEventForRefund(dto.refundOfId);

    if (!originalEvent || originalEvent.tripId !== tripId) {
      throw new NotFoundException(
        `Original business event ${dto.refundOfId} not found in this trip`,
      );
    }

    const postings = computeRefundPostings({
      refundAmount: dto.refundAmount,
      originalAmount: originalEvent.amount,
      originalPostings: originalEvent.postings.map((p) => ({
        memberId: p.memberId,
        amount: p.amount,
      })),
    });

    return this.eventsRepository.saveEvent({
      tripId,
      type: BusinessEventType.REFUND,
      metadata: {
        amount: dto.refundAmount,
        createdById: createdByUserId,
        notes: dto.notes,
        category: dto.category,
        refundOfId: dto.refundOfId,
      },
      details: {
        refundedOfId: dto.refundOfId,
        refundedAmount: originalEvent.amount,
      },
      postings,
    });
  }

  async createAdjustment(
    tripId: string,
    createdByUserId: string,
    dto: CreateAdjustmentDto,
  ) {
    const postingMemberIds = dto.postings.map((p) => p.memberId);
    await this.validateMembersInTrip(tripId, postingMemberIds);

    const postings = computeAdjustmentPostings({
      postings: dto.postings,
    });

    return this.eventsRepository.saveEvent({
      tripId,
      type: BusinessEventType.ADJUSTMENT,
      metadata: {
        amount: dto.amount,
        createdById: createdByUserId,
        notes: dto.notes,
        category: dto.category,
      },
      details: {
        allocations: dto.postings.map((p) => ({
          memberId: p.memberId,
          amount: p.amount,
        })),
      },
      postings,
    });
  }

  async findTripEvents(tripId: string, query: PaginationQueryDto = {}) {
    const { page, pageSize, skip } = resolvePagination(query);
    const [total, items] = await Promise.all([
      this.prisma.businessEvent.count({ where: { tripId } }),
      this.prisma.businessEvent.findMany({
        where: { tripId },
        include: {
          postings: {
            include: {
              member: {
                include: {
                  user: { select: { id: true, name: true, email: true } },
                },
              },
            },
          },
          createdBy: { select: { id: true, name: true, email: true } },
          refundOf: { select: { id: true, type: true, amount: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return paginate(items, total, page, pageSize);
  }

  async findEventById(tripId: string, eventId: string) {
    const event = await this.prisma.businessEvent.findFirst({
      where: { id: eventId, tripId },
      include: {
        postings: {
          include: {
            member: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        refundOf: { select: { id: true, type: true, amount: true } },
      },
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found in this trip`);
    }

    return event;
  }
}
