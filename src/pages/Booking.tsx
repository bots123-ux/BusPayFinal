import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Wallet as WalletIcon, Smartphone, Check } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CardSkeleton } from "@/components/Skeleton";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Method = "gcash" | "wallet";

interface TripDetail {
  id: string;
  travel_date: string;
  departure_time: string;
  bus_id: string;
  buses: { plate_number: string; model: string | null; total_seats: number };
  routes: { origin: string; destination: string; price_php: number; duration_minutes: number };
}

const SEAT_LAYOUT = (() => {
  const rows: { row: number; left: number[]; right: number[] }[] = [];
  let n = 1;
  for (let i = 0; i < 10; i++) {
    rows.push({ row: i + 1, left: [n++, n++], right: [n++, n++] });
  }
  return rows;
})();

export default function Booking() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [taken, setTaken] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [passengerCount, setPassengerCount] = useState(1);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [step, setStep] = useState<"seat" | "pay" | "done">("seat");
  const [method, setMethod] = useState<Method>("gcash");
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedTicketId, setConfirmedTicketId] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    (async () => {
      const { data: tripData, error } = await supabase
        .from("trips")
        .select(
          "id, travel_date, departure_time, bus_id, buses(plate_number, model, total_seats), routes(origin, destination, price_php, duration_minutes)",
        )
        .eq("id", tripId)
        .maybeSingle();

      if (error || !tripData) {
        toast.error("Trip not found");
        navigate("/app");
        return;
      }
      if (cancelled) return;
      setTrip(tripData as unknown as TripDetail);

      const { data: tickets } = await supabase
        .from("ticket")
        .select("seat_number,status")
        .eq("trip_id", tripId)
        .in("status", ["pending", "paid", "used"]);
      if (!cancelled) {
        setTaken(new Set((tickets ?? []).map((x) => x.seat_number)));
      }

      if (user) {
        const { data: w } = await supabase.from("wallet").select("balance_php").eq("user_id", user.id).maybeSingle();
        if (!cancelled) setWalletBalance(Number(w?.balance_php ?? 0));
      }
      if (!cancelled) setLoading(false);
    })();

    // Realtime: listen for new/updated tickets on this trip
    const channel = supabase
      .channel(`trip-${tripId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ticket", filter: `trip_id=eq.${tripId}` },
        (payload) => {
          setTaken((prev) => {
            const next = new Set(prev);
            const row = (payload.new ?? payload.old) as { seat_number: number; status: string } | null;
            if (!row) return next;
            if (
              payload.eventType === "DELETE" ||
              (row.status !== "pending" && row.status !== "paid" && row.status !== "used")
            ) {
              next.delete(row.seat_number);
            } else {
              next.add(row.seat_number);
            }
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [tripId, user, navigate]);

  const price = trip ? Number(trip.routes.price_php) : 0;

  const handleConfirm = async () => {
    if (!trip || !user || selectedSeats.length === 0) return;
    if (method === "wallet" && walletBalance < price) {
      toast.error("Insufficient wallet balance.");
      return;
    }
    setSubmitting(true);
    try {
      const totalPrice = price * selectedSeats.length;
      if (method === "wallet" && walletBalance < totalPrice) {
        toast.error("Insufficient wallet balance.");
        setSubmitting(false);
        return;
      }

      // Insert a ticket for each selected seat
      const ticketIds: string[] = [];
      for (const seatNum of selectedSeats) {
        const { data: ticketRow, error: tErr } = await supabase
          .from("ticket")
          .insert({
            user_id: user.id,
            trip_id: trip.id,
            seat_number: seatNum,
            status: "paid",
            price_php: price,
          })
          .select("id")
          .single();
        if (tErr) throw tErr;

        // Set QR code
        await supabase.from("ticket").update({ qr_code: `BUSPAY:${ticketRow.id}` }).eq("id", ticketRow.id);

        // Insert payment record
        const { error: pErr } = await supabase.from("payments").insert({
          user_id: user.id,
          ticket_id: ticketRow.id,
          amount_php: price,
          method,
          status: "completed",
          reference: method === "gcash" ? `GCASH-${Date.now()}-${seatNum}` : null,
        });
        if (pErr) throw pErr;

        ticketIds.push(ticketRow.id);
      }

      // Deduct wallet once for total
      if (method === "wallet") {
        await supabase.from("wallet").update({ balance_php: walletBalance - totalPrice }).eq("user_id", user.id);
        await supabase.from("wallet_transactions").insert({
          user_id: user.id,
          type: "payment",
          amount_php: -totalPrice,
          description: `${selectedSeats.length} ticket(s) · ${trip.routes.origin} → ${trip.routes.destination}`,
        });
      }

      // Send one booking notification with correct PH time
      const depDate = format(new Date(trip.travel_date + "T00:00:00"), "MMM d, yyyy");
      const depTime = trip.departure_time.slice(0, 5);
      await supabase.from("notifications").insert({
        user_id: user.id,
        type: "booking",
        title: "Booking confirmed! 🎉",
        body: `${selectedSeats.length} seat(s) #${selectedSeats.join(", #")} · ${trip.routes.origin} → ${trip.routes.destination} · ${depDate} at ${depTime}`,
      });

      setConfirmedTicketId(ticketIds[0]);
      setStep("done");
    } catch (err: any) {
      toast.error(err?.message ?? "Booking failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !trip) {
    return (
      <div className="px-5 py-6">
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="px-5 py-6">
      <button
        onClick={() => (step === "pay" ? setStep("seat") : navigate(-1))}
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("common.back")}
      </button>

      {step === "seat" && (
        <div className="animate-fade-in">
          <h1 className="mb-1 text-2xl font-extrabold">{t("home.seat")}</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            {trip.routes.origin} → {trip.routes.destination} · {format(new Date(trip.travel_date), "PPP")} ·{" "}
            {trip.departure_time.slice(0, 5)}
          </p>


          {/* Passenger count */}
          <div className="mb-5 flex items-center justify-between rounded-2xl border border-border bg-card p-4">
            <div>
              <div className="font-semibold">Passengers</div>
              <div className="text-xs text-muted-foreground">Select a seat per passenger</div>
            </div>
            <div className="flex items-center gap-3">
              <button type="button"
                onClick={() => { if (passengerCount > 1) { setPassengerCount(p => p - 1); setSelectedSeats([]); } }}
                className="flex h-8 w-8 items-center justify-center rounded-xl border-2 border-border text-lg font-bold hover:border-accent transition-colors disabled:opacity-40"
                disabled={passengerCount <= 1}>−</button>
              <span className="w-4 text-center font-extrabold text-lg">{passengerCount}</span>
              <button type="button"
                onClick={() => { if (passengerCount < 5) { setPassengerCount(p => p + 1); setSelectedSeats([]); } }}
                className="flex h-8 w-8 items-center justify-center rounded-xl border-2 border-border text-lg font-bold hover:border-accent transition-colors disabled:opacity-40"
                disabled={passengerCount >= 5}>+</button>
            </div>
          </div>

          {/* Legend */}
          <div className="mb-5 flex items-center gap-4 text-xs">
            <Legend color="bg-seat-available" label="Available" />
            <Legend color="bg-seat-selected" label="Selected" />
            <Legend color="bg-seat-taken" label="Taken" />
          </div>

          {/* Seat map */}
          <div className="rounded-3xl border-2 border-border bg-gradient-card p-5 shadow-soft">
            {/* Driver area */}
            <div className="mb-4 flex items-center justify-between rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              <span>🚍 Front · Driver</span>
              <span>Door →</span>
            </div>

            <div className="space-y-2">
              {SEAT_LAYOUT.map(({ row, left, right }) => (
                <div key={row} className="flex items-center justify-between gap-2">
                  <div className="flex gap-2">
                    {left.map((n) => (
                      <Seat key={n} n={n} taken={taken.has(n)} selected={selectedSeats.includes(n)} onClick={() => {
                    if (selectedSeats.includes(n)) {
                      setSelectedSeats(prev => prev.filter(s => s !== n));
                    } else if (selectedSeats.length < passengerCount) {
                      setSelectedSeats(prev => [...prev, n]);
                    }
                  }} />
                    ))}
                  </div>
                  <span className="w-6 text-center text-xs font-semibold text-muted-foreground">{row}</span>
                  <div className="flex gap-2">
                    {right.map((n) => (
                      <Seat key={n} n={n} taken={taken.has(n)} selected={selectedSeats.includes(n)} onClick={() => {
                    if (selectedSeats.includes(n)) {
                      setSelectedSeats(prev => prev.filter(s => s !== n));
                    } else if (selectedSeats.length < passengerCount) {
                      setSelectedSeats(prev => [...prev, n]);
                    }
                  }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sticky CTA */}
          <div className="sticky bottom-24 mt-5">
            <Button
              variant="navy"
              size="lg"
              className="w-full"
              disabled={selectedSeats.length < passengerCount}
              onClick={() => setStep("pay")}
            >
              {selectedSeats.length < passengerCount
                ? `Select ${passengerCount - selectedSeats.length} more seat${passengerCount - selectedSeats.length > 1 ? "s" : ""}`
                : `Seats ${selectedSeats.join(", ")} · ${t("home.continue")}`}
            </Button>
          </div>
        </div>
      )}

      {step === "pay" && (
        <div className="animate-fade-in">
          <h1 className="mb-1 text-2xl font-extrabold">{t("pay.title")}</h1>
          <p className="mb-5 text-sm text-muted-foreground">{t("pay.method")}</p>

          {/* Summary card */}
          <div className="mb-5 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-3xl font-extrabold text-primary">₱{(price * passengerCount).toLocaleString()}</span>
            </div>
            <div className="mt-3 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Route</span>
                <span className="font-semibold">{trip.routes.origin} → {trip.routes.destination}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="font-semibold">{format(new Date(trip.travel_date), "PP")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Departure</span>
                <span className="font-semibold">{trip.departure_time.slice(0, 5)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Seat(s)</span>
                <span className="font-semibold">#{selectedSeats.join(", #")}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">

            <PayOption
              icon={<Smartphone className="h-5 w-5" />}
              label={t("pay.gcash")}
              hint="Instant"
              active={method === "gcash"}
              onClick={() => setMethod("gcash")}
            />
            <PayOption
              icon={<WalletIcon className="h-5 w-5" />}
              label={`${t("pay.wallet")} · ₱${walletBalance.toLocaleString()}`}
              hint={walletBalance < price ? "Insufficient" : "Instant"}
              disabled={walletBalance < price}
              active={method === "wallet"}
              onClick={() => setMethod("wallet")}
            />
          </div>

          <Button variant="navy" size="lg" className="mt-6 w-full" disabled={submitting} onClick={handleConfirm}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("pay.confirm")}
          </Button>
        </div>
      )}

      {step === "done" && confirmedTicketId && (
        <div className="animate-scale-in py-12 text-center">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="h-12 w-12" strokeWidth={3} />
          </div>
          <h1 className="mb-2 text-2xl font-extrabold">{t("pay.success")}</h1>
          <p className="mb-8 text-sm text-muted-foreground">
            Seat(s) #{selectedSeats.join(", #")} · {trip.routes.origin} → {trip.routes.destination}
          </p>
          <div className="flex flex-col gap-3">
            <Button variant="navy" size="lg" onClick={() => navigate(`/app/tickets/${confirmedTicketId}`)}>
              View ticket
            </Button>
            <Button variant="outline" size="lg" onClick={() => navigate("/app")}>
              Back to home
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Seat({ n, taken, selected, onClick }: { n: number; taken: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={taken}
      onClick={onClick}
      aria-label={`Seat ${n}${taken ? " (taken)" : selected ? " (selected)" : " (available)"}`}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-xl text-xs font-bold transition-all",
        "border-2 shadow-sm",
        taken && "cursor-not-allowed border-seat-taken bg-seat-taken text-seat-taken-fg opacity-70",
        !taken && !selected && "border-seat-available bg-seat-available text-seat-available-fg hover:scale-105",
        selected && "border-accent bg-seat-selected text-seat-selected-fg scale-110 shadow-gold",
      )}
    >
      {n}
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded", color)} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function PayOption({
  icon,
  label,
  hint,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-4 rounded-2xl border-2 bg-card p-4 text-left transition-all",
        active ? "border-accent shadow-soft" : "border-border hover:border-accent/40",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", active ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground")}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="font-semibold">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {active && (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Check className="h-4 w-4" strokeWidth={3} />
        </div>
      )}
    </button>
  );
}
