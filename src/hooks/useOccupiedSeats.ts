/**
 * useOccupiedSeats.ts
 * Drop-in replacement for any hook that previously queried
 * the ticket table directly for seat occupancy.
 *
 * BEFORE (insecure — exposes all ticket data to all users):
 *   supabase.from('ticket').select('seat_number').eq('trip_id', tripId)
 *
 * AFTER (secure — uses get_trip_occupied_seats function):
 *   import { useOccupiedSeats } from '@/hooks/useOccupiedSeats'
 */
import { useEffect, useState } from 'react';
import { getOccupiedSeats } from '@/lib/ticketService'; // adjust path if needed

export function useOccupiedSeats(tripId: string | null) {
  const [occupiedSeats, setOccupiedSeats] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId) {
      setOccupiedSeats([]);
      return;
    }

    setLoading(true);
    setError(null);

    getOccupiedSeats(tripId)
      .then(setOccupiedSeats)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [tripId]);

  return { occupiedSeats, loading, error };
}
