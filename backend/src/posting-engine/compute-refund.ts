import { InvalidInputError } from './errors';
import type { PostingDraft, RefundInput } from './posting-engine.types';
import { sumPostings, validateZeroSum } from './validate-zero-sum';

function correctRoundingDrift(postings: PostingDraft[]): PostingDraft[] {
  const drift = sumPostings(postings);
  if (drift === 0) {
    return postings;
  }

  let largestIndex = 0;
  for (let i = 1; i < postings.length; i++) {
    if (
      Math.abs(postings[i].amount) > Math.abs(postings[largestIndex].amount)
    ) {
      largestIndex = i;
    }
  }

  const corrected = postings.map((posting) => ({ ...posting }));
  corrected[largestIndex] = {
    ...corrected[largestIndex],
    amount: corrected[largestIndex].amount - drift,
  };
  return corrected;
}

export function computeRefundPostings(input: RefundInput): PostingDraft[] {
  const { refundAmount, originalAmount, originalPostings } = input;

  if (originalPostings.length === 0) {
    throw new InvalidInputError('Refund requires original postings');
  }
  if (originalAmount <= 0) {
    throw new InvalidInputError('Original amount must be positive');
  }
  if (refundAmount <= 0) {
    throw new InvalidInputError('Refund amount must be positive');
  }
  if (refundAmount > originalAmount) {
    throw new InvalidInputError('Refund amount cannot exceed original amount');
  }

  const scaled = originalPostings.map((posting) => ({
    memberId: posting.memberId,
    amount: Math.round((posting.amount * refundAmount) / originalAmount) * -1,
  }));

  return validateZeroSum(correctRoundingDrift(scaled));
}
