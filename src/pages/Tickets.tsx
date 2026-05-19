import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { format } from "date-fns";
import { ArrowRight, Ticket as TicketIcon, QrCode, MoreVertical, Trash2, X } from "lucide-react";
import { formatTime12h } from "@/lib/time";
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
    routes: { origin: string; destination: string } | null;
  } | null;
}

const STATUS_STYLE: Record<string, string> = {
  paid:      "bg-emerald-500/15 text-emerald-600",
  pending:   "bg-amber-500/15 text-amber-600",
  used:      "bg-secondary text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  expired:   "bg-secondary text-muted-foreground",
  boarded:   "bg-blue-500/15 text-blue-400",
};

export default function Tickets() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const mountedRef = useRef(true);

  const [ticketMenuOpen, setTicketMenuOpen] = useState<string | null>(null);
  const [ticketConfirmId, setTicketConfirmId] = useState<string | null>(null);

  const deleteTicket = async (id: string) => {
    const { error } = await supabase.from("ticket").delete().eq("id", id);
    if (error) { console.error(error); return; }
    setTickets((prev) => prev.filter((t) => t.id !== id));
    setTicketConfirmId(null);
    setTicketMenuOpen(null);
  };

  // Close menu on outside click
  useEffect(() => {
    if (!ticketMenuOpen) return;
    const handler = () => setTicketMenuOpen(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [ticketMenuOpen]);
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

  useEffect(() => {
    mountedRef.current = true;
    load();
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
  }, []);

  const location = useLocation();
  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const now = new Date();

  // Safe check — guard against null trips
  const isUpcoming = (tr: TicketRow) => {
    if (!tr.trips) return false;
    try {
      const dep = new Date(`${tr.trips.travel_date}T${tr.trips.departure_time}`);
      return dep.getTime() >= now.getTime() && tr.status !== "cancelled";
    } catch {
      return false;
    }
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
          description="Book a trip to get started."
          action={<Button asChild variant="navy" size="lg"><Link to="/app">{t("home.book")}</Link></Button>}
        />
      ) : (
        <div className="space-y-4">
          {list.map((tr, i) => {
            // Safe access with fallbacks
            const origin = tr.trips?.routes?.origin ?? "—";
            const destination = tr.trips?.routes?.destination ?? "—";
            const travelDate = tr.trips?.travel_date;
            const departureTime = tr.trips?.departure_time;
            const isPast = tab === "past";
            const isMenuOpen = ticketMenuOpen === tr.id;
            const isConfirming = ticketConfirmId === tr.id;

            return (
              <div key={tr.id} className="relative animate-slide-up" style={{ animationDelay: `${i * 40}ms` }}>
                <Link to={`/app/tickets/${tr.id}`} className="group block">
                  <article className="overflow-hidden rounded-2xl bg-gradient-ticket text-primary-foreground shadow-navy transition-transform group-hover:-translate-y-0.5">
                    <div className="flex items-center justify-between p-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                          {travelDate
                            ? format(new Date(travelDate + "T00:00:00"), "EEE, d MMM")
                            : "—"
                          }{departureTime ? ` · ${formatTime12h(departureTime)}` : ""}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xl font-bold">
                          <span>{origin}</span>
                          <ArrowRight className="h-4 w-4 text-accent" />
                          <span>{destination}</span>
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

                {/* 3-dot menu — only on past tickets */}
                {isPast && !isConfirming && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTicketMenuOpen(isMenuOpen ? null : tr.id); }}
                    className="absolute right-3 top-3 z-10 rounded-full p-1.5 bg-black/30 hover:bg-black/50 transition-colors"
                  >
                    <MoreVertical className="h-4 w-4 text-white" />
                  </button>
                )}

                {/* Dropdown: Delete / Cancel */}
                {isPast && isMenuOpen && !isConfirming && (
                  <div className="absolute right-3 top-11 z-20 flex flex-col gap-1 rounded-2xl border border-border bg-card shadow-elevated p-2 min-w-[140px] animate-fade-in">
                    <button
                      onClick={(e) => { e.stopPropagation(); setTicketConfirmId(tr.id); setTicketMenuOpen(null); }}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setTicketMenuOpen(null); }}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary transition-colors"
                    >
                      <X className="h-4 w-4" /> Cancel
                    </button>
                  </div>
                )}

                {/* Confirm delete overlay */}
                {isPast && isConfirming && (
                  <div className="absolute inset-0 z-10 flex items-center justify-between gap-2 rounded-2xl bg-black/70 px-5 animate-fade-in">
                    <span className="text-sm font-semibold text-white">Delete this ticket?</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTicketConfirmId(null)}
                        className="rounded-xl border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => deleteTicket(tr.id)}
                        className="rounded-xl bg-destructive px-3 py-1.5 text-xs font-bold text-white hover:bg-destructive/80 transition-colors"
                      >
                        Confirm Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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