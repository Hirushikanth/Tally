import { SetMetadata } from '@nestjs/common';
import { MemberRole } from '@prisma/client';

export const ROLES_KEY = 'requiredRole';

/**
 * Declares the minimum MemberRole required within a trip context.
 * Role hierarchy (ascending privilege): VIEWER < MEMBER < ADMIN < OWNER
 */
export const RequireRole = (role: MemberRole) => SetMetadata(ROLES_KEY, role);
