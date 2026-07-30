import { InvalidInputError } from './errors';
import type { LoanInput, PostingDraft } from './posting-engine.types';
import { validateZeroSum } from './validate-zero-sum';

export function computeLoanPostings(input: LoanInput): PostingDraft[] {
  const { lenderId, borrowerId, amount } = input;

  if (!lenderId || !borrowerId) {
    throw new InvalidInputError('Lender and borrower are required');
  }
  if (lenderId === borrowerId) {
    throw new InvalidInputError(
      'Lender and borrower must be different members',
    );
  }
  if (amount <= 0) {
    throw new InvalidInputError('Loan amount must be positive');
  }

  return validateZeroSum([
    { memberId: lenderId, amount },
    { memberId: borrowerId, amount: -amount },
  ]);
}
