import { describe, expect, it } from 'vitest';
import {
  categoryIcon,
  eventTypeLabel,
  formatAmount,
  formatBalance,
  formatDate,
  getInitials,
} from '@/lib/utils';

describe('formatAmount', () => {
  it('formats whole minor units as LKR without decimals', () => {
    expect(formatAmount(84200)).toBe('Rs 842');
  });

  it('formats 0 as Rs 0', () => {
    expect(formatAmount(0)).toBe('Rs 0');
  });

  it('keeps 2 decimals when not a whole number', () => {
    expect(formatAmount(84250)).toBe('Rs 842.50');
  });

  it('uses the passed currency as a prefix for non-LKR', () => {
    expect(formatAmount(1000, 'USD')).toBe('USD 10.00');
  });
});

describe('formatBalance', () => {
  it('prefixes positive balances with + Rs', () => {
    expect(formatBalance(5000)).toBe('+ Rs 50');
  });

  it('prefixes negative balances with − Rs', () => {
    expect(formatBalance(-5000)).toBe('− Rs 50');
  });

  it('uses neutral + Rs for zero', () => {
    expect(formatBalance(0)).toBe('+ Rs 0');
  });

  it('keeps decimals when not whole', () => {
    expect(formatBalance(-12345)).toBe('− Rs 123.45');
  });
});

describe('getInitials', () => {
  it('returns up to 2 initials from a full name', () => {
    expect(getInitials('Hirushikanth Manamperi')).toBe('HM');
  });

  it('handles a single name', () => {
    expect(getInitials('Alice')).toBe('A');
  });

  it('handles empty strings', () => {
    expect(getInitials('')).toBe('');
  });
});

describe('formatDate', () => {
  it('labels today', () => {
    expect(formatDate(new Date().toISOString())).toBe('Today');
  });

  it('labels yesterday', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(formatDate(yesterday.toISOString())).toBe('Yesterday');
  });

  it('labels days within the last week', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(formatDate(threeDaysAgo.toISOString())).toBe('3 days ago');
  });

  it('falls back to a short date beyond a week', () => {
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = formatDate(longAgo.toISOString());
    expect(result).toMatch(/^\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/);
  });
});

describe('eventTypeLabel', () => {
  it('maps known event types', () => {
    expect(eventTypeLabel('SHARED_EXPENSE')).toBe('Shared expense');
    expect(eventTypeLabel('LOAN')).toBe('Loan');
    expect(eventTypeLabel('REPAYMENT')).toBe('Repayment');
    expect(eventTypeLabel('SETTLEMENT')).toBe('Settlement');
    expect(eventTypeLabel('REFUND')).toBe('Refund');
    expect(eventTypeLabel('ADJUSTMENT')).toBe('Adjustment');
  });

  it('falls back to the raw type', () => {
    expect(eventTypeLabel('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('categoryIcon', () => {
  it('maps known categories to emoji', () => {
    expect(categoryIcon('food')).toBe('🍽');
    expect(categoryIcon('transport')).toBe('🚕');
    expect(categoryIcon('travel')).toBe('✈️');
    expect(categoryIcon('shopping')).toBe('🛒');
  });

  it('falls back to the default icon', () => {
    expect(categoryIcon('space-whale')).toBe('💳');
    expect(categoryIcon(null)).toBe('💳');
    expect(categoryIcon(undefined)).toBe('💳');
  });
});
