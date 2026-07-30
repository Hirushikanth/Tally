import { InvalidInputError } from './errors';
import type { AdjustmentInput, PostingDraft } from './posting-engine.types';
import { validateZeroSum } from './validate-zero-sum';

export function computeAdjustmentPostings(
  input: AdjustmentInput,
): PostingDraft[] {
  if (input.postings.length === 0) {
    throw new InvalidInputError('Adjustment requires at least one posting');
  }

  for (const posting of input.postings) {
    if (!posting.memberId) {
      throw new InvalidInputError('Adjustment posting memberId is required');
    }
  }

  return validateZeroSum(input.postings.map((posting) => ({ ...posting })));
}
