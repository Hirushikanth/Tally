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
import { CreateTripDto } from './trips.dto';
import { TripsService } from './trips.service';

@Controller('trips')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  /** POST /trips — create a new trip */
  @Post()
  create(
    @Request() req: { user: AuthenticatedUser },
    @Body() dto: CreateTripDto,
  ) {
    return this.tripsService.createTrip(req.user.userId, dto);
  }

  /** GET /trips — list trips where the authenticated user is an active member */
  @Get()
  findAll(@Request() req: { user: AuthenticatedUser }) {
    return this.tripsService.findUserTrips(req.user.userId);
  }

  /** GET /trips/:id — get trip details (requires membership) */
  @Get(':id')
  findOne(
    @Request() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    return this.tripsService.findTripById(id, req.user.userId);
  }

  /** POST /trips/:id/archive — archive trip (OWNER only) */
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequireRole(MemberRole.OWNER)
  archive(
    @Request() req: { user: AuthenticatedUser },
    @Param('id') id: string,
  ) {
    return this.tripsService.archiveTrip(id, req.user.userId);
  }
}
