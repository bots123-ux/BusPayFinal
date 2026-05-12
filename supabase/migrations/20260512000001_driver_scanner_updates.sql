-- Driver scanner: verify tickets, mark them used, and expose today's recent scans.

ALTER TABLE public.ticket ADD COLUMN IF NOT EXISTS qr_expires_at timestamptz;
ALTER TABLE public.ticket ADD COLUMN IF NOT EXISTS boarded_at timestamptz;

CREATE OR REPLACE FUNCTION public.driver_scan_qr(p_qr_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_allowed boolean := true;
  v_now timestamptz := now();
  v_ticket record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Please sign in to scan tickets');
  END IF;

  IF to_regprocedure('public.is_driver_or_admin()') IS NOT NULL THEN
    EXECUTE 'SELECT public.is_driver_or_admin()' INTO v_allowed;
    IF NOT COALESCE(v_allowed, false) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'This account is not authorized to scan tickets');
    END IF;
  END IF;

  SELECT
    t.id,
    t.status,
    t.qr_expires_at,
    t.seat_number,
    p.full_name AS passenger,
    tr.travel_date,
    tr.departure_time,
    r.origin,
    r.destination
  INTO v_ticket
  FROM public.ticket t
  LEFT JOIN public.passenger p ON p.user_id = t.user_id
  LEFT JOIN public.trips tr ON tr.id = t.trip_id
  LEFT JOIN public.routes r ON r.id = tr.route_id
  WHERE t.qr_code = p_qr_code OR ('BUSPAY:' || t.id::text) = p_qr_code
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'QR code not found');
  END IF;

  IF v_ticket.qr_expires_at IS NOT NULL AND v_ticket.qr_expires_at < v_now THEN
    RETURN jsonb_build_object('success', false, 'reason', 'QR code has expired', 'ticket_id', v_ticket.id);
  END IF;

  IF v_ticket.status::text = 'used' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Ticket has already been scanned', 'ticket_id', v_ticket.id);
  END IF;

  IF v_ticket.status::text <> 'paid' THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'Ticket status: ' || v_ticket.status::text,
      'ticket_id', v_ticket.id
    );
  END IF;

  UPDATE public.ticket
  SET status = 'used',
      boarded_at = v_now,
      updated_at = v_now
  WHERE id = v_ticket.id;

  RETURN jsonb_build_object(
    'success', true,
    'ticket_id', v_ticket.id,
    'passenger', COALESCE(v_ticket.passenger, 'Passenger'),
    'seat', v_ticket.seat_number,
    'origin', v_ticket.origin,
    'destination', v_ticket.destination,
    'travel_date', v_ticket.travel_date,
    'departure', v_ticket.departure_time,
    'scanned_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.driver_scan_qr(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_scan_qr(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.driver_get_recent_scans()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_allowed boolean := true;
  v_today_count integer := 0;
  v_recent jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('today_count', 0, 'recent', '[]'::jsonb);
  END IF;

  IF to_regprocedure('public.is_driver_or_admin()') IS NOT NULL THEN
    EXECUTE 'SELECT public.is_driver_or_admin()' INTO v_allowed;
    IF NOT COALESCE(v_allowed, false) THEN
      RETURN jsonb_build_object('today_count', 0, 'recent', '[]'::jsonb);
    END IF;
  END IF;

  SELECT COUNT(*)
  INTO v_today_count
  FROM public.ticket t
  WHERE t.status::text = 'used'
    AND COALESCE(t.boarded_at, t.updated_at) >= date_trunc('day', now());

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'ticket_id', s.ticket_id,
      'passenger', COALESCE(s.passenger, 'Passenger'),
      'origin', s.origin,
      'destination', s.destination,
      'seat', s.seat_number,
      'scanned_at', s.scanned_at
    )
    ORDER BY s.scanned_at DESC
  ), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT
      t.id AS ticket_id,
      p.full_name AS passenger,
      r.origin,
      r.destination,
      t.seat_number,
      COALESCE(t.boarded_at, t.updated_at) AS scanned_at
    FROM public.ticket t
    LEFT JOIN public.passenger p ON p.user_id = t.user_id
    LEFT JOIN public.trips tr ON tr.id = t.trip_id
    LEFT JOIN public.routes r ON r.id = tr.route_id
    WHERE t.status::text = 'used'
      AND COALESCE(t.boarded_at, t.updated_at) >= date_trunc('day', now())
    ORDER BY COALESCE(t.boarded_at, t.updated_at) DESC
    LIMIT 10
  ) s;

  RETURN jsonb_build_object('today_count', v_today_count, 'recent', v_recent);
END;
$$;

REVOKE ALL ON FUNCTION public.driver_get_recent_scans() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_get_recent_scans() TO authenticated;
