import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRole } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { LedgerService } from '../ledger/ledger.service';
import {
  SettlementSuggestionService,
  SettlementSuggestionsResponse,
} from './settlement-suggestion.service';

@Controller('trips/:tripId/settlements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettlementsController {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly settlementSuggestionService: SettlementSuggestionService,
  ) {}

  /**
   * GET /trips/:tripId/settlements/suggestions
   * Computes read-only debt simplification suggestions based on live balances.
   */
  @Get('suggestions')
  @RequireRole(MemberRole.VIEWER)
  async getSuggestions(
    @Param('tripId') tripId: string,
  ): Promise<SettlementSuggestionsResponse> {
    const { balances } = await this.ledgerService.getTripBalances(tripId);
    const suggestedSettlements =
      this.settlementSuggestionService.computeSuggestedSettlements(balances);

    return {
      tripId,
      suggestedSettlements,
    };
  }
}
