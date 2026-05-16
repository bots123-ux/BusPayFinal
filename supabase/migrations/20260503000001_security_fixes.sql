-- ============================================================
-- BusPay Security & Bug Fix Migration
-- Applied: 2026-05-03
-- Fixes: #1 wallet auth, #2 ticket privacy, #3 ticket status,
--        #4 payment mutability, #5 tx amounts, #6 past trips,
--        #7 cancelled seats, #8 public→authenticated,
--        #9 passenger WITH CHECK, #10 dup index, #11 payments idx,
--        #12 routes active filter, #13 amount validation, #14 QR expiry
-- ============================================================

-- ── PASSENGER ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Passengers view own profile" ON public.passenger;
DROP POLICY IF EXISTS "Passengers insert own profile" ON public.passenger;
DROP POLICY IF EXISTS "Passengers update own profile" ON public.passenger;

CREATE POLICY "Passengers view own profile" ON public.passenger
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Passengers insert own profile" ON public.passenger
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Passengers update own profile" ON public.passenger
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── TICKET ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Tickets occupancy visible" ON public.ticket;
DROP POLICY IF EXISTS "Tickets owner select" ON public.ticket;
DROP POLICY IF EXISTS "Tickets owner insert" ON public.ticket;
DROP POLICY IF EXISTS "Tickets owner update" ON public.ticket;
DROP POLICY IF EXISTS "Tickets owner delete" ON public.ticket;

CREATE POLICY "Tickets owner select" ON public.ticket
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Tickets owner insert" ON public.ticket
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tickets owner update" ON public.ticket
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tickets owner delete" ON public.ticket
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Secure occupancy check (exposes seat numbers only, no private data)
CREATE OR REPLACE FUNCTION public.get_trip_occupied_seats(p_trip_id uuid)
RETURNS TABLE(seat_number integer)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.seat_number FROM public.ticket t
  WHERE t.trip_id = p_trip_id
    AND t.status NOT IN ('cancelled', 'expired');
$$;
REVOKE ALL ON FUNCTION public.get_trip_occupied_seats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trip_occupied_seats(uuid) TO authenticated;

-- ── PAYMENTS ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Payments owner select" ON public.payments;
DROP POLICY IF EXISTS "Payments owner insert" ON public.payments;
DROP POLICY IF EXISTS "Payments owner update" ON public.payments;

CREATE POLICY "Payments owner select" ON public.payments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Payments owner insert" ON public.payments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- NOTE: No UPDATE policy — payments are immutable to users

-- ── WALLET ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Wallet owner select" ON public.wallet;
DROP POLICY IF EXISTS "Wallet owner insert" ON public.wallet;
DROP POLICY IF EXISTS "Wallet owner update" ON public.wallet;

CREATE POLICY "Wallet owner select" ON public.wallet
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Wallet owner insert" ON public.wallet
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Wallet owner update" ON public.wallet
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── WALLET TRANSACTIONS ──────────────────────────────────────
DROP POLICY IF EXISTS "WTX owner select" ON public.wallet_transactions;
DROP POLICY IF EXISTS "WTX owner insert" ON public.wallet_transactions;

CREATE POLICY "WTX owner select" ON public.wallet_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- NOTE: No direct INSERT — only via deduct_wallet / topup_wallet functions

-- ── NOTIFICATIONS ────────────────────────────────────────────
DROP POLICY IF EXISTS "Notif owner select" ON public.notifications;
DROP POLICY IF EXISTS "Notif owner insert" ON public.notifications;
DROP POLICY IF EXISTS "Notif owner update" ON public.notifications;
DROP POLICY IF EXISTS "Notif owner delete" ON public.notifications;

CREATE POLICY "Notif owner select" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Notif owner insert" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Notif owner update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Notif owner delete" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── ROUTES ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Routes readable to authenticated" ON public.routes;
CREATE POLICY "Routes readable to authenticated" ON public.routes
  FOR SELECT TO authenticated USING (active = true);

-- ── TRIPS (block past dates) ─────────────────────────────────
DROP POLICY IF EXISTS "Trips readable to authenticated" ON public.trips;
CREATE POLICY "Trips readable to authenticated" ON public.trips
  FOR SELECT TO authenticated USING (travel_date >= CURRENT_DATE);

