import {
  Body,
  Controller,
  Get,
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
import { EventsService } from './events.service';
import {
  CreateSharedExpenseDto,
  CreateLoanDto,
  CreateCashMovementDto,
  CreateRefundDto,
  CreateAdjustmentDto,
} from './dto/events.dto';

@Controller('trips/:tripId/events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  /** POST /trips/:tripId/events/shared-expense */
  @Post('shared-expense')
  @RequireRole(MemberRole.MEMBER)
  createSharedExpense(
    @Param('tripId') tripId: string,
    @Request() req: { user: AuthenticatedUser },
    @Body() dto: CreateSharedExpenseDto,
  ) {
    return this.eventsService.createSharedExpense(tripId, req.user.userId, dto);
  }

  /** POST /trips/:tripId/events/loan */
  @Post('loan')
  @RequireRole(MemberRole.MEMBER)
  createLoan(
    @Param('tripId') tripId: string,
    @Request() req: { user: AuthenticatedUser },
    @Body() dto: CreateLoanDto,
  ) {
    return this.eventsService.createLoan(tripId, req.user.userId, dto);
  }

  /** POST /trips/:tripId/events/cash-movement (handles REPAYMENT and SETTLEMENT) */
  @Post('cash-movement')
  @RequireRole(MemberRole.MEMBER)
  createCashMovement(
    @Param('tripId') tripId: string,
    @Request() req: { user: AuthenticatedUser },
    @Body() dto: CreateCashMovementDto,
  ) {
    return this.eventsService.createCashMovement(tripId, req.user.userId, dto);
  }

  /** POST /trips/:tripId/events/refund */
  @Post('refund')
  @RequireRole(MemberRole.MEMBER)
  createRefund(
    @Param('tripId') tripId: string,
    @Request() req: { user: AuthenticatedUser },
    @Body() dto: CreateRefundDto,
  ) {
    return this.eventsService.createRefund(tripId, req.user.userId, dto);
  }

  /** POST /trips/:tripId/events/adjustment (ADMIN only) */
  @Post('adjustment')
  @RequireRole(MemberRole.ADMIN)
  createAdjustment(
    @Param('tripId') tripId: string,
    @Request() req: { user: AuthenticatedUser },
    @Body() dto: CreateAdjustmentDto,
  ) {
    return this.eventsService.createAdjustment(tripId, req.user.userId, dto);
  }

  /** GET /trips/:tripId/events */
  @Get()
  @RequireRole(MemberRole.VIEWER)
  getEvents(@Param('tripId') tripId: string) {
    return this.eventsService.findTripEvents(tripId);
  }

  /** GET /trips/:tripId/events/:id */
  @Get(':id')
  @RequireRole(MemberRole.VIEWER)
  getEventById(@Param('tripId') tripId: string, @Param('id') eventId: string) {
    return this.eventsService.findEventById(tripId, eventId);
  }
}
