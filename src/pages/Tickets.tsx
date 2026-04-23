import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { format } from "date-fns";
import { ArrowRight, Ticket as TicketIcon, QrCode } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { CardSkeleton } from "@/components/Skeleton";
import { EmptyState, EmptyTicketIllustration } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TicketRow {
  id: string;
  seat_number: number;
  status: string;
  price_php: number;
  created_at: string;
  trips: {
    travel_date: string;
    departure_time: string;
    routes: { origin: string; destination: string };
  };
}

const STATUS_STYLE: Record<string, string> = {
  paid:      "bg-emerald-500/15 text-emerald-600",
  pending:   "bg-amber-500/15 text-amber-600",
  used:      "bg-secondary text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  expired:   "bg-secondary text-muted-foreground",
};

export default function Tickets() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const mountedRef = useRef(true);

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("ticket")
      .select("id, seat_number, status, price_php, created_at, trips(travel_date, departure_time, routes(origin, destination))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) console.error("Tickets error:", error);
    if (mountedRef.current) {
      setTickets((data as unknown as TicketRow[]) ?? []);
      setLoading(false);
    }
  };

  // Reload every time this page becomes visible
  useEffect(() => {
    mountedRef.current = true;
    load(); // Always fetch fresh on mount

    if (!user) return;
    const ch = supabase
      .channel(`tickets-list-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket", filter: `user_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ticket", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps = run on every mount

  // Also reload when navigating back to this tab
  const location = useLocation();
  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const now = new Date();
  const isUpcoming = (tr: TicketRow) => {
    const dep = new Date(`${tr.trips.travel_date}T${tr.trips.departure_time}`);
    return dep.getTime() >= now.getTime() && tr.status !== "cancelled";
  };

  const upcoming = tickets.filter(isUpcoming);
  const past = tickets.filter((tr) => !isUpcoming(tr));
  const list = tab === "upcoming" ? upcoming : past;

  return (
    <div className="px-5 py-6">
      <div className="mb-5 flex items-center justify-between animate-fade-in">
        <div>
          <h1 className="text-2xl font-extrabold">{t("tickets.title")}</h1>
          <p className="text-sm text-muted-foreground">Your boarding passes</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-hero text-accent shadow-navy">
          <TicketIcon className="h-5 w-5" />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
        {(["upcoming", "past"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn("relative rounded-xl px-4 py-2 text-sm font-semibold transition-all",
              tab === k ? "bg-card text-primary shadow-soft" : "text-muted-foreground")}>
            {k === "upcoming" ? t("tickets.upcoming") : t("tickets.past")}
            {k === "upcoming" && upcoming.length > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                {upcoming.length}
              </span>
            )}
            {k === "past" && past.length > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-muted-foreground border border-border px-1">
                {past.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3"><CardSkeleton /><CardSkeleton /></div>
      ) : list.length === 0 ? (
        <EmptyState
          illustration={<EmptyTicketIllustration />}
          title={t("tickets.empty")}
          description="Book a Manila to Baguio trip to get started."
          action={<Button asChild variant="navy" size="lg"><Link to="/app">{t("home.book")}</Link></Button>}
        />
      ) : (
        <div className="space-y-4">
          {list.map((tr, i) => (
            <Link key={tr.id} to={`/app/tickets/${tr.id}`}
              className="group block animate-slide-up"
              style={{ animationDelay: `${i * 40}ms` }}>
              <article className="overflow-hidden rounded-2xl bg-gradient-ticket text-primary-foreground shadow-navy transition-transform group-hover:-translate-y-0.5">
                <div className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                      {format(new Date(tr.trips.travel_date + "T00:00:00"), "EEE, d MMM")} · {tr.trips.departure_time.slice(0, 5)}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xl font-bold">
                      <span>{tr.trips.routes.origin}</span>
                      <ArrowRight className="h-4 w-4 text-accent" />
                      <span>{tr.trips.routes.destination}</span>
                    </div>
                  </div>
                  <QrCode className="h-8 w-8 text-accent/70" />
                </div>
                <div className="border-t border-dashed border-primary-foreground/20 px-5 py-4">
                  <div className="flex items-center justify-between text-sm">
                    <Field label="Seat" value={`#${tr.seat_number}`} />
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-primary-foreground/60 mb-1">Status</div>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold capitalize", STATUS_STYLE[tr.status] ?? "bg-secondary text-muted-foreground")}>
                        {tr.status}
                      </span>
                    </div>
                    <Field label="Total" value={`₱${Number(tr.price_php).toLocaleString()}`} />
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-primary-foreground/60">{label}</div>
      <div className="font-bold capitalize">{value}</div>
    </div>
  );
}
