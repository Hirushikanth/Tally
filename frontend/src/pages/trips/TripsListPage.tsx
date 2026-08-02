import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTrips, useCreateTrip } from '@/hooks/useTrips';
import { useUIStore } from '@/store/ui.store';
import { Button } from '@/components/common/Button';
import { GlassCard } from '@/components/common/GlassCard';
import { Modal } from '@/components/common/Modal';
import { QueryErrorState } from '@/components/common/QueryErrorState';
import { getApiErrorMessage } from '@/api/errors';
import { formatDate } from '@/lib/utils';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { Trip } from '@/api/types';
import './TripsListPage.css';

const newTripSchema = z.object({
  name: z.string().min(2, 'Trip name required').max(100),
  description: z.string().max(500).optional(),
  currency: z.string().optional(),
});

type NewTripForm = z.infer<typeof newTripSchema>;

export function TripsListPage() {
  useDocumentTitle('Your Trips');
  const navigate = useNavigate();
  const { data: trips, isLoading, isError, refetch } = useTrips();
  const createTrip = useCreateTrip();
  const newTripModalOpen = useUIStore((s) => s.newTripModalOpen);
  const setNewTripModalOpen = useUIStore((s) => s.setNewTripModalOpen);
  const addToast = useUIStore((s) => s.addToast);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewTripForm>({ resolver: zodResolver(newTripSchema) });

  const onCreateTrip = async (data: NewTripForm) => {
    try {
      const trip = await createTrip.mutateAsync({
        name: data.name,
        description: data.description,
        currency: data.currency || 'LKR',
      });
      reset();
      setNewTripModalOpen(false);
      addToast({ message: `Trip "${trip.name}" created!`, type: 'success' });
      navigate(`/trips/${trip.id}`);
    } catch (err) {
      addToast({
        message: getApiErrorMessage(err, 'Failed to create trip'),
        type: 'error',
      });
    }
  };

  const activeTrips = trips?.filter((t) => t.status === 'ACTIVE') ?? [];
  const archivedTrips = trips?.filter((t) => t.status !== 'ACTIVE') ?? [];

  return (
    <div className="trips-list-page">
      <div className="trips-list-header">
        <div>
          <h1 className="trips-list-title">Your Trips</h1>
          <p className="trips-list-sub">Manage group expenses across all your adventures</p>
        </div>
        <Button variant="primary" onClick={() => setNewTripModalOpen(true)}>
          + New trip
        </Button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <div className="spinner spinner-lg" />
        </div>
      ) : isError ? (
        <QueryErrorState
          message="We could not load your trips. Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : activeTrips.length === 0 && archivedTrips.length === 0 ? (
        <div className="empty-state glass" style={{ margin: '40px 0', borderRadius: 16, padding: '80px 40px' }}>
          <div className="empty-state-icon" aria-hidden="true">🗺️</div>
          <div className="empty-state-title">No trips yet</div>
          <div className="empty-state-desc">
            Create your first trip to start tracking group expenses together.
          </div>
          <Button variant="primary" onClick={() => setNewTripModalOpen(true)}>
            + Create your first trip
          </Button>
        </div>
      ) : (
        <div>
          {activeTrips.length > 0 && (
            <section className="trips-section">
              <div className="trips-section-label">Active trips</div>
              <div className="trips-grid">
                {activeTrips.map((trip, idx) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    index={idx}
                    onClick={() => navigate(`/trips/${trip.id}`)}
                  />
                ))}
              </div>
            </section>
          )}
          {archivedTrips.length > 0 && (
            <section className="trips-section">
              <div className="trips-section-label">Archived</div>
              <div className="trips-grid">
                {archivedTrips.map((trip, idx) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    index={idx}
                    onClick={() => navigate(`/trips/${trip.id}`)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* New trip modal */}
      <Modal
        open={newTripModalOpen}
        onClose={() => setNewTripModalOpen(false)}
        title="New trip"
      >
        <form
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              onSubmit={handleSubmit(onCreateTrip)}
              noValidate
            >
              <div className="form-group">
                <label className="form-label" htmlFor="trip-name">
                  Trip name
                </label>
                <input
                  id="trip-name"
                  className={`form-input ${errors.name ? 'error' : ''}`}
                  placeholder="e.g. Kandy → Ella"
                  {...register('name')}
                />
                {errors.name && (
                  <span className="form-error">{errors.name.message}</span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="trip-desc">
                  Description <span style={{ color: 'var(--text-low)' }}>(optional)</span>
                </label>
                <input
                  id="trip-desc"
                  className="form-input"
                  placeholder="A quick description"
                  {...register('description')}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="trip-currency">
                  Currency
                </label>
                <select
                  id="trip-currency"
                  className="form-select"
                  {...register('currency')}
                  defaultValue="LKR"
                >
                  <option value="LKR">LKR — Sri Lankan Rupee</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="JPY">JPY — Japanese Yen</option>
                  <option value="IDR">IDR — Indonesian Rupiah</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <Button
                  variant="ghost"
                  fullWidth
                  onClick={() => { setNewTripModalOpen(false); reset(); }}
                  type="button"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  fullWidth
                  loading={isSubmitting}
                  type="submit"
                >
                  Create trip
                </Button>
              </div>
            </form>
      </Modal>
    </div>
  );
}

function TripCard({
  trip,
  index,
  onClick,
}: {
  trip: Trip;
  index: number;
  onClick: () => void;
}) {
  const memberCount = trip.members.length;
  const eventCount = trip._count?.businessEvents ?? 0;

  return (
    <div
      className="enter-fade-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <GlassCard className="trip-card" onClick={onClick}>
        <div className="trip-card-status">
          <span className={`badge ${trip.status === 'ACTIVE' ? 'badge-green' : ''}`}>
            {trip.status === 'ACTIVE' ? 'Active' : trip.status === 'ARCHIVED' ? 'Archived' : 'Settled'}
          </span>
          <span className="trip-card-currency badge">{trip.currency}</span>
        </div>
        <h3 className="trip-card-name">{trip.name}</h3>
        {trip.description && (
          <p className="trip-card-desc">{trip.description}</p>
        )}
        <div className="trip-card-meta">
          <span>{memberCount} traveler{memberCount !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>{eventCount} expense{eventCount !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>{formatDate(trip.createdAt)}</span>
        </div>
      </GlassCard>
    </div>
  );
}
