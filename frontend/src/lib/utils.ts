/**
 * Format a minor-unit integer amount to display currency.
 * Backend stores amounts in minor units (e.g. 84200 = Rs 842.00 for LKR).
 * LKR uses 2 decimal places; we display without paise for cleanliness.
 */
export function formatAmount(minorUnits: number, currency = 'LKR'): string {
  const major = minorUnits / 100;
  // For LKR, show as "Rs X,XXX" with no decimals if whole number
  if (currency === 'LKR') {
    if (Number.isInteger(major)) {
      return `Rs ${major.toLocaleString('en-IN')}`;
    }
    return `Rs ${major.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  // Generic fallback
  return `${currency} ${major.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

/**
 * Format a minor-unit balance with sign prefix and no currency symbol.
 * Used in balance displays where color provides the sign context.
 */
export function formatBalance(minorUnits: number): string {
  const major = Math.abs(minorUnits) / 100;
  const prefix = minorUnits >= 0 ? '+ Rs ' : '− Rs ';
  if (Number.isInteger(major)) {
    return `${prefix}${major.toLocaleString('en-IN')}`;
  }
  return `${prefix}${major.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Get initials from a name (up to 2 characters).
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Format a date string to a human-readable relative time or short date.
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Map a BusinessEventType to a display label.
 */
export function eventTypeLabel(type: string): string {
  const map: Record<string, string> = {
    SHARED_EXPENSE: 'Shared expense',
    LOAN: 'Loan',
    REPAYMENT: 'Repayment',
    SETTLEMENT: 'Settlement',
    REFUND: 'Refund',
    ADJUSTMENT: 'Adjustment',
  };
  return map[type] ?? type;
}

/**
 * Map a category string to an emoji icon.
 */
export function categoryIcon(category: string | null | undefined): string {
  const map: Record<string, string> = {
    food: '🍽',
    Food: '🍽',
    restaurant: '🍽',
    Restaurant: '🍽',
    transport: '🚕',
    Transport: '🚕',
    travel: '✈️',
    Travel: '✈️',
    stay: '🏨',
    Stay: '🏨',
    hotel: '🏨',
    Hotel: '🏨',
    accommodation: '🏨',
    Accommodation: '🏨',
    activities: '🎯',
    Activities: '🎯',
    shopping: '🛒',
    Shopping: '🛒',
    misc: '📌',
    Misc: '📌',
    other: '📌',
    Other: '📌',
  };
  return map[category ?? ''] ?? '💳';
}
