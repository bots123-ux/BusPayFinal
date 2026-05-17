-- ============================================================
-- Migration: Expand all routes to 14-day rolling trips
-- Applied: 2026-05-17
-- Fixes: Only Manila↔Baguio had 14-day trips; remaining 6
--        routes had only 7 days. This migration:
--   1. Inserts the 6 missing routes (La Union, Vigan, Pagudpud
--      + their return directions) if not already present.
--   2. Adds more buses & drivers to cover all 8 routes.
--   3. Backfills all routes to a full 14-day window from today.
--   4. Creates generate_upcoming_trips() — call this daily
--      (e.g. via pg_cron or Supabase Edge Function cron) so
--      every route always has exactly 14 days of trips.
-- ============================================================

-- ── 1. SEED MISSING ROUTES ───────────────────────────────────
INSERT INTO public.routes (origin, destination, duration_minutes, price_php) VALUES
  ('Manila',   'La Union',  330,  620),
  ('La Union', 'Manila',    330,  620),
  ('Manila',   'Vigan',     540,  850),
  ('Vigan',    'Manila',    540,  850),
  ('Manila',   'Pagudpud',  660,  980),
  ('Pagudpud', 'Manila',    660,  980)
ON CONFLICT DO NOTHING;

-- ── 2. SEED ADDITIONAL BUSES ─────────────────────────────────
-- We need enough buses to serve 4 departures × 8 routes simultaneously.
-- Original seed had 4 buses; add 8 more for coverage.
INSERT INTO public.buses (plate_number, model, total_seats) VALUES
  ('BUS-LUN-001', 'Yutong ZK6107',    40),
  ('BUS-LUN-002', 'Hyundai Universe', 40),
  ('BUS-VGN-001', 'Yutong ZK6107',    40),
  ('BUS-VGN-002', 'Hyundai Universe', 40),
  ('BUS-PGD-001', 'Yutong ZK6107',    40),
  ('BUS-PGD-002', 'Hyundai Universe', 40),
  ('BUS-MNL-003', 'Scania K410',      44),
  ('BUS-MNL-004', 'Scania K410',      44)
ON CONFLICT (plate_number) DO NOTHING;

-- ── 3. SEED ADDITIONAL DRIVERS ───────────────────────────────
INSERT INTO public.drivers (full_name, license_number, phone) VALUES
  ('Roberto Cruz',       'N01-14-223344', '+639181234567'),
  ('Eduardo Lim',        'N01-14-556677', '+639189876543'),
  ('Antonio Villanueva', 'N01-15-889900', '+639185551234'),
  ('Danilo Ramos',       'N01-15-112244', '+639185557890'),
  ('Fernando Soriano',   'N01-16-334455', '+639176661234'),
  ('Bernardo Aguilar',   'N01-16-667788', '+639176667890'),
  ('Alfredo Pascual',    'N01-17-990011', '+639167771234'),
  ('Gregorio Mendez',    'N01-17-223355', '+639167777890')
ON CONFLICT (license_number) DO NOTHING;

-- ── 4. CORE FUNCTION: generate_upcoming_trips() ───────────────
-- Generates trips for the next 14 days for ALL active routes.
-- Uses ON CONFLICT DO NOTHING so it's safe to call repeatedly
-- (daily via cron). Each route gets 4 departures per day,
-- rotating buses and drivers to spread the load.
CREATE OR REPLACE FUNCTION public.generate_upcoming_trips()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  route_rec   RECORD;
  bus_ids     UUID[];
  driver_ids  UUID[];
  total_buses INT;
  total_drvrs INT;
  d           INT;
  trip_date   DATE;
  times       TIME[] := ARRAY['06:00','09:00','13:00','17:00']::TIME[];
  t           TIME;
  i           INT;
  bus_idx     INT := 0;
  drv_idx     INT := 0;
BEGIN
  -- Gather all buses and drivers
  SELECT array_agg(id ORDER BY created_at) INTO bus_ids   FROM public.buses;
  SELECT array_agg(id ORDER BY created_at) INTO driver_ids FROM public.drivers;
  total_buses := array_length(bus_ids,  1);
  total_drvrs := array_length(driver_ids, 1);

  -- Loop every active route
  FOR route_rec IN
    SELECT id FROM public.routes WHERE active = true ORDER BY created_at
  LOOP
    i := 0;
    -- Loop 14 days ahead (day 0 = today through day 13)
    FOR d IN 0..13 LOOP
      trip_date := CURRENT_DATE + d;

      FOREACH t IN ARRAY times LOOP
        -- Rotate bus and driver across all routes/days/times
        bus_idx := (bus_idx % total_buses) + 1;
        drv_idx := (drv_idx % total_drvrs) + 1;

        INSERT INTO public.trips
          (route_id, bus_id, driver_id, travel_date, departure_time)
        VALUES
          (route_rec.id,
           bus_ids[bus_idx],
           driver_ids[drv_idx],
           trip_date,
           t)
        ON CONFLICT (route_id, travel_date, departure_time, bus_id) DO NOTHING;

        i := i + 1;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;

-- Grant execute to authenticated users (admin can also call it manually)
REVOKE ALL ON FUNCTION public.generate_upcoming_trips() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.generate_upcoming_trips() TO authenticated;

-- ── 5. BACKFILL: Run immediately to seed all routes ───────────
-- This call generates the full 14-day window for every route
-- right now, including the 6 newly inserted ones.
SELECT public.generate_upcoming_trips();

-- ── 6. AUTO-ROLLING via pg_cron (if extension is enabled) ─────
-- Supabase projects have pg_cron available on the postgres role.
-- This schedules generate_upcoming_trips() to run every day at
-- 00:05 Philippine time (UTC+8 → 16:05 UTC previous day).
-- If pg_cron is not enabled on your project, comment this block
-- out and instead call generate_upcoming_trips() from a daily
-- Supabase Edge Function cron job.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'rolling-14day-trips',          -- job name (idempotent)
      '5 16 * * *',                   -- 00:05 PHT daily (16:05 UTC)
      $$SELECT public.generate_upcoming_trips();$$
    );
  END IF;
END
$$;
