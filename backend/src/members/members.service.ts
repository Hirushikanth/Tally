import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AddMemberDto } from './members.dto';

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async addMember(tripId: string, dto: AddMemberDto) {
    // Resolve user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new NotFoundException(`No user found with email ${dto.email}`);
    }

    // Prevent owner from being re-added or duplicated
    const existing = await this.prisma.member.findUnique({
      where: { tripId_userId: { tripId, userId: user.id } },
    });
    if (existing && existing.leftAt === null) {
      throw new ConflictException(
        'User is already an active member of this trip',
      );
    }

    // Prevent adding a user with OWNER role — only one owner is permitted
    if (dto.role === MemberRole.OWNER) {
      throw new BadRequestException(
        'Cannot assign OWNER role via member invitation',
      );
    }

    if (existing) {
      // Re-join: clear leftAt and update role
      return this.prisma.member.update({
        where: { id: existing.id },
        data: { leftAt: null, role: dto.role ?? MemberRole.MEMBER },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
    }

    return this.prisma.member.create({
      data: {
        tripId,
        userId: user.id,
        role: dto.role ?? MemberRole.MEMBER,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async getTripMembers(tripId: string) {
    return this.prisma.member.findMany({
      where: { tripId, leftAt: null },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async leaveTrip(tripId: string, userId: string) {
    const membership = await this.prisma.member.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });

    if (!membership || membership.leftAt !== null) {
      throw new NotFoundException('You are not an active member of this trip');
    }

    if (membership.role === MemberRole.OWNER) {
      throw new BadRequestException(
        'The trip OWNER cannot leave. Transfer ownership or archive the trip first.',
      );
    }

    return this.prisma.member.update({
      where: { id: membership.id },
      data: { leftAt: new Date() },
    });
  }
}
