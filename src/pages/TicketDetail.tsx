import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, RotateCcw, Loader2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { formatTime12h, arrivalTime, formatDuration } from "@/lib/time";
import { CardSkeleton } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Detail {
  id: string;
  seat_number: number;
  status: string;
  price_php: number;
  qr_code: string | null;
  created_at: string;
  refunded_at: string | null;
  refund_reason: string | null;
  trips: {
    travel_date: string;
    departure_time: string;
    routes: { origin: string; destination: string; duration_minutes: number; distance_km: number | null };
    buses: { plate_number: string; model: string | null };
  };
}

const REFUND_WINDOW_MINUTES = 60; // must match app_config in DB

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refunding, setRefunding] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const loadTicket = async () => {
    if (!id || !user) return;
    const { data: row } = await supabase
      .from("ticket")
      .select("id, seat_number, status, price_php, qr_code, created_at, refunded_at, refund_reason, trips(travel_date, departure_time, routes(origin, destination, duration_minutes, distance_km), buses(plate_number, model))")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    setData(row as unknown as Detail);
    setLoading(false);
  };

  useEffect(() => { loadTicket(); }, [id, user]);

  const minutesSinceBooking = data
    ? (Date.now() - new Date(data.created_at).getTime()) / 60000
    : Infinity;

  const canRefund = data?.status === "paid" && minutesSinceBooking <= REFUND_WINDOW_MINUTES;
  const minutesLeft = Math.max(0, Math.ceil(REFUND_WINDOW_MINUTES - minutesSinceBooking));

  const handleRefund = async () => {
    if (!id) return;
    setRefunding(true);
    try {
      const { data: result, error } = await supabase.rpc("refund_ticket", {
        p_ticket_id: id,
        p_reason: "Passenger requested refund",
      });
      if (error) throw error;
      const res = result as { ok: boolean; reason?: string; amount_php?: number };
      if (!res.ok) { toast.error(res.reason ?? "Refund failed"); return; }
      toast.success(`Refunded! ₱${Number(data?.price_php).toLocaleString()} is back in your wallet.`);
      await loadTicket();
    } catch (err: any) {
      toast.error(err?.message ?? "Refund failed. Please try again.");
    } finally {
      setRefunding(false);
      setShowConfirm(false);
    }
  };

  if (loading) return <div className="px-5 py-6"><CardSkeleton /></div>;

  if (!data) {
    return (
      <div className="px-5 py-12 text-center">
        <p className="mb-4">Ticket not found.</p>
        <Button variant="navy" onClick={() => navigate("/app/tickets")}>Back to tickets</Button>
      </div>
    );
  }

  const qrPayload = data.qr_code ?? `BUSPAY:${data.id}`;

  return (
    <div className="px-5 py-6">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("common.back")}
      </button>

      <article className="overflow-hidden rounded-3xl bg-gradient-ticket text-primary-foreground shadow-navy animate-scale-in">
        <div className="p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Boarding Pass</p>
          <div className="mt-3 flex items-center justify-center gap-3 text-2xl font-extrabold">
            <span>{data.trips.routes.origin}</span>
            <ArrowRight className="h-5 w-5 text-accent" />
            <span>{data.trips.routes.destination}</span>
          </div>
          <p className="mt-1 text-sm text-primary-foreground/70">
            {format(new Date(data.trips.travel_date), "PPPP")}
          </p>
        </div>

        {data.status === "paid" && (
          <div className="mx-6 rounded-2xl bg-primary-foreground p-6 text-center">
            <div className="mx-auto inline-block rounded-xl bg-white p-3">
              <QRCodeSVG value={qrPayload} size={180} level="M" includeMargin={false} />
            </div>
            <p className="mt-3 text-[11px] font-mono text-primary/60 break-all">{qrPayload}</p>
            <p className="mt-1 text-xs font-semibold text-primary">Scan at boarding</p>
          </div>
        )}

        {data.status === "cancelled" && (
          <div className="mx-6 rounded-2xl bg-white/10 border border-primary-foreground/20 p-5 text-center">
            <p className="text-sm font-bold text-primary-foreground">Ticket Cancelled &amp; Refunded</p>
            {data.refunded_at && (
              <p className="text-xs text-primary-foreground/60 mt-1">
                Refunded on {format(new Date(data.refunded_at), "PP · p")}
              </p>
            )}
          </div>
        )}

        {data.status === "used" && (
          <div className="mx-6 rounded-2xl bg-white/10 border border-primary-foreground/20 p-4 text-center">
            <p className="text-sm font-bold text-primary-foreground/80">✓ Boarded — Ticket Used</p>
            <p className="text-xs text-primary-foreground/50 mt-0.5">This ticket cannot be refunded</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 p-6">
          <Cell label="Departure" value={formatTime12h(data.trips.departure_time)} />
          <Cell label="Arrival (est.)" value={arrivalTime(data.trips.departure_time, data.trips.routes.duration_minutes)} />
          <Cell label="Seat" value={`#${data.seat_number}`} />
          <Cell label="Duration" value={formatDuration(data.trips.routes.duration_minutes)} />
          <Cell label="Distance" value={data.trips.routes.distance_km ? `${data.trips.routes.distance_km} km` : "—"} />
          <Cell label="Status" value={data.status} />
          <Cell label="Bus" value={data.trips.buses.plate_number} />
          <Cell label="Model" value={data.trips.buses.model ?? "—"} />
          <Cell label="Total" value={`₱${Number(data.price_php).toLocaleString()}`} />
        </div>
      </article>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Show this QR code to bus staff for boarding verification.
      </p>

      {/* ── Refund Section ── */}
      {data.status === "paid" && (
        <div className={cn(
          "mt-5 rounded-2xl border p-4",
          canRefund ? "border-amber-200 bg-amber-50" : "border-border bg-secondary/40"
        )}>
          {canRefund ? (
            <>
              <p className="text-sm font-semibold text-amber-800 mb-0.5">
                Refund available · {minutesLeft} min left
              </p>
              <p className="text-xs text-amber-700 mb-4">
                Cancel this ticket and get ₱{Number(data.price_php).toLocaleString()} back to your wallet.
                Window closes {REFUND_WINDOW_MINUTES} min after booking.
              </p>
              {!showConfirm ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-amber-400 text-amber-800 hover:bg-amber-100"
                  onClick={() => setShowConfirm(true)}
                >
                  <RotateCcw className="h-4 w-4 mr-2" /> Request Refund
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 rounded-xl bg-amber-100 p-3">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">
                      Your ticket will be cancelled and ₱{Number(data.price_php).toLocaleString()} returned to your wallet.
                      This cannot be undone.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1"
                      onClick={() => setShowConfirm(false)} disabled={refunding}>
                      Keep Ticket
                    </Button>
                    <Button size="sm"
                      className="flex-1 bg-destructive hover:bg-destructive/90 text-white"
                      onClick={handleRefund} disabled={refunding}>
                      {refunding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Refund Me"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-muted-foreground mb-0.5">Refund window closed</p>
              <p className="text-xs text-muted-foreground">
                Refunds are only allowed within {REFUND_WINDOW_MINUTES} minutes of booking.
                Contact support if you need further help.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-primary-foreground/60">{label}</div>
      <div className="font-bold capitalize">{value}</div>
    </div>
  );
}