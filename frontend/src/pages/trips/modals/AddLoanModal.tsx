import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateLoan } from '@/hooks/useEvents';
import { useUIStore } from '@/store/ui.store';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import type { TripMember } from '@/api/types';
import './Modals.css';

const schema = z
  .object({
    lenderMemberId: z.string().min(1, 'Select who lent the money'),
    borrowerMemberId: z.string().min(1, 'Select who borrowed the money'),
    amount: z
      .number({ invalid_type_error: 'Enter a valid amount' })
      .positive('Amount must be positive'),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => data.lenderMemberId !== data.borrowerMemberId, {
    message: 'The lender and borrower must be different people',
    path: ['borrowerMemberId'],
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

export function AddLoanModal({ open, tripId, members, currency, currentMemberId, onClose }: Props) {
  const createLoan = useCreateLoan(tripId);
  const addToast = useUIStore((s) => s.addToast);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      lenderMemberId: currentMemberId,
      borrowerMemberId: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await createLoan.mutateAsync({
        lenderMemberId: data.lenderMemberId,
        borrowerMemberId: data.borrowerMemberId,
        amount: Math.round(data.amount * 100),
        notes: data.notes || undefined,
      });
      addToast({ message: 'Loan recorded!', type: 'success' });
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      addToast({ message: msg ?? 'Failed to record loan', type: 'error' });
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-header">
          <h2 className="modal-title">Record a loan</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="loan-lender">
              Who lent the money
            </label>
            <select
              id="loan-lender"
              className="form-select"
              {...register('lenderMemberId')}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
            {errors.lenderMemberId && (
              <span className="form-error">{errors.lenderMemberId.message}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="loan-borrower">
              Who borrowed
            </label>
            <select
              id="loan-borrower"
              className="form-select"
              {...register('borrowerMemberId')}
            >
              <option value="">Select borrower</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
            {errors.borrowerMemberId && (
              <span className="form-error">{errors.borrowerMemberId.message}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="loan-amount">
              Amount ({currency})
            </label>
            <div className="amount-input-wrap">
              <span className="amount-prefix">Rs</span>
              <input
                id="loan-amount"
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
            <label className="form-label" htmlFor="loan-notes">
              Description <span style={{ color: 'var(--text-low)' }}>(optional)</span>
            </label>
            <input
              id="loan-notes"
              className="form-input"
              placeholder="e.g. Borrowed for the fuel run"
              {...register('notes')}
            />
          </div>

          <div className="modal-actions">
            <Button variant="ghost" fullWidth onClick={onClose} type="button">
              Cancel
            </Button>
            <Button variant="primary" fullWidth loading={isSubmitting} type="submit">
              Record loan
            </Button>
          </div>
        </form>
    </Modal>
  );
}
