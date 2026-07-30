import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { SettlementsController } from './settlements.controller';
import { SettlementSuggestionService } from './settlement-suggestion.service';

@Module({
  imports: [LedgerModule],
  controllers: [SettlementsController],
  providers: [SettlementSuggestionService],
  exports: [SettlementSuggestionService],
})
export class SettlementsModule {}
