import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { formatTime12h } from "@/lib/time";
import { CardSkeleton } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

interface Detail {
  id: string;
  seat_number: number;
  status: string;
  price_php: number;
  qr_code: string | null;
  created_at: string;
  trips: {
    travel_date: string;
    departure_time: string;
    routes: { origin: string; destination: string; duration_minutes: number };
    buses: { plate_number: string; model: string | null };
  };
}

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !user) return;
    (async () => {
      const { data: row } = await supabase
        .from("ticket")
        .select(
          "id, seat_number, status, price_php, qr_code, created_at, trips(travel_date, departure_time, routes(origin, destination, duration_minutes), buses(plate_number, model))",
        )
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      setData(row as unknown as Detail);
      setLoading(false);
    })();
  }, [id, user]);

  if (loading) {
    return (
      <div className="px-5 py-6">
        <CardSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-5 py-12 text-center">
        <p className="mb-4">Ticket not found.</p>
        <Button variant="navy" onClick={() => navigate("/app/tickets")}>
          Back to tickets
        </Button>
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
        {/* Header */}
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

        {/* QR */}
        <div className="mx-6 rounded-2xl bg-primary-foreground p-6 text-center">
          <div className="mx-auto inline-block rounded-xl bg-white p-3">
            <QRCodeSVG value={qrPayload} size={180} level="M" includeMargin={false} />
          </div>
          <p className="mt-3 text-[11px] font-mono text-primary/60 break-all">{qrPayload}</p>
          <p className="mt-1 text-xs font-semibold text-primary">Scan at boarding</p>
        </div>

        {/* Details */}
        <div className="grid grid-cols-3 gap-4 p-6">
          <Cell label="Departure" value={formatTime12h(data.trips.departure_time)} />
          <Cell label="Seat" value={`#${data.seat_number}`} />
          <Cell label="Status" value={data.status} />
          <Cell label="Bus" value={data.trips.buses.plate_number} />
          <Cell label="Duration" value={`${Math.round(data.trips.routes.duration_minutes / 60)}h`} />
          <Cell label="Total" value={`₱${Number(data.price_php).toLocaleString()}`} />
        </div>
      </article>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Show this QR code to bus staff for boarding verification.
      </p>
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
