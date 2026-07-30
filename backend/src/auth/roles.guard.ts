import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MemberRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ROLES_KEY } from './roles.decorator';
import { AuthenticatedUser } from './jwt.strategy';

// Numeric privilege levels — higher = more access
const ROLE_LEVEL: Record<MemberRole, number> = {
  [MemberRole.VIEWER]: 0,
  [MemberRole.MEMBER]: 1,
  [MemberRole.ADMIN]: 2,
  [MemberRole.OWNER]: 3,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.getAllAndOverride<
      MemberRole | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    // If no @RequireRole() decorator, skip role check
    if (!requiredRole) return true;

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      params?: Record<string, string>;
      url?: string;
    }>();

    if (!request.user) {
      throw new ForbiddenException('User context missing');
    }

    const { userId } = request.user;
    let tripId = request.params?.tripId ?? request.params?.id;

    // Fallback: extract tripId from request URL path (/trips/:tripId/...)
    if (!tripId && request.url) {
      const match = request.url.match(/\/trips\/([^/?]+)/);
      if (
        match &&
        match[1] &&
        match[1] !== 'events' &&
        match[1] !== 'members'
      ) {
        tripId = match[1];
      }
    }

    if (!tripId) {
      throw new ForbiddenException('Trip context required for this action');
    }

    const membership = await this.prisma.member.findUnique({
      where: { tripId_userId: { tripId, userId } },
      select: { role: true, leftAt: true },
    });

    if (!membership || membership.leftAt !== null) {
      throw new ForbiddenException('You are not a member of this trip');
    }

    const userLevel = ROLE_LEVEL[membership.role];
    const requiredLevel = ROLE_LEVEL[requiredRole];

    if (userLevel < requiredLevel) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredRole}, your role: ${membership.role}`,
      );
    }

    return true;
  }
}
