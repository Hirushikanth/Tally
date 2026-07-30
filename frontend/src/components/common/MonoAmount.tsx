import { formatAmount, formatBalance } from '@/lib/utils';

interface MonoAmountProps {
  /** Amount in minor units (e.g. 84200 = Rs 842.00) */
  value: number;
  /** When true, treats as a signed balance and applies green/red coloring */
  asBalance?: boolean;
  /** CSS class override */
  className?: string;
  /** Font size override */
  size?: string;
  currency?: string;
}

export function MonoAmount({
  value,
  asBalance = false,
  className,
  size,
  currency = 'LKR',
}: MonoAmountProps) {
  if (asBalance) {
    const colorClass = value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
    return (
      <span
        className={`mono-amount ${colorClass} ${className ?? ''}`}
        style={size ? { fontSize: size } : undefined}
      >
        {formatBalance(value)}
      </span>
    );
  }

  return (
    <span
      className={`mono-amount ${className ?? ''}`}
      style={size ? { fontSize: size } : undefined}
    >
      {formatAmount(value, currency)}
    </span>
  );
}
