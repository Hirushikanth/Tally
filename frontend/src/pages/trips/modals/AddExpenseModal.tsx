import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateSharedExpense } from '@/hooks/useEvents';
import { useUIStore } from '@/store/ui.store';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Avatar } from '@/components/common/Avatar';
import { getApiErrorMessage } from '@/api/errors';
import { formatAmount } from '@/lib/utils';
import type { SplitDto, SplitMethod, TripMember } from '@/api/types';
import './Modals.css';

const schema = z.object({
  amount: z
    .number({ invalid_type_error: 'Enter a valid amount' })
    .positive('Amount must be positive'),
  notes: z.string().max(500).optional(),
  category: z.string().max(100).optional(),
});

type FormData = z.infer<typeof schema>;

const SPLIT_METHODS: { value: SplitMethod; label: string }[] = [
  { value: 'EQUAL', label: 'Equal' },
  { value: 'PERCENTAGE', label: 'Percent' },
  { value: 'EXACT', label: 'Exact amount' },
  { value: 'SHARES', label: 'Shares' },
];

/** Parse a major-unit input string into minor units; NaN-safe. */
function parseMinor(value: string | undefined): number {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function parseFloatSafe(value: string | undefined): number {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? n : 0;
}

interface Props {
  open: boolean;
  tripId: string;
  members: TripMember[];
  currency: string;
  currentMemberId: string;
  onClose: () => void;
}

export function AddExpenseModal({
  open,
  tripId,
  members,
  currency,
  currentMemberId,
  onClose,
}: Props) {
  const createExpense = useCreateSharedExpense(tripId);
  const addToast = useUIStore((s) => s.addToast);

  // Who paid: memberId -> amount string in major units. Empty string = not a payer.
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>({
    [currentMemberId]: '',
  });

  const [splitMethod, setSplitMethod] = useState<SplitMethod>('EQUAL');
  const [participants, setParticipants] = useState<string[]>(members.map((m) => m.id));

  // Per-participant values keyed by memberId, as typed strings (major units / percents / weights)
  const [percentValues, setPercentValues] = useState<Record<string, string>>({});
  const [exactValues, setExactValues] = useState<Record<string, string>>({});
  const [shareValues, setShareValues] = useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const amountMajor = watch('amount');
  const amountMinor = parseMinor(amountMajor?.toString());

  const activePayers = useMemo(
    () => members.filter((m) => parseMinor(payerAmounts[m.id]) > 0),
    [members, payerAmounts],
  );

  const paidSumMinor = useMemo(
    () =>
      members.reduce(
        (sum, m) => sum + parseMinor(payerAmounts[m.id]),
        0,
      ),
    [members, payerAmounts],
  );

  const unallocatedMinor = amountMinor - paidSumMinor;

  const togglePayer = (memberId: string) => {
    setPayerAmounts((prev) => {
      const next = { ...prev };
      const current = parseMinor(prev[memberId]);
      if (current > 0) {
        next[memberId] = '';
        return next;
      }
      // Auto-fill the full amount when the first payer is selected
      const existingPayers = members.some(
        (m) => m.id !== memberId && parseMinor(prev[m.id]) > 0,
      );
      next[memberId] =
        !existingPayers && amountMinor > 0
          ? (amountMinor / 100).toFixed(2)
          : '';
      return next;
    });
  };

  const setPayerAmount = (memberId: string, value: string) => {
    setPayerAmounts((prev) => ({ ...prev, [memberId]: value }));
  };

  const toggleParticipant = (memberId: string) => {
    setParticipants((prev) => {
      const selected = prev.includes(memberId);
      const next = selected
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId];

      // Seed sensible defaults when a participant is added
      if (!selected) {
        setPercentValues((p) => {
          if (p[memberId] !== undefined) return p;
          return { ...p, [memberId]: String(Math.round(100 / next.length)) };
        });
        setShareValues((s) => (s[memberId] !== undefined ? s : { ...s, [memberId]: '1' }));
      }
      return next;
    });
  };

  const setSplitValue = (key: 'percent' | 'exact' | 'shares', memberId: string, value: string) => {
    if (key === 'percent') setPercentValues((p) => ({ ...p, [memberId]: value }));
    if (key === 'exact') setExactValues((e) => ({ ...e, [memberId]: value }));
    if (key === 'shares') setShareValues((s) => ({ ...s, [memberId]: value }));
  };

  const buildSplit = (): { ok: boolean; error?: string; split?: SplitDto } => {
    if (participants.length === 0) {
      return { ok: false, error: 'Select at least one person to split with' };
    }

    if (splitMethod === 'EQUAL') {
      return { ok: true, split: { method: 'EQUAL', participantIds: participants } };
    }

    if (splitMethod === 'PERCENTAGE') {
      const shares = participants.map((id) => ({
        memberId: id,
        percent: parseFloatSafe(percentValues[id]),
      }));
      if (shares.some((s) => !Number.isFinite(s.percent) || s.percent <= 0)) {
        return { ok: false, error: 'Every person needs a percentage above zero' };
      }
      const total = shares.reduce((sum, s) => sum + s.percent, 0);
      if (Math.abs(total - 100) > 0.01) {
        return { ok: false, error: `Percentages must add up to 100 (currently ${total})` };
      }
      return { ok: true, split: { method: 'PERCENTAGE', shares } };
    }

    if (splitMethod === 'SHARES') {
      const shares = participants.map((id) => ({
        memberId: id,
        weight: parseFloatSafe(shareValues[id]),
      }));
      if (shares.some((s) => !Number.isFinite(s.weight) || s.weight <= 0)) {
        return { ok: false, error: 'Every person needs a share weight above zero' };
      }
      return { ok: true, split: { method: 'SHARES', shares } };
    }

    // EXACT
    const shares = participants.map((id) => ({
      memberId: id,
      shareOwed: parseMinor(exactValues[id]),
    }));
    if (shares.some((s) => s.shareOwed <= 0)) {
      return { ok: false, error: 'Every person needs an amount above zero' };
    }
    const total = shares.reduce((sum, s) => sum + s.shareOwed, 0);
    if (total !== amountMinor) {
      return {
        ok: false,
        error: `Exact amounts must add up to the total (currently ${formatAmount(total, currency)})`,
      };
    }
    return { ok: true, split: { method: 'EXACT', shares } };
  };

  const perPersonMinor =
    amountMinor > 0 && participants.length > 0
      ? Math.floor(amountMinor / participants.length)
      : 0;

  const onSubmit = async (data: FormData) => {
    const total = parseMinor(data.amount?.toString());
    if (total <= 0) return;

    if (activePayers.length === 0) {
      addToast({ message: 'Select at least one person who paid', type: 'error' });
      return;
    }
    if (paidSumMinor !== total) {
      addToast({ message: 'Payer amounts must add up to the total', type: 'error' });
      return;
    }

    const splitResult = buildSplit();
    if (!splitResult.ok || !splitResult.split) {
      addToast({ message: splitResult.error ?? 'Invalid split', type: 'error' });
      return;
    }

    try {
      await createExpense.mutateAsync({
        amount: total,
        payers: activePayers.map((m) => ({
          memberId: m.id,
          amountPaid: parseMinor(payerAmounts[m.id]),
        })),
        split: splitResult.split,
        notes: data.notes || undefined,
        category: data.category || undefined,
      });
      addToast({ message: 'Expense added!', type: 'success' });
      onClose();
    } catch (err) {
      addToast({
        message: getApiErrorMessage(err, 'Failed to add expense'),
        type: 'error',
      });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add expense">
      <form className="modal-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Amount */}
          <div className="form-group">
            <label className="form-label" htmlFor="exp-amount">
              Amount ({currency})
            </label>
            <div className="amount-input-wrap">
              <span className="amount-prefix">Rs</span>
              <input
                id="exp-amount"
                type="number"
                step="0.01"
                min="0"
                className={`form-input form-input-mono ${errors.amount ? 'error' : ''}`}
                placeholder="0.00"
                style={{ paddingLeft: 40 }}
                {...register('amount', { valueAsNumber: true })}
              />
            </div>
            {errors.amount && (
              <span className="form-error">{errors.amount.message}</span>
            )}
          </div>

          {/* Notes */}
          <div className="form-group">
            <label className="form-label" htmlFor="exp-notes">
              Description
            </label>
            <input
              id="exp-notes"
              className="form-input"
              placeholder="e.g. Dinner at Slightly Chilled Lounge"
              {...register('notes')}
            />
          </div>

          {/* Category */}
          <div className="form-group">
            <label className="form-label" htmlFor="exp-category">
              Category <span style={{ color: 'var(--text-low)' }}>(optional)</span>
            </label>
            <select
              id="exp-category"
              className="form-select"
              {...register('category')}
            >
              <option value="">Select category</option>
              <option value="Food">🍽 Food</option>
              <option value="Transport">🚕 Transport</option>
              <option value="Stay">🏨 Stay</option>
              <option value="Activities">🎯 Activities</option>
              <option value="Shopping">🛒 Shopping</option>
              <option value="Misc">📌 Misc</option>
            </select>
          </div>

          {/* Who paid (multi-payer) */}
          <div className="form-group">
            <div className="form-label" style={{ marginBottom: 10 }}>
              Who paid
            </div>
            <div className="payer-list">
              {members.map((m) => {
                const isPayer = parseMinor(payerAmounts[m.id]) > 0;
                return (
                  <div key={m.id} className={`payer-row ${isPayer ? 'selected' : ''}`}>
                    <button
                      type="button"
                      className="payer-toggle"
                      onClick={() => togglePayer(m.id)}
                    >
                      <Avatar name={m.user.name} size="sm" />
                      <span>{m.user.name}</span>
                      <span className="payer-check" aria-hidden="true">{isPayer ? '✓' : ''}</span>
                    </button>
                    <div className="amount-input-wrap payer-amount">
                      <span className="amount-prefix">Rs</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-input form-input-mono payer-amount-input"
                        placeholder="0.00"
                        value={payerAmounts[m.id] ?? ''}
                        onChange={(e) => setPayerAmount(m.id, e.target.value)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {amountMinor > 0 && activePayers.length > 0 && (
              <div
                className={`split-preview ${
                  unallocatedMinor === 0 ? 'split-preview-ok' : 'split-preview-warn'
                }`}
              >
                {unallocatedMinor === 0
                  ? 'Payer amounts cover the full total ✓'
                  : unallocatedMinor > 0
                  ? `Unallocated: ${formatAmount(unallocatedMinor, currency)}`
                  : `Over by: ${formatAmount(-unallocatedMinor, currency)}`}
              </div>
            )}
          </div>

          {/* Split method */}
          <div className="form-group">
            <div className="form-label" style={{ marginBottom: 10 }}>
              Split method
            </div>
            <div className="split-tabs">
              {SPLIT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={`split-tab ${splitMethod === m.value ? 'active' : ''}`}
                  onClick={() => setSplitMethod(m.value)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Participants + per-person inputs */}
          <div className="form-group">
            <div className="form-label" style={{ marginBottom: 10 }}>
              Split among
            </div>
            <div className="participant-grid">
              {members.map((m) => {
                const selected = participants.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`participant-chip ${selected ? 'selected' : ''}`}
                    onClick={() => toggleParticipant(m.id)}
                  >
                    <Avatar name={m.user.name} size="sm" />
                    <span>{m.user.name.split(' ')[0]}</span>
                    {selected && (
                      <span className="participant-check" aria-hidden="true">✓</span>
                    )}
                  </button>
                );
              })}
            </div>

            {splitMethod === 'PERCENTAGE' && (
              <div className="split-input-list">
                {participants.map((id) => {
                  const m = members.find((mm) => mm.id === id);
                  if (!m) return null;
                  return (
                    <div key={id} className="split-input-row">
                      <span className="split-input-name">{m.user.name}</span>
                      <div className="split-input-field">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          className="form-input form-input-mono split-number-input"
                          placeholder="0"
                          value={percentValues[id] ?? ''}
                          onChange={(e) => setSplitValue('percent', id, e.target.value)}
                        />
                        <span className="split-input-unit">%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {splitMethod === 'EXACT' && (
              <div className="split-input-list">
                {participants.map((id) => {
                  const m = members.find((mm) => mm.id === id);
                  if (!m) return null;
                  return (
                    <div key={id} className="split-input-row">
                      <span className="split-input-name">{m.user.name}</span>
                      <div className="amount-input-wrap split-input-field">
                        <span className="amount-prefix">Rs</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-input form-input-mono split-number-input"
                          placeholder="0.00"
                          style={{ paddingLeft: 40 }}
                          value={exactValues[id] ?? ''}
                          onChange={(e) => setSplitValue('exact', id, e.target.value)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {splitMethod === 'SHARES' && (
              <div className="split-input-list">
                {participants.map((id) => {
                  const m = members.find((mm) => mm.id === id);
                  if (!m) return null;
                  return (
                    <div key={id} className="split-input-row">
                      <span className="split-input-name">{m.user.name}</span>
                      <div className="split-input-field">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          className="form-input form-input-mono split-number-input"
                          placeholder="1"
                          value={shareValues[id] ?? ''}
                          onChange={(e) => setSplitValue('shares', id, e.target.value)}
                        />
                        <span className="split-input-unit">×</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {splitMethod === 'EQUAL' && perPersonMinor > 0 && (
              <div className="split-preview">
                Rs {(perPersonMinor / 100).toFixed(2)} per person (
                {participants.length} of {members.length})
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="modal-actions">
            <Button variant="ghost" fullWidth onClick={onClose} type="button">
              Cancel
            </Button>
            <Button variant="primary" fullWidth loading={isSubmitting} type="submit">
              Add expense
            </Button>
          </div>
        </form>
    </Modal>
  );
}