-- ── DEDUCT WALLET (auth check + positive amounts) ────────────
CREATE OR REPLACE FUNCTION public.deduct_wallet(p_user_id uuid, p_amount numeric, p_description text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_balance NUMERIC;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot deduct from another user''s wallet';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: must be greater than zero';
  END IF;
  SELECT balance_php INTO v_balance FROM public.wallet WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_amount THEN RETURN FALSE; END IF;
  UPDATE public.wallet SET balance_php = balance_php - p_amount, updated_at = now()
  WHERE user_id = p_user_id;
  INSERT INTO public.wallet_transactions (user_id, type, amount_php, description)
  VALUES (p_user_id, 'payment', p_amount, p_description);
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.deduct_wallet(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_wallet(uuid, numeric, text) TO authenticated;

-- ── TOPUP WALLET ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.topup_wallet(p_user_id uuid, p_amount numeric, p_description text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot top up another user''s wallet';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: must be greater than zero';
  END IF;
  UPDATE public.wallet SET balance_php = balance_php + p_amount, updated_at = now()
  WHERE user_id = p_user_id;
  INSERT INTO public.wallet_transactions (user_id, type, amount_php, description)
  VALUES (p_user_id, 'topup', p_amount, p_description);
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.topup_wallet(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.topup_wallet(uuid, numeric, text) TO authenticated;

-- ── CONFIRM TICKET PAYMENT (server-side only) ─────────────────
CREATE OR REPLACE FUNCTION public.confirm_ticket_payment(
  p_ticket_id uuid, p_payment_method text, p_amount numeric
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_ticket public.ticket%ROWTYPE;
BEGIN
  SELECT * INTO v_ticket FROM public.ticket
  WHERE id = p_ticket_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found or not owned by caller'; END IF;
  IF v_ticket.status <> 'pending' THEN
    RAISE EXCEPTION 'Ticket is not in pending state (current: %)', v_ticket.status;
  END IF;
  IF p_amount <> v_ticket.price_php THEN
    RAISE EXCEPTION 'Payment amount (%) does not match ticket price (%)', p_amount, v_ticket.price_php;
  END IF;
  INSERT INTO public.payments (user_id, ticket_id, amount_php, method, status)
  VALUES (auth.uid(), p_ticket_id, p_amount, p_payment_method::payment_method, 'completed');
  UPDATE public.ticket SET status = 'paid', updated_at = now() WHERE id = p_ticket_id;
  INSERT INTO public.notifications (user_id, title, body, type)
  VALUES (auth.uid(), 'Booking Confirmed',
          'Your ticket has been confirmed. Check My Tickets for your QR code.', 'booking');
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_ticket_payment(uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_ticket_payment(uuid, text, numeric) TO authenticated;

-- ── QR EXPIRY COLUMN ─────────────────────────────────────────
ALTER TABLE public.ticket ADD COLUMN IF NOT EXISTS qr_expires_at timestamptz;

UPDATE public.ticket t
SET qr_expires_at = (
  SELECT (tr.travel_date + tr.departure_time)::timestamptz + interval '2 hours'
  FROM public.trips tr WHERE tr.id = t.trip_id
)
WHERE qr_expires_at IS NULL;

CREATE OR REPLACE FUNCTION public.validate_ticket_qr(p_qr_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE v_ticket public.ticket%ROWTYPE;
BEGIN
  SELECT * INTO v_ticket FROM public.ticket WHERE qr_code = p_qr_code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'QR code not found');
  END IF;
  IF v_ticket.qr_expires_at IS NOT NULL AND v_ticket.qr_expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'QR code has expired');
  END IF;
  IF v_ticket.status NOT IN ('paid', 'used') THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Ticket status: ' || v_ticket.status);
  END IF;
  RETURN jsonb_build_object('valid', true, 'ticket_id', v_ticket.id, 'status', v_ticket.status);
END;
$$;
REVOKE ALL ON FUNCTION public.validate_ticket_qr(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_ticket_qr(text) TO authenticated;

-- ── INDEXES ───────────────────────────────────────────────────
-- Remove cancelled/expired tickets from the seat uniqueness constraint
ALTER TABLE public.ticket DROP CONSTRAINT IF EXISTS ticket_trip_id_seat_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS ticket_active_seat_unique
  ON public.ticket (trip_id, seat_number)
  WHERE status NOT IN ('cancelled', 'expired');

DROP INDEX IF EXISTS public.idx_wtx_user; -- duplicate of idx_wallet_tx_user_date

CREATE INDEX IF NOT EXISTS idx_payments_ticket ON public.payments (ticket_id);
