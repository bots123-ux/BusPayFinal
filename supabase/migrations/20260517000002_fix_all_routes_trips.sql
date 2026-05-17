-- ============================================================
-- STEP 1: Make sure the 6 missing routes exist
-- ============================================================
INSERT INTO public.routes (origin, destination, duration_minutes, price_php) VALUES
  ('Manila',   'La Union',  330,  620),
  ('La Union', 'Manila',    330,  620),
  ('Manila',   'Vigan',     540,  850),
  ('Vigan',    'Manila',    540,  850),
  ('Manila',   'Pagudpud',  660,  980),
  ('Pagudpud', 'Manila',    660,  980)
ON CONFLICT DO NOTHING;

-- ============================================================
-- STEP 2: Make sure we have enough buses
-- ============================================================
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

-- ============================================================
-- STEP 3: Make sure we have enough drivers
-- ============================================================
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

-- ============================================================
-- STEP 4: Create (or replace) the rolling trip generator
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_upcoming_trips()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
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
  bus_idx     INT := 0;
  drv_idx     INT := 0;
BEGIN
  SELECT array_agg(id ORDER BY created_at) INTO bus_ids    FROM public.buses;
  SELECT array_agg(id ORDER BY created_at) INTO driver_ids FROM public.drivers;
  total_buses := array_length(bus_ids,  1);
  total_drvrs := array_length(driver_ids, 1);

  FOR route_rec IN
    SELECT id FROM public.routes WHERE active = true ORDER BY created_at
  LOOP
    FOR d IN 0..13 LOOP
      trip_date := CURRENT_DATE + d;
      FOREACH t IN ARRAY times LOOP
        bus_idx := (bus_idx % total_buses) + 1;
        drv_idx := (drv_idx % total_drvrs) + 1;

        INSERT INTO public.trips
          (route_id, bus_id, driver_id, travel_date, departure_time)
        VALUES
          (route_rec.id, bus_ids[bus_idx], driver_ids[drv_idx], trip_date, t)
        ON CONFLICT (route_id, travel_date, departure_time, bus_id) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$func$;

REVOKE ALL ON FUNCTION public.generate_upcoming_trips() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.generate_upcoming_trips() TO authenticated;

-- ============================================================
-- STEP 5: Run it now — generates 14 days for ALL 8 routes
-- ============================================================
SELECT public.generate_upcoming_trips();

-- ============================================================
-- STEP 6: Verify — should show ~56 trips per route (14 days x 4)
-- ============================================================
SELECT r.origin, r.destination, COUNT(t.id) AS trip_count
FROM public.routes r
LEFT JOIN public.trips t ON t.route_id = r.id
  AND t.travel_date >= CURRENT_DATE
GROUP BY r.origin, r.destination
ORDER BY r.origin, r.destination;
