import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { MemberRole, TripStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateTripDto } from './trips.dto';

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTrip(userId: string, dto: CreateTripDto) {
    const trip = await this.prisma.trip.create({
      data: {
        name: dto.name,
        description: dto.description,
        currency: dto.currency ?? 'LKR',
        createdById: userId,
        members: {
          create: {
            userId,
            role: MemberRole.OWNER,
          },
        },
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    return trip;
  }

  async findUserTrips(userId: string) {
    return this.prisma.trip.findMany({
      where: {
        members: {
          some: {
            userId,
            leftAt: null,
          },
        },
      },
      include: {
        members: {
          where: { leftAt: null },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { businessEvents: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findTripById(tripId: string, userId: string) {
    const membership = await this.prisma.member.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!membership || membership.leftAt !== null) {
      throw new NotFoundException('Trip not found');
    }

    return this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: {
        members: {
          where: { leftAt: null },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { businessEvents: true } },
      },
    });
  }

  async archiveTrip(tripId: string, userId: string) {
    const membership = await this.prisma.member.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });

    if (!membership || membership.role !== MemberRole.OWNER) {
      throw new ForbiddenException('Only the trip OWNER can archive a trip');
    }

    return this.prisma.trip.update({
      where: { id: tripId },
      data: { status: TripStatus.ARCHIVED },
    });
  }
}
