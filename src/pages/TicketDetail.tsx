import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, RotateCcw, Loader2, AlertTriangle, Clock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
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

interface RefundRequest {
  found: boolean;
  request_id?: string;
  status?: "pending" | "approved" | "rejected";
  admin_note?: string | null;
  requested_at?: string;
  resolved_at?: string | null;
}

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<Detail | null>(null);
  const [refundReq, setRefundReq] = useState<RefundRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const loadTicket = async () => {
    if (!id || !user) return;
    const { data: row } = await supabase
      .from("ticket")
      .select(
        "id, seat_number, status, price_php, qr_code, created_at, refunded_at, refund_reason, trips(travel_date, departure_time, routes(origin, destination, duration_minutes, distance_km), buses(plate_number, model))"
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    setData(row as unknown as Detail);
  };

  const loadRefundRequest = async () => {
    if (!id) return;
    const { data: req } = await supabase.rpc("get_my_refund_request", { p_ticket_id: id });
    setRefundReq(req as RefundRequest);
  };

  useEffect(() => {
    (async () => {
      await Promise.all([loadTicket(), loadRefundRequest()]);
      setLoading(false);
    })();
  }, [id, user]);

  // Realtime: listen for refund_requests changes on this ticket
  useEffect(() => {
    if (!id || !user) return;
    const ch = supabase
      .channel(`refund-req-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "refund_requests",
          filter: `ticket_id=eq.${id}`,
        },
        () => {
          loadRefundRequest();
          loadTicket();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, user]);

  // Departure datetime
  const departureAt = data
    ? new Date(`${data.trips.travel_date}T${data.trips.departure_time}`)
    : null;

  // Can refund = ticket is paid AND departure hasn't happened AND no pending/approved request
  const beforeDeparture = departureAt ? new Date() < departureAt : false;
  const hasActiveRequest =
    refundReq?.found && refundReq.status !== "rejected";
  const canRequestRefund =
    data?.status === "paid" && beforeDeparture && !hasActiveRequest;

  const handleRequestRefund = async () => {
    if (!id) return;
    setSubmitting(true);
    try {
      const { data: result, error } = await supabase.rpc("request_refund", {
        p_ticket_id: id,
        p_reason: "Passenger requested refund",
      });
      if (error) throw error;
      const res = result as { ok: boolean; reason?: string; amount_php?: number };
      if (!res.ok) {
        toast.error(res.reason ?? "Request failed");
        return;
      }
      toast.success("Refund request submitted! An admin will review it shortly.");
      await loadRefundRequest();
      await loadTicket();
    } catch (err: any) {
      toast.error(err?.message ?? "Request failed. Please try again.");
    } finally {
      setSubmitting(false);
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

        {(data.status === "used" || data.status === "boarded") && (
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
        <div className="mt-5">
          {/* ── Pending request state ── */}
          {refundReq?.found && refundReq.status === "pending" && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <Loader2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5 animate-spin" />
                <div>
                  <p className="text-sm font-semibold text-blue-800">Refund request pending</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Submitted {formatDistanceToNow(new Date(refundReq.requested_at!), { addSuffix: true })}. An admin will review your request.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Rejected request — allow re-submit if still before departure ── */}
          {refundReq?.found && refundReq.status === "rejected" && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 mb-3">
              <p className="text-sm font-semibold text-red-800">Refund request rejected</p>
              {refundReq.admin_note && (
                <p className="text-xs text-red-700 mt-0.5">Reason: {refundReq.admin_note}</p>
              )}
              <p className="text-xs text-red-600 mt-1">
                Your ticket is still valid. You may submit a new request below if you still wish to cancel.
              </p>
            </div>
          )}

          {/* ── Refund available ── */}
          {canRequestRefund && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-semibold text-amber-800">
                  Refund available until departure
                </p>
              </div>
              <p className="text-xs text-amber-700 mb-4">
                You can request a refund of ₱{Number(data.price_php).toLocaleString()} any time before the{" "}
                {departureAt && format(departureAt, "h:mm a")} departure on{" "}
                {departureAt && format(departureAt, "MMM d")}. Refunds are reviewed by an admin — your wallet will be credited once approved.
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
                      Your refund request of ₱{Number(data.price_php).toLocaleString()} will be sent to an admin for approval. Your ticket stays valid until the admin approves.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setShowConfirm(false)}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-destructive hover:bg-destructive/90 text-white"
                      onClick={handleRequestRefund}
                      disabled={submitting}
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Request"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Window closed (departure passed) ── */}
          {!canRequestRefund && !hasActiveRequest && beforeDeparture === false && (
            <div className="rounded-2xl border border-border bg-secondary/40 p-4">
              <p className="text-sm font-semibold text-muted-foreground mb-0.5">Refund window closed</p>
              <p className="text-xs text-muted-foreground">
                Refunds can only be requested before the scheduled departure time.
                Contact support if you need further assistance.
              </p>
            </div>
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