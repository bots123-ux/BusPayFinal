import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, MapPin, ArrowRight, Bus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CardSkeleton } from "@/components/Skeleton";
import { cn } from "@/lib/utils";

interface Route {
  id: string;
  origin: string;
  destination: string;
  duration_minutes: number;
  price_php: number;
}

interface Trip {
  id: string;
  travel_date: string;
  departure_time: string;
  bus_id: string;
  buses?: { plate_number: string; model: string | null; total_seats: number };
}

function todayLocalISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function next14Days(): string[] {
  const days: string[] = [];
  const base = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}


function CalendarPicker({ days, selected, onSelect }: { days: string[]; selected: string; onSelect: (d: string) => void }) {
  const today = days[0];
  const firstDay = new Date(today + "T00:00:00");
  // Get the month/year for the calendar header
  const monthLabel = format(firstDay, "MMMM yyyy");
  // Get all days in this month to build the grid
  const year = firstDay.getFullYear();
  const month = firstDay.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0=Sun
  const daySet = new Set(days);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  const getISO = (day: number) => {
    const d = new Date(year, month, day);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="mb-3 text-center text-sm font-bold text-foreground">{monthLabel}</div>
      <div className="mb-2 grid grid-cols-7 text-center">
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} className="text-[10px] font-semibold uppercase text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          const iso = getISO(day);
          const isSelectable = daySet.has(iso);
          const isSelected = iso === selected;
          const isToday = iso === days[0];
          return (
            <button
              key={iso}
              type="button"
              disabled={!isSelectable}
              onClick={() => onSelect(iso)}
              className={cn(
                "relative flex h-9 w-full items-center justify-center rounded-xl text-sm font-semibold transition-all",
                isSelected && "bg-gradient-hero text-primary-foreground shadow-navy",
                !isSelected && isSelectable && "hover:bg-accent/10 hover:text-primary text-foreground",
                !isSelected && isToday && isSelectable && "border-2 border-accent text-accent",
                !isSelectable && "text-muted-foreground/30 cursor-not-allowed",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 justify-center text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent inline-block"/>Available</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gradient-hero inline-block"/>Selected</span>
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(todayLocalISO());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: r } = await supabase.from("routes").select("*").eq("active", true);
      setRoutes(r ?? []);
      if (r && r.length && !routeId) setRouteId(r[0].id);
      setLoadingRoutes(false);

      if (user) {
        const { data: p } = await supabase.from("passenger").select("full_name").eq("user_id", user.id).maybeSingle();
        setFullName(p?.full_name ?? null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!routeId) return;
    setLoadingTrips(true);
    (async () => {
      const { data } = await supabase
        .from("trips")
        .select("id, travel_date, departure_time, bus_id, buses(plate_number, model, total_seats)")
        .eq("route_id", routeId)
        .eq("travel_date", date)
        .order("departure_time", { ascending: true });
      setTrips((data as unknown as Trip[]) ?? []);
      setLoadingTrips(false);
    })();
  }, [routeId, date]);

  // Filter out trips whose departure has already passed today
  const visibleTrips = useMemo(() => {
    if (date !== todayLocalISO()) return trips;
    const now = new Date();
    return trips.filter((tr) => {
      const [h, m] = tr.departure_time.split(":").map(Number);
      const dep = new Date();
      dep.setHours(h, m, 0, 0);
      return dep.getTime() > now.getTime();
    });
  }, [trips, date]);

  const days = useMemo(() => next14Days(), []);
  const currentRoute = routes.find((r) => r.id === routeId);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="px-5 py-6">
      {/* Header */}
      <header className="mb-6 flex items-center justify-between animate-fade-in">
        <div>
          <p className="text-sm text-muted-foreground">{greeting},</p>
          <h1 className="text-2xl font-extrabold">{fullName || t("home.hi")} 👋</h1>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-hero text-accent shadow-navy">
          <Bus className="h-6 w-6" />
        </div>
      </header>

      {/* Hero booking card */}
      <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-hero p-6 text-primary-foreground shadow-navy animate-slide-up">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent">{t("home.book")}</p>
        <div className="flex items-center gap-3 text-2xl font-bold">
          <span>{currentRoute?.origin ?? "—"}</span>
          <ArrowRight className="h-5 w-5 text-accent" />
          <span>{currentRoute?.destination ?? "—"}</span>
        </div>
        {currentRoute && (
          <p className="mt-2 text-sm text-primary-foreground/70">
            ₱{Number(currentRoute.price_php).toLocaleString()} · ~{Math.round(currentRoute.duration_minutes / 60)}h
          </p>
        )}
      </section>

      {/* Route selector */}
      <section className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <MapPin className="h-4 w-4" /> {t("home.route")}
        </h2>
        {loadingRoutes ? (
          <div className="grid grid-cols-2 gap-3">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {routes.map((r) => (
              <button
                key={r.id}
                onClick={() => setRouteId(r.id)}
                className={cn(
                  "rounded-2xl border-2 bg-card p-4 text-left transition-all",
                  routeId === r.id ? "border-accent shadow-soft" : "border-border hover:border-accent/40",
                )}
              >
                <div className="text-xs font-semibold uppercase text-muted-foreground">{r.origin}</div>
                <div className="my-1 flex items-center gap-1 text-accent">
                  <ArrowRight className="h-3 w-3" />
                </div>
                <div className="font-bold">{r.destination}</div>
                <div className="mt-2 text-sm text-muted-foreground">₱{Number(r.price_php).toLocaleString()}</div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Date picker — calendar grid */}
      <section className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Calendar className="h-4 w-4" /> {t("home.date")}
        </h2>
        <CalendarPicker days={days} selected={date} onSelect={setDate} />
      </section>

      {/* Time slots */}
      <section className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Clock className="h-4 w-4" /> {t("home.time")}
        </h2>
        {loadingTrips ? (
          <div className="space-y-3">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : visibleTrips.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border bg-surface-sunken p-8 text-center">
            <p className="text-sm text-muted-foreground">{t("home.noTimes")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleTrips.map((tr) => (
              <button
                key={tr.id}
                onClick={() => navigate(`/app/book/${tr.id}`)}
                className="group flex w-full items-center justify-between rounded-2xl border border-border bg-card p-4 transition-all hover:border-accent hover:shadow-soft"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 flex-col items-center justify-center rounded-xl bg-secondary">
                    <span className="text-lg font-extrabold">{tr.departure_time.slice(0, 5)}</span>
                  </div>
                  <div className="text-left">
                    <div className="font-semibold">{currentRoute?.origin} → {currentRoute?.destination}</div>
                    <div className="text-xs text-muted-foreground">
                      {tr.buses?.model ?? "Standard bus"} · {tr.buses?.plate_number}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-primary">₱{Number(currentRoute?.price_php ?? 0).toLocaleString()}</div>
                  <ArrowRight className="ml-auto mt-1 h-4 w-4 text-accent transition-transform group-hover:translate-x-1" />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
