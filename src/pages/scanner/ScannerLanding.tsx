import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScanLine, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";

interface RecentScan {
  id: string;
  seat_number: number;
  boarded_at: string;
  trips: { routes: { origin: string; destination: string } | null } | null;
}

export default function ScannerLanding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [driverName, setDriverName] = useState("Driver");
  const [todayCount, setTodayCount] = useState(0);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("passenger").select("full_name")
      .eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.full_name) setDriverName(data.full_name); });

    const today = new Date().toISOString().split("T")[0];
    supabase.from("ticket")
      .select("id, seat_number, boarded_at, trips(routes(origin, destination))")
      .eq("status", "boarded")
      .gte("boarded_at", `${today}T00:00:00`)
      .order("boarded_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setTodayCount(data?.length ?? 0);
        setRecentScans((data as unknown as RecentScan[]) ?? []);
        setLoading(false);
      });
  }, [user]);

  return (
    <div className="flex flex-col bg-[#0f0f1a] text-white pb-4">
      {/* Header */}
      <div className="px-5 pt-14 pb-4">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mb-1">QR Reader</p>
        <h1 className="text-2xl font-extrabold">Good day, {driverName.split(" ")[0]} 👋</h1>
        <p className="text-sm text-slate-400 mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
      </div>

      {/* Today's boarding card */}
      <div className="mx-5 mb-4 overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 to-orange-600 p-5 shadow-lg shadow-orange-500/30">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-100 mb-1">Today's Boarding</p>
            <p className="text-5xl font-extrabold text-white">{todayCount}</p>
            <p className="text-sm text-orange-100 mt-1">
              {todayCount === 1 ? "Passenger boarded" : "Passengers boarded"}
            </p>
          </div>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20">
            <CheckCircle2 className="h-9 w-9 text-white" />
          </div>
        </div>
      </div>

      {/* Start Scanning button */}
      <div className="mx-5 mb-5">
        <button onClick={() => navigate("/scanner/scan")}
          className="flex w-full items-center justify-center gap-3 rounded-3xl bg-white py-5 text-[#0f0f1a] font-extrabold text-lg shadow-lg shadow-white/10 hover:bg-slate-100 active:scale-[0.98] transition-all">
          <ScanLine className="h-6 w-6" />
          Start Scanning
        </button>
      </div>

      {/* Recent scans */}
      <div className="mx-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-200">Recent Scans</p>
          {recentScans.length > 0 && (
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-400">Today</span>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1,2].map(i => <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />)}
          </div>
        ) : recentScans.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-white/5 bg-white/3 py-12 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
              <ScanLine className="h-7 w-7 text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-slate-400">No scans yet today</p>
            <p className="mt-1 text-xs text-slate-600">Tap Start Scanning to begin</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentScans.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-green-500/15">
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {s.trips?.routes?.origin ?? "—"} → {s.trips?.routes?.destination ?? "—"}
                  </p>
                  <p className="text-xs text-slate-400">Seat #{s.seat_number}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500 flex-shrink-0">
                  <Clock className="h-3 w-3" />
                  {format(new Date(s.boarded_at), "h:mm a")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
