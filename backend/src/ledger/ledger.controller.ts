import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRole } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { LedgerService } from './ledger.service';

@Controller('trips/:tripId/ledger')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  /** GET /trips/:tripId/ledger/balances — live balances for all members */
  @Get('balances')
  @RequireRole(MemberRole.VIEWER)
  getBalances(@Param('tripId') tripId: string) {
    return this.ledgerService.getTripBalances(tripId);
  }

  /** GET /trips/:tripId/ledger/members/:memberId — ledger history for a specific member */
  @Get('members/:memberId')
  @RequireRole(MemberRole.VIEWER)
  getMemberLedger(
    @Param('tripId') tripId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.ledgerService.getMemberLedger(tripId, memberId);
  }

  /** GET /trips/:tripId/ledger — full trip unified journal */
  @Get()
  @RequireRole(MemberRole.VIEWER)
  getTripLedger(@Param('tripId') tripId: string) {
    return this.ledgerService.getTripLedger(tripId);
  }

  /** POST /trips/:tripId/ledger/rebuild-snapshots — trigger snapshot cache rebuild (ADMIN only) */
  @Post('rebuild-snapshots')
  @HttpCode(HttpStatus.OK)
  @RequireRole(MemberRole.ADMIN)
  rebuildSnapshots(@Param('tripId') tripId: string) {
    return this.ledgerService.rebuildBalanceSnapshots(tripId);
  }
}
