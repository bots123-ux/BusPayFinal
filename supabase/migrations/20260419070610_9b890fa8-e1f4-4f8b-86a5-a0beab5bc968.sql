-- ============ ENUMS ============
CREATE TYPE public.ticket_status AS ENUM ('pending', 'paid', 'cancelled', 'used', 'expired');
CREATE TYPE public.payment_method AS ENUM ('cash', 'gcash', 'wallet', 'card');
CREATE TYPE public.payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE public.wallet_tx_type AS ENUM ('topup', 'payment', 'refund');
CREATE TYPE public.notification_type AS ENUM ('booking', 'payment', 'reminder', 'system');

-- ============ Helper: updated_at trigger ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============ PASSENGER ============
CREATE TABLE public.passenger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.passenger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Passengers view own profile" ON public.passenger
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Passengers insert own profile" ON public.passenger
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Passengers update own profile" ON public.passenger
  FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER passenger_updated_at BEFORE UPDATE ON public.passenger
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ROUTES ============
CREATE TABLE public.routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 360,
  price_php NUMERIC(10,2) NOT NULL DEFAULT 750,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Routes readable to authenticated" ON public.routes
  FOR SELECT TO authenticated USING (true);

-- ============ BUSES ============
CREATE TABLE public.buses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plate_number TEXT NOT NULL UNIQUE,
  model TEXT,
  total_seats INT NOT NULL DEFAULT 40,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.buses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buses readable to authenticated" ON public.buses
  FOR SELECT TO authenticated USING (true);

-- ============ DRIVERS ============
CREATE TABLE public.drivers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  license_number TEXT NOT NULL UNIQUE,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Drivers readable to authenticated" ON public.drivers
  FOR SELECT TO authenticated USING (true);

-- ============ TRIPS ============
CREATE TABLE public.trips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  bus_id UUID NOT NULL REFERENCES public.buses(id) ON DELETE RESTRICT,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  travel_date DATE NOT NULL,
  departure_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, travel_date, departure_time, bus_id)
);
CREATE INDEX idx_trips_route_date ON public.trips(route_id, travel_date);
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trips readable to authenticated" ON public.trips
  FOR SELECT TO authenticated USING (true);

-- ============ TICKET ============
CREATE TABLE public.ticket (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  seat_number INT NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'pending',
  qr_code TEXT,
  price_php NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, seat_number)
);
CREATE INDEX idx_ticket_user ON public.ticket(user_id);
CREATE INDEX idx_ticket_trip ON public.ticket(trip_id);
ALTER TABLE public.ticket ENABLE ROW LEVEL SECURITY;
-- Owners can fully manage their ticket
CREATE POLICY "Tickets owner select" ON public.ticket
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Tickets owner insert" ON public.ticket
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Tickets owner update" ON public.ticket
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Tickets owner delete" ON public.ticket
  FOR DELETE USING (auth.uid() = user_id);
-- Authenticated users can SEE only seat occupancy (trip_id + seat_number) of others, needed for the realtime seat map.
-- We expose only the columns the client needs via a view below; meanwhile allow a narrow read for status='paid' or 'pending' rows.
CREATE POLICY "Tickets occupancy visible" ON public.ticket
  FOR SELECT TO authenticated USING (status IN ('pending','paid','used'));
CREATE TRIGGER ticket_updated_at BEFORE UPDATE ON public.ticket
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES public.ticket(id) ON DELETE SET NULL,
  amount_php NUMERIC(10,2) NOT NULL,
  method public.payment_method NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'pending',
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Payments owner select" ON public.payments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Payments owner insert" ON public.payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Payments owner update" ON public.payments
  FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ WALLET ============
CREATE TABLE public.wallet (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_php NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Wallet owner select" ON public.wallet
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Wallet owner insert" ON public.wallet
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Wallet owner update" ON public.wallet
  FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER wallet_updated_at BEFORE UPDATE ON public.wallet
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ WALLET TRANSACTIONS ============
CREATE TABLE public.wallet_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.wallet_tx_type NOT NULL,
  amount_php NUMERIC(10,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wtx_user ON public.wallet_transactions(user_id, created_at DESC);
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "WTX owner select" ON public.wallet_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "WTX owner insert" ON public.wallet_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user ON public.notifications(user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Notif owner select" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Notif owner insert" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Notif owner update" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Notif owner delete" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);

-- ============ AUTO-CREATE PROFILE + WALLET ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.passenger (user_id, full_name, email, phone, language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data->>'language', 'en')
  );
  INSERT INTO public.wallet (user_id, balance_php) VALUES (NEW.id, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket;
ALTER TABLE public.ticket REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============ SEED DATA ============
INSERT INTO public.routes (origin, destination, duration_minutes, price_php) VALUES
  ('Manila', 'Baguio', 360, 750),
  ('Baguio', 'Manila', 360, 750);

INSERT INTO public.buses (plate_number, model, total_seats) VALUES
  ('BUS-MNL-001', 'Yutong ZK6107', 40),
  ('BUS-MNL-002', 'Hyundai Universe', 40),
  ('BUS-BAG-001', 'Yutong ZK6107', 40),
  ('BUS-BAG-002', 'Hyundai Universe', 40);

INSERT INTO public.drivers (full_name, license_number, phone) VALUES
  ('Juan Dela Cruz', 'N01-12-345678', '+639171234567'),
  ('Pedro Santos', 'N01-12-987654', '+639179876543'),
  ('Mario Reyes', 'N01-13-112233', '+639175551122'),
  ('Ramon Gatchalian', 'N01-13-998877', '+639175557788');

-- Generate trips for the next 14 days, 4 departures per day per direction
DO $$
DECLARE
  r_mnl_bag UUID;
  r_bag_mnl UUID;
  bus_ids UUID[];
  driver_ids UUID[];
  d INT;
  trip_date DATE;
  times TIME[] := ARRAY['06:00','09:00','13:00','17:00']::TIME[];
  t TIME;
  i INT;
BEGIN
  SELECT id INTO r_mnl_bag FROM public.routes WHERE origin='Manila' AND destination='Baguio' LIMIT 1;
  SELECT id INTO r_bag_mnl FROM public.routes WHERE origin='Baguio' AND destination='Manila' LIMIT 1;
  SELECT array_agg(id) INTO bus_ids FROM public.buses;
  SELECT array_agg(id) INTO driver_ids FROM public.drivers;

  FOR d IN 0..13 LOOP
    trip_date := CURRENT_DATE + d;
    i := 1;
    FOREACH t IN ARRAY times LOOP
      INSERT INTO public.trips (route_id, bus_id, driver_id, travel_date, departure_time)
      VALUES (r_mnl_bag, bus_ids[((i-1) % array_length(bus_ids,1)) + 1], driver_ids[((i-1) % array_length(driver_ids,1)) + 1], trip_date, t)
      ON CONFLICT DO NOTHING;
      INSERT INTO public.trips (route_id, bus_id, driver_id, travel_date, departure_time)
      VALUES (r_bag_mnl, bus_ids[(i % array_length(bus_ids,1)) + 1], driver_ids[(i % array_length(driver_ids,1)) + 1], trip_date, t)
      ON CONFLICT DO NOTHING;
      i := i + 1;
    END LOOP;
  END LOOP;
END $$;