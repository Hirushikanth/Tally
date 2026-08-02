import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateCashMovement } from '@/hooks/useEvents';
import { useUIStore } from '@/store/ui.store';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { getApiErrorMessage } from '@/api/errors';
import type { TripMember } from '@/api/types';
import './Modals.css';

const schema = z
  .object({
    cashPayerMemberId: z.string().min(1, 'Select who paid'),
    cashReceiverMemberId: z.string().min(1, 'Select who received'),
    amount: z
      .number({ invalid_type_error: 'Enter a valid amount' })
      .positive('Amount must be positive'),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => data.cashPayerMemberId !== data.cashReceiverMemberId, {
    message: 'Payer and receiver must be different people',
    path: ['cashReceiverMemberId'],
  });

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  tripId: string;
  members: TripMember[];
  currency: string;
  currentMemberId: string;
  onClose: () => void;
}

export function AddCashMovementModal({
  open,
  tripId,
  members,
  currency,
  currentMemberId,
  onClose,
}: Props) {
  const createCashMovement = useCreateCashMovement(tripId);
  const addToast = useUIStore((s) => s.addToast);
  const [type, setType] = useState<'REPAYMENT' | 'SETTLEMENT'>('SETTLEMENT');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      cashPayerMemberId: currentMemberId,
      cashReceiverMemberId: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await createCashMovement.mutateAsync({
        cashPayerMemberId: data.cashPayerMemberId,
        cashReceiverMemberId: data.cashReceiverMemberId,
        amount: Math.round(data.amount * 100),
        type,
        notes: data.notes || undefined,
      });
      addToast({
        message: type === 'REPAYMENT' ? 'Repayment recorded!' : 'Settlement recorded!',
        type: 'success',
      });
      onClose();
    } catch (err) {
      addToast({
        message: getApiErrorMessage(err, 'Failed to record payment'),
        type: 'error',
      });
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-header">
          <h2 className="modal-title">Record a payment</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Type toggle — one shared form, label-only difference */}
          <div className="form-group">
            <div className="form-label" style={{ marginBottom: 10 }}>
              What kind of payment
            </div>
            <div className="split-tabs">
              <button
                type="button"
                className={`split-tab ${type === 'SETTLEMENT' ? 'active' : ''}`}
                onClick={() => setType('SETTLEMENT')}
              >
                Settle up
              </button>
              <button
                type="button"
                className={`split-tab ${type === 'REPAYMENT' ? 'active' : ''}`}
                onClick={() => setType('REPAYMENT')}
              >
                Repay a debt
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="cash-payer">
              Who paid
            </label>
            <select
              id="cash-payer"
              className="form-select"
              {...register('cashPayerMemberId')}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
            {errors.cashPayerMemberId && (
              <span className="form-error">{errors.cashPayerMemberId.message}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="cash-receiver">
              Who received
            </label>
            <select
              id="cash-receiver"
              className="form-select"
              {...register('cashReceiverMemberId')}
            >
              <option value="">Select receiver</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
            {errors.cashReceiverMemberId && (
              <span className="form-error">{errors.cashReceiverMemberId.message}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="cash-amount">
              Amount ({currency})
            </label>
            <div className="amount-input-wrap">
              <span className="amount-prefix">Rs</span>
              <input
                id="cash-amount"
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

          <div className="form-group">
            <label className="form-label" htmlFor="cash-notes">
              Description <span style={{ color: 'var(--text-low)' }}>(optional)</span>
            </label>
            <input
              id="cash-notes"
              className="form-input"
              placeholder="e.g. Settled the hotel bill"
              {...register('notes')}
            />
          </div>

          <div className="modal-actions">
            <Button variant="ghost" fullWidth onClick={onClose} type="button">
              Cancel
            </Button>
            <Button variant="primary" fullWidth loading={isSubmitting} type="submit">
              Record payment
            </Button>
          </div>
        </form>
    </Modal>
  );
}
