import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScanLine, Download, CheckCircle2, Clock, LogOut, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface RecentScan {
  ticket_id: string;
  passenger: string;
  origin: string;
  destination: string;
  seat: number;
  scanned_at: string;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

interface RecentScanRow {
  id: string;
  seat_number: number;
  updated_at: string;
  trips?: {
    routes?: { origin?: string | null; destination?: string | null } | null;
  } | null;
}

export default function ScannerLanding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [driverName, setDriverName] = useState("Driver");
  const [todayCount, setTodayCount] = useState(0);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    // Swap manifest
    const link = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
    const prev = link?.href ?? "";
    if (link) link.href = "/scanner-manifest.json";
    const meta = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
    const prevColor = meta?.content ?? "";
    if (meta) meta.content = "#0f0f1a";

    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));

    return () => {
      if (link) link.href = prev;
      if (meta) meta.content = prevColor;
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    // Load driver info
    supabase.from("passenger").select("full_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.full_name) setDriverName(data.full_name); });

    // Load today's used tickets count. A successful scan marks a paid ticket as "used".
    const today = new Date().toISOString().split("T")[0];
    supabase.from("ticket")
      .select("id, seat_number, updated_at, trips(routes(origin, destination))")
      .eq("status", "used")
      .gte("updated_at", `${today}T00:00:00`)
      .order("updated_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setTodayCount(data?.length ?? 0);
        setRecentScans(((data as RecentScanRow[] | null) ?? []).map((t) => ({
          ticket_id: t.id,
          passenger: "Passenger",
          origin: t.trips?.routes?.origin ?? "—",
          destination: t.trips?.routes?.destination ?? "—",
          seat: t.seat_number,
          scanned_at: t.updated_at,
        })));
      });
  }, [user]);

  const handleInstall = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
    } else if (isIos) {
      setShowIosHint(true);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/scanner/login");
  };

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white flex flex-col">

      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1a1a2e] border border-white/10">
            <img src="/scanner-icons/icon-96x96.png" alt="QR" className="h-8 w-8 rounded-xl" />
          </div>
          <div>
            <p className="text-base font-bold leading-tight">QR Reader</p>
            <p className="text-xs text-slate-400">Welcome, {driverName}</p>
          </div>
        </div>
        <button onClick={handleLogout}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:text-white transition-colors">
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* Today's stats card */}
      <div className="mx-5 mt-4 rounded-3xl overflow-hidden">
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-100 mb-1">Today's Boarding</p>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-5xl font-extrabold">{todayCount}</p>
              <p className="text-sm text-orange-100 mt-1">
                {todayCount === 0 ? "No passengers boarded yet" :
                 todayCount === 1 ? "Passenger boarded" : "Passengers boarded"}
              </p>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20">
              <CheckCircle2 className="h-9 w-9 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Scan button */}
      <div className="mx-5 mt-4">
        <button
          onClick={() => navigate("/scanner/scan")}
          className="flex w-full items-center justify-center gap-3 rounded-3xl bg-white py-5 text-[#0f0f1a] font-extrabold text-lg hover:bg-slate-100 active:scale-98 transition-all shadow-lg shadow-white/10"
        >
          <ScanLine className="h-6 w-6" />
          Start Scanning
        </button>
      </div>

      {/* Install button */}
      {!installed && (
        <div className="mx-5 mt-3">
          <button onClick={handleInstall}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-orange-500/30 bg-orange-500/10 py-4 text-sm font-semibold text-orange-400 hover:bg-orange-500/20 transition-colors">
            <Download className="h-4 w-4" />
            {isIos ? "Add QR Reader to Home Screen" : "Install QR Reader App"}
          </button>
        </div>
      )}

      {/* Recent scans */}
      <div className="flex-1 mx-5 mt-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-slate-300">Recent Scans</p>
          {recentScans.length > 0 && (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-slate-400">Today</span>
          )}
        </div>

        {recentScans.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-white/5 bg-white/3 py-12 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
              <ScanLine className="h-7 w-7 text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-slate-400">No scans yet today</p>
            <p className="mt-1 text-xs text-slate-600">Tap Start Scanning to begin</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentScans.map((s, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-green-500/15">
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{s.origin} → {s.destination}</p>
                  <p className="text-xs text-slate-400">Seat #{s.seat}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500 flex-shrink-0">
                  <Clock className="h-3 w-3" />
                  {format(new Date(s.scanned_at), "h:mm a")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* iOS install hint modal */}
      {showIosHint && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm" onClick={() => setShowIosHint(false)}>
          <div className="w-full rounded-t-3xl bg-[#1a1a2e] border-t border-white/10 p-6" onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-white/20" />
            <p className="text-lg font-extrabold mb-1">Add to Home Screen</p>
            <p className="text-sm text-slate-400 mb-5">Install QR Reader on your iPhone:</p>
            {[
              { step: "1", text: "Make sure you are using Safari" },
              { step: "2", text: "Tap the Share button (□↑) at the bottom" },
              { step: "3", text: "Scroll down and tap Add to Home Screen" },
              { step: "4", text: "Tap Add — QR Reader appears on your home screen!" },
            ].map(({ step, text }) => (
              <div key={step} className="flex items-center gap-3 mb-3">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">{step}</div>
                <p className="text-sm text-slate-300">{text}</p>
              </div>
            ))}
            <button onClick={() => setShowIosHint(false)} className="mt-4 w-full rounded-2xl bg-orange-500 py-3.5 font-bold text-white">Got it!</button>
          </div>
        </div>
      )}

      <div className="pb-8" />
    </div>
  );
}
