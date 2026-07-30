import { Injectable } from '@nestjs/common';
import { BusinessEvent, BusinessEventType, Posting } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { validateZeroSum } from '../posting-engine/validate-zero-sum';
import { PostingDraft } from '../posting-engine/posting-engine.types';

export interface SaveEventParams {
  tripId: string;
  type: BusinessEventType;
  metadata: {
    amount: number;
    createdById: string;
    notes?: string;
    category?: string;
    refundOfId?: string;
  };
  postings: PostingDraft[];
}

export type BusinessEventWithPostings = BusinessEvent & {
  postings: Posting[];
};

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically saves a BusinessEvent and its associated Postings inside a single transaction.
   * Runs validateZeroSum on postings prior to persistence.
   */
  async saveEvent(params: SaveEventParams): Promise<BusinessEventWithPostings> {
    const { tripId, type, metadata, postings } = params;

    // Application-level pre-guard
    validateZeroSum(postings);

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.businessEvent.create({
        data: {
          tripId,
          type,
          amount: metadata.amount,
          createdById: metadata.createdById,
          notes: metadata.notes,
          category: metadata.category,
          refundOfId: metadata.refundOfId,
        },
      });

      await tx.posting.createMany({
        data: postings.map((p) => ({
          businessEventId: event.id,
          memberId: p.memberId,
          amount: p.amount,
        })),
      });

      return tx.businessEvent.findUniqueOrThrow({
        where: { id: event.id },
        include: { postings: true },
      });
    });
  }

  async findById(id: string): Promise<BusinessEventWithPostings | null> {
    return this.prisma.businessEvent.findUnique({
      where: { id },
      include: { postings: true },
    });
  }

  async findOriginalEventForRefund(
    id: string,
  ): Promise<BusinessEventWithPostings | null> {
    return this.prisma.businessEvent.findUnique({
      where: { id },
      include: { postings: true },
    });
  }
}
