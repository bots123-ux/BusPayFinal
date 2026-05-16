/**
 * ticketService.ts
 * Secure ticket operations — payment confirmation goes through
 * the confirm_ticket_payment SECURITY DEFINER function.
 * NEVER call supabase.from('ticket').update({ status: 'paid' }) directly.
 * NEVER call supabase.from('payments').update() directly.
 */
import { supabase } from './supabase'; // adjust path to match your project

/**
 * Confirm a ticket payment server-side.
 * This function validates ownership, checks amount matches ticket price,
 * inserts payment record, updates ticket status, and creates a notification
 * — all atomically in the database.
 */
export async function confirmTicketPayment(
  ticketId: string,
  paymentMethod: 'gcash' | 'wallet' | 'card',
  amount: number
): Promise<boolean> {
  const { data, error } = await supabase.rpc('confirm_ticket_payment', {
    p_ticket_id: ticketId,
    p_payment_method: paymentMethod,
    p_amount: amount,
  });

  if (error) {
    console.error('confirmTicketPayment error:', error.message);
    throw new Error(error.message);
  }

  return data as boolean;
}

/**
 * Get occupied seat numbers for a trip (secure — only seat numbers, no private data).
 * Use this instead of querying the ticket table directly for occupancy.
 */
export async function getOccupiedSeats(tripId: string): Promise<number[]> {
  const { data, error } = await supabase.rpc('get_trip_occupied_seats', {
    p_trip_id: tripId,
  });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row: { seat_number: number }) => row.seat_number);
}

/**
 * Get current user's tickets.
 */
export async function getMyTickets(userId: string) {
  const { data, error } = await supabase
    .from('ticket')
    .select(`
      id, seat_number, qr_code, qr_expires_at, price_php, status, created_at,
      trip:trip_id (
        travel_date, departure_time,
        route:route_id (origin, destination),
        bus:bus_id (plate_number, model)
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Validate a QR code (returns valid/invalid + reason).
 */
export async function validateTicketQr(qrCode: string): Promise<{
  valid: boolean;
  reason?: string;
  ticket_id?: string;
  status?: string;
}> {
  const { data, error } = await supabase.rpc('validate_ticket_qr', {
    p_qr_code: qrCode,
  });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Check if a QR code is expired based on qr_expires_at.
 */
export function isQrExpired(qrExpiresAt: string | null): boolean {
  if (!qrExpiresAt) return false;
  return new Date(qrExpiresAt) < new Date();
}
