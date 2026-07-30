import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateSharedExpense } from '@/hooks/useEvents';
import { useUIStore } from '@/store/ui.store';
import { Button } from '@/components/common/Button';
import { Avatar } from '@/components/common/Avatar';
import type { TripMember } from '@/api/types';
import './Modals.css';

const schema = z.object({
  amount: z.number({ invalid_type_error: 'Enter a valid amount' }).positive('Amount must be positive'),
  payerMemberId: z.string().min(1, 'Select who paid'),
  splitMethod: z.enum(['EQUAL', 'EXACT']),
  notes: z.string().max(500).optional(),
  category: z.string().max(100).optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  tripId: string;
  members: TripMember[];
  currency: string;
  currentMemberId: string;
  onClose: () => void;
}

export function AddExpenseModal({ tripId, members, currency, currentMemberId, onClose }: Props) {
  const createExpense = useCreateSharedExpense(tripId);
  const addToast = useUIStore((s) => s.addToast);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
    members.map((m) => m.id),
  );

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      payerMemberId: currentMemberId,
      splitMethod: 'EQUAL',
    },
  });

  const splitMethod = watch('splitMethod');
  const amountValue = watch('amount');

  const toggleParticipant = (memberId: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    );
  };

  const onSubmit = async (data: FormData) => {
    if (selectedParticipants.length === 0) {
      addToast({ message: 'Select at least one participant', type: 'error' });
      return;
    }

    // Convert LKR major units to minor units (× 100)
    const amountMinor = Math.round(data.amount * 100);

    try {
      await createExpense.mutateAsync({
        amount: amountMinor,
        payers: [{ memberId: data.payerMemberId, amountPaid: amountMinor }],
        split: {
          method: 'EQUAL',
          participantIds: selectedParticipants,
        },
        notes: data.notes || undefined,
        category: data.category || undefined,
      });
      addToast({ message: 'Expense added!', type: 'success' });
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      addToast({ message: msg ?? 'Failed to add expense', type: 'error' });
    }
  };

  const perPersonPreview =
    amountValue && selectedParticipants.length > 0
      ? (amountValue / selectedParticipants.length).toFixed(2)
      : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add expense</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

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

          {/* Paid by */}
          <div className="form-group">
            <label className="form-label" htmlFor="exp-payer">
              Paid by
            </label>
            <select
              id="exp-payer"
              className="form-select"
              {...register('payerMemberId')}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
            {errors.payerMemberId && (
              <span className="form-error">{errors.payerMemberId.message}</span>
            )}
          </div>

          {/* Split among */}
          <div className="form-group">
            <div className="form-label" style={{ marginBottom: 10 }}>
              Split among
            </div>
            <div className="participant-grid">
              {members.map((m) => {
                const selected = selectedParticipants.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`participant-chip ${selected ? 'selected' : ''}`}
                    onClick={() => toggleParticipant(m.id)}
                  >
                    <Avatar name={m.user.name} size="sm" />
                    <span>{m.user.name.split(' ')[0]}</span>
                    {selected && <span className="participant-check">✓</span>}
                  </button>
                );
              })}
            </div>
            {perPersonPreview && (
              <div className="split-preview">
                Rs {perPersonPreview} per person
                ({selectedParticipants.length} of {members.length})
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
      </div>
    </div>
  );
}
