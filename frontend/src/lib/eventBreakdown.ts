import { formatAmount } from './utils';
import type { BusinessEvent, SplitDto } from '@/api/types';

/**
 * Per-member breakdown of a shared expense: what each person paid, what their
 * share is, and the resulting net posting (positive = should receive, negative
 * = owes). Preferred source is the persisted detail facts (event.metadata);
 * older events fall back to deriving from the Posting journal.
 */
export interface SplitSummary {
  method: string;
  subline: string;
  people: { memberId: string; paid: number; share: number; posting: number }[];
  derivedFromLedger: boolean;
}

export function buildBreakdown(event: BusinessEvent, currency: string): SplitSummary {
  if (event.type !== 'SHARED_EXPENSE') {
    return { method: '', subline: '', people: [], derivedFromLedger: false };
  }
  return breakdownFromMetadata(event, currency) ?? breakdownFromLedger(event);
}

function breakdownFromMetadata(
  event: BusinessEvent,
  currency: string,
): SplitSummary | null {
  const meta = event.metadata;
  if (!meta?.payers || !meta.split || meta.payers.length === 0) return null;

  const payers = new Map(meta.payers.map((p) => [p.memberId, p.amountPaid]));
  const shares = resolveShares(event.amount, meta.split);

  const memberIds = new Set<string>();
  for (const p of meta.payers) memberIds.add(p.memberId);
  for (const id of shares.keys()) memberIds.add(id);

  const people = [...memberIds].map((memberId) => {
    const paid = payers.get(memberId) ?? 0;
    const share = shares.get(memberId) ?? 0;
    return { memberId, paid, share, posting: paid - share };
  });

  return {
    ...splitLabel(event.amount, meta.split, currency),
    people,
    derivedFromLedger: false,
  };
}

function breakdownFromLedger(event: BusinessEvent): SplitSummary {
  const postings = event.postings ?? [];
  const people = postings
    .filter((p) => p.amount !== 0)
    .map((p) => ({ memberId: p.memberId, paid: 0, share: 0, posting: p.amount }));

  // Single-payer legacy event: the exact paid/share are recoverable —
  // the sole positive posting is the payer, their share is total − posting.
  const positives = postings.filter((p) => p.amount > 0);
  if (postings.length > 0 && positives.length === 1) {
    const payerId = positives[0]!.memberId;
    const payerPosting = positives[0]!.amount;
    return {
      method: 'Shared',
      subline: 'Single payer',
      people: people.map((row) =>
        row.memberId === payerId
          ? { ...row, paid: event.amount, share: event.amount - payerPosting }
          : { ...row, share: -row.posting },
      ),
      derivedFromLedger: true,
    };
  }

  return { method: 'Shared', subline: '', people, derivedFromLedger: true };
}

function splitLabel(
  total: number,
  split: SplitDto,
  currency: string,
): { method: string; subline: string } {
  switch (split.method) {
    case 'EQUAL':
      return {
        method: 'Split equally',
        subline: `${formatAmount(total / split.participantIds.length, currency)} each · ${
          split.participantIds.length
        } people`,
      };
    case 'PERCENTAGE':
      return { method: 'Split by percentage', subline: '' };
    case 'EXACT':
    case 'CUSTOM':
      return { method: 'Split by exact amounts', subline: '' };
    case 'SHARES':
      return { method: 'Split by shares', subline: '' };
  }
}

/** Re-solve shares exactly like the backend posting engine (remainder-aware). */
export function resolveShares(total: number, split: SplitDto): Map<string, number> {
  const result = new Map<string, number>();

  const distributeRemainder = (
    base: Map<string, number>,
    remainders: { memberId: string; remainder: number }[],
  ) => {
    let used = 0;
    for (const [, amount] of base) used += amount;
    let remaining = total - used;
    const sorted = [...remainders].sort(
      (a, b) => b.remainder - a.remainder || a.memberId.localeCompare(b.memberId),
    );
    for (const { memberId } of sorted) {
      if (remaining <= 0) break;
      base.set(memberId, (base.get(memberId) ?? 0) + 1);
      remaining -= 1;
    }
  };

  switch (split.method) {
    case 'EQUAL': {
      const ids = split.participantIds;
      if (ids.length === 0) return result;
      const base = Math.floor(total / ids.length);
      const extra = total % ids.length;
      [...ids].sort().forEach((id, i) => result.set(id, base + (i < extra ? 1 : 0)));
      break;
    }
    case 'PERCENTAGE': {
      const base = new Map<string, number>();
      const remainders: { memberId: string; remainder: number }[] = [];
      for (const s of split.shares) {
        const exact = (total * s.percent) / 100;
        base.set(s.memberId, Math.floor(exact));
        remainders.push({ memberId: s.memberId, remainder: exact - Math.floor(exact) });
      }
      distributeRemainder(base, remainders);
      base.forEach((v, k) => result.set(k, v));
      break;
    }
    case 'EXACT':
    case 'CUSTOM':
      for (const s of split.shares) result.set(s.memberId, s.shareOwed);
      break;
    case 'SHARES': {
      const totalWeight = split.shares.reduce((sum, s) => sum + s.weight, 0);
      if (totalWeight <= 0) return result;
      const base = new Map<string, number>();
      const remainders: { memberId: string; remainder: number }[] = [];
      for (const s of split.shares) {
        const exact = (total * s.weight) / totalWeight;
        base.set(s.memberId, Math.floor(exact));
        remainders.push({ memberId: s.memberId, remainder: exact - Math.floor(exact) });
      }
      distributeRemainder(base, remainders);
      base.forEach((v, k) => result.set(k, v));
      break;
    }
  }
  return result;
}
