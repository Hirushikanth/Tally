import { InvalidInputError } from './errors';
import type { CashMovementInput, PostingDraft } from './posting-engine.types';
import { validateZeroSum } from './validate-zero-sum';

export function computeCashMovementPostings(
  input: CashMovementInput,
): PostingDraft[] {
  const { cashPayerId, cashReceiverId, amount } = input;

  if (!cashPayerId || !cashReceiverId) {
    throw new InvalidInputError('Cash payer and receiver are required');
  }
  if (cashPayerId === cashReceiverId) {
    throw new InvalidInputError(
      'Cash payer and receiver must be different members',
    );
  }
  if (amount <= 0) {
    throw new InvalidInputError('Cash movement amount must be positive');
  }

  return validateZeroSum([
    { memberId: cashPayerId, amount },
    { memberId: cashReceiverId, amount: -amount },
  ]);
}
