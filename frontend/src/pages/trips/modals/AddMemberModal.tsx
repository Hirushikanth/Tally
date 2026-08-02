import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAddMember } from '@/hooks/useMembers';
import { useUIStore } from '@/store/ui.store';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { getApiErrorMessage } from '@/api/errors';
import './Modals.css';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  role: z.enum(['MEMBER', 'ADMIN', 'VIEWER']).optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  tripId: string;
  onClose: () => void;
}

export function AddMemberModal({ open, tripId, onClose }: Props) {
  const addMember = useAddMember(tripId);
  const addToast = useUIStore((s) => s.addToast);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'MEMBER' },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await addMember.mutateAsync({ email: data.email, role: data.role });
      addToast({ message: `${data.email} added to trip!`, type: 'success' });
      onClose();
    } catch (err) {
      addToast({
        message: getApiErrorMessage(err, 'Could not add member'),
        type: 'error',
      });
    }
  };

  return (
    <Modal open={open} onClose={onClose} panelStyle={{ maxWidth: 400 }}>
      <div className="modal-header">
        <h2 className="modal-title">Add member</h2>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>
      <form className="modal-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="member-email">
              Email address
            </label>
            <input
              id="member-email"
              type="email"
              className={`form-input ${errors.email ? 'error' : ''}`}
              placeholder="friend@example.com"
              autoComplete="off"
              {...register('email')}
            />
            {errors.email && (
              <span className="form-error">{errors.email.message}</span>
            )}
            <span style={{ fontSize: 12, color: 'var(--text-low)', marginTop: 4 }}>
              They must already have a Tally account.
            </span>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="member-role">Role</label>
            <select id="member-role" className="form-select" {...register('role')}>
              <option value="VIEWER">Viewer — read only</option>
              <option value="MEMBER">Member — can add expenses</option>
              <option value="ADMIN">Admin — can add members</option>
            </select>
          </div>
          <div className="modal-actions">
            <Button variant="ghost" fullWidth onClick={onClose} type="button">
              Cancel
            </Button>
            <Button variant="primary" fullWidth loading={isSubmitting} type="submit">
              Add member
            </Button>
          </div>
        </form>
    </Modal>
  );
}
