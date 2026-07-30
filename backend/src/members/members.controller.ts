import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRole } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AddMemberDto } from './members.dto';
import { MembersService } from './members.service';

@Controller('trips/:tripId/members')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  /** POST /trips/:tripId/members — add a member (ADMIN or above) */
  @Post()
  @RequireRole(MemberRole.ADMIN)
  addMember(@Param('tripId') tripId: string, @Body() dto: AddMemberDto) {
    return this.membersService.addMember(tripId, dto);
  }

  /** GET /trips/:tripId/members — list all active members */
  @Get()
  @RequireRole(MemberRole.VIEWER)
  getMembers(@Param('tripId') tripId: string) {
    return this.membersService.getTripMembers(tripId);
  }

  /** POST /trips/:tripId/members/leave — leave the trip */
  @Post('leave')
  @HttpCode(HttpStatus.OK)
  @RequireRole(MemberRole.VIEWER)
  leaveTrip(
    @Param('tripId') tripId: string,
    @Request() req: { user: AuthenticatedUser },
  ) {
    return this.membersService.leaveTrip(tripId, req.user.userId);
  }
}
