import { ZeroSumError } from './errors';
import type { PostingDraft } from './posting-engine.types';

export function sumPostings(postings: PostingDraft[]): number {
  return postings.reduce((sum, posting) => sum + posting.amount, 0);
}

export function validateZeroSum(postings: PostingDraft[]): PostingDraft[] {
  if (postings.length === 0) {
    throw new ZeroSumError(0);
  }

  const sum = sumPostings(postings);
  if (sum !== 0) {
    throw new ZeroSumError(sum);
  }

  return postings;
}
