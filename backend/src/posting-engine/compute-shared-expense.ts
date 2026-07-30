import { InvalidInputError } from './errors';
import { resolveShares } from './resolve-shares';
import type { PostingDraft, SharedExpenseInput } from './posting-engine.types';
import { validateZeroSum } from './validate-zero-sum';

function assertValidPayers(
  totalAmount: number,
  payers: SharedExpenseInput['payers'],
): void {
  if (payers.length === 0) {
    throw new InvalidInputError('Shared expense requires at least one payer');
  }

  const seen = new Set<string>();
  let paidSum = 0;

  for (const payer of payers) {
    if (!payer.memberId) {
      throw new InvalidInputError('Payer memberId is required');
    }
    if (payer.amountPaid < 0) {
      throw new InvalidInputError('Payer amounts must be non-negative');
    }
    if (seen.has(payer.memberId)) {
      throw new InvalidInputError('Duplicate payer memberId');
    }
    seen.add(payer.memberId);
    paidSum += payer.amountPaid;
  }

  if (paidSum !== totalAmount) {
    throw new InvalidInputError(
      `Payer amounts must sum to total amount (got ${paidSum}, expected ${totalAmount})`,
    );
  }
}

export function computeSharedExpensePostings(
  input: SharedExpenseInput,
): PostingDraft[] {
  assertValidPayers(input.totalAmount, input.payers);
  const shareOwedByMember = resolveShares(input);

  const payerAmounts = new Map<string, number>();
  for (const payer of input.payers) {
    payerAmounts.set(payer.memberId, payer.amountPaid);
  }

  const memberIds = new Set<string>([
    ...shareOwedByMember.keys(),
    ...payerAmounts.keys(),
  ]);

  const postings: PostingDraft[] = [];
  for (const memberId of memberIds) {
    const amountPaid = payerAmounts.get(memberId) ?? 0;
    const shareOwed = shareOwedByMember.get(memberId) ?? 0;
    postings.push({
      memberId,
      amount: amountPaid - shareOwed,
    });
  }

  return validateZeroSum(postings);
}
