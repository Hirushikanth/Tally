import { Injectable } from '@nestjs/common';
import { MemberBalanceDto } from '../ledger/ledger.service';

export interface SuggestedSettlement {
  fromMemberId: string;
  fromMemberName: string;
  toMemberId: string;
  toMemberName: string;
  amount: number; // minor units (cents / positive integer)
}

export interface SettlementSuggestionsResponse {
  tripId: string;
  suggestedSettlements: SuggestedSettlement[];
}

@Injectable()
export class SettlementSuggestionService {
  /**
   * Pure debt simplification algorithm (Greedy Min-Cash-Flow).
   * Takes member balances and produces minimal settlement transactions.
   *
   * Sign convention:
   *   positive balance = should RECEIVE money (Creditor)
   *   negative balance = OWES money (Debtor)
   *
   * CRITICAL RULE (ACCOUNTING.md §3.7):
   * This is a READ-ONLY projection. It MUST NOT write any database rows.
   */
  computeSuggestedSettlements(
    balances: MemberBalanceDto[],
  ): SuggestedSettlement[] {
    const debtors: { memberId: string; userName: string; amountOwed: number }[] =
      [];
    const creditors: {
      memberId: string;
      userName: string;
      amountReceivable: number;
    }[] = [];

    for (const b of balances) {
      if (b.balance < 0) {
        debtors.push({
          memberId: b.memberId,
          userName: b.userName,
          amountOwed: Math.abs(b.balance),
        });
      } else if (b.balance > 0) {
        creditors.push({
          memberId: b.memberId,
          userName: b.userName,
          amountReceivable: b.balance,
        });
      }
    }

    // Sort by amounts descending (greedy matching)
    debtors.sort((a, b) => b.amountOwed - a.amountOwed);
    creditors.sort((a, b) => b.amountReceivable - a.amountReceivable);

    const suggestions: SuggestedSettlement[] = [];
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];

      const settlementAmount = Math.min(
        debtor.amountOwed,
        creditor.amountReceivable,
      );

      if (settlementAmount > 0) {
        suggestions.push({
          fromMemberId: debtor.memberId,
          fromMemberName: debtor.userName,
          toMemberId: creditor.memberId,
          toMemberName: creditor.userName,
          amount: settlementAmount,
        });

        debtor.amountOwed -= settlementAmount;
        creditor.amountReceivable -= settlementAmount;
      }

      if (debtor.amountOwed <= 0) {
        i++;
      }
      if (creditor.amountReceivable <= 0) {
        j++;
      }
    }

    return suggestions;
  }
}
