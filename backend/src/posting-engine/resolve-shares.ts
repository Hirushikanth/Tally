import { InvalidInputError } from './errors';
import type { SharedExpenseInput } from './posting-engine.types';

export type ResolvedShares = Map<string, number>;

function distributeRemainder(
  baseShares: Map<string, number>,
  totalAmount: number,
  remainders: { memberId: string; remainder: number }[],
): ResolvedShares {
  const result = new Map(baseShares);
  let distributed = 0;
  for (const [, amount] of result) {
    distributed += amount;
  }

  let remaining = totalAmount - distributed;
  const sorted = [...remainders].sort((a, b) => {
    if (b.remainder !== a.remainder) {
      return b.remainder - a.remainder;
    }
    return a.memberId.localeCompare(b.memberId);
  });

  for (const { memberId } of sorted) {
    if (remaining <= 0) {
      break;
    }
    result.set(memberId, (result.get(memberId) ?? 0) + 1);
    remaining -= 1;
  }

  return result;
}

function resolveEqualShares(
  totalAmount: number,
  participantIds: string[],
): ResolvedShares {
  if (participantIds.length === 0) {
    throw new InvalidInputError(
      'Shared expense requires at least one participant',
    );
  }

  const base = Math.floor(totalAmount / participantIds.length);
  const extra = totalAmount % participantIds.length;
  const sortedIds = [...participantIds].sort();
  const shares = new Map<string, number>();

  sortedIds.forEach((memberId, index) => {
    shares.set(memberId, base + (index < extra ? 1 : 0));
  });

  return shares;
}

function resolvePercentageShares(
  totalAmount: number,
  shares: { memberId: string; percent: number }[],
): ResolvedShares {
  if (shares.length === 0) {
    throw new InvalidInputError(
      'Percentage split requires at least one participant',
    );
  }

  const percentSum = shares.reduce((sum, share) => sum + share.percent, 0);
  if (percentSum !== 100) {
    throw new InvalidInputError(
      `Percentage shares must sum to 100 (got ${percentSum})`,
    );
  }

  const resolved = new Map<string, number>();
  const remainders: { memberId: string; remainder: number }[] = [];

  for (const share of shares) {
    const exact = (totalAmount * share.percent) / 100;
    const floored = Math.floor(exact);
    resolved.set(share.memberId, floored);
    remainders.push({
      memberId: share.memberId,
      remainder: exact - floored,
    });
  }

  return distributeRemainder(resolved, totalAmount, remainders);
}

function resolveExactShares(
  totalAmount: number,
  shares: { memberId: string; shareOwed: number }[],
): ResolvedShares {
  if (shares.length === 0) {
    throw new InvalidInputError(
      'Exact split requires at least one participant',
    );
  }

  const resolved = new Map<string, number>();
  let sum = 0;

  for (const share of shares) {
    if (share.shareOwed < 0) {
      throw new InvalidInputError('Share amounts must be non-negative');
    }
    resolved.set(share.memberId, share.shareOwed);
    sum += share.shareOwed;
  }

  if (sum !== totalAmount) {
    throw new InvalidInputError(
      `Exact shares must sum to total amount (got ${sum}, expected ${totalAmount})`,
    );
  }

  return resolved;
}

function resolveWeightedShares(
  totalAmount: number,
  shares: { memberId: string; weight: number }[],
): ResolvedShares {
  if (shares.length === 0) {
    throw new InvalidInputError(
      'Shares split requires at least one participant',
    );
  }

  const totalWeight = shares.reduce((sum, share) => sum + share.weight, 0);
  if (totalWeight <= 0) {
    throw new InvalidInputError('Share weights must sum to a positive value');
  }

  const resolved = new Map<string, number>();
  const remainders: { memberId: string; remainder: number }[] = [];

  for (const share of shares) {
    if (share.weight < 0) {
      throw new InvalidInputError('Share weights must be non-negative');
    }
    const exact = (totalAmount * share.weight) / totalWeight;
    const floored = Math.floor(exact);
    resolved.set(share.memberId, floored);
    remainders.push({
      memberId: share.memberId,
      remainder: exact - floored,
    });
  }

  return distributeRemainder(resolved, totalAmount, remainders);
}

export function resolveShares(input: SharedExpenseInput): ResolvedShares {
  const { totalAmount, split } = input;

  if (totalAmount <= 0) {
    throw new InvalidInputError('Total amount must be positive');
  }

  switch (split.method) {
    case 'EQUAL':
      return resolveEqualShares(totalAmount, split.participantIds);
    case 'PERCENTAGE':
      return resolvePercentageShares(totalAmount, split.shares);
    case 'EXACT':
    case 'CUSTOM':
      return resolveExactShares(totalAmount, split.shares);
    case 'SHARES':
      return resolveWeightedShares(totalAmount, split.shares);
    default: {
      const exhaustive: never = split;
      throw new InvalidInputError(
        `Unsupported split method: ${String(exhaustive)}`,
      );
    }
  }
}
