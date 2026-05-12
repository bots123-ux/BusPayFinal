import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, Clock, Download, LogOut, RefreshCw, ScanLine, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";

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

type RouteState = {
  lastScan?: RecentScan | null;
};

type ScanPayload = Record<string, unknown>;

type TicketScanRow = {
  id: string;
  seat_number: number;
  updated_at?: string | null;
  boarded_at?: string | null;
  trips?: {
    travel_date?: string | null;
    departure_time?: string | null;
    routes?: { origin?: string | null; destination?: string | null } | Array<{ origin?: string | null; destination?: string | null }> | null;
  } | Array<{
    travel_date?: string | null;
    departure_time?: string | null;
    routes?: { origin?: string | null; destination?: string | null } | Array<{ origin?: string | null; destination?: string | null }> | null;
  }> | null;
};

const RECENT_SCANS_KEY = "buspay:scanner:recent-scans";

function firstRelation<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function asPayload(payload: unknown): ScanPayload {
  return typeof payload === "object" && payload !== null ? (payload as ScanPayload) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function todayStartIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function readRecentScans(): RecentScan[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_SCANS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecentScans(scans: RecentScan[]) {
  localStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(scans.slice(0, 50)));
}

function mergeScans(...groups: RecentScan[][]) {
  const byTicket = new Map<string, RecentScan>();

  groups.flat().forEach((scan) => {
    const existing = byTicket.get(scan.ticket_id);
    if (!existing || new Date(scan.scanned_at) > new Date(existing.scanned_at)) {
      byTicket.set(scan.ticket_id, scan);
    }
  });

  return [...byTicket.values()].sort((a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime());
}

function ticketRowToRecentScan(row: TicketScanRow): RecentScan {
  const trip = firstRelation(row.trips);
  const route = firstRelation(trip?.routes);

  return {
    ticket_id: row.id,
    passenger: "Passenger",
    origin: route?.origin ?? "-",
    destination: route?.destination ?? "-",
    seat: row.seat_number,
    scanned_at: row.boarded_at ?? row.updated_at ?? new Date().toISOString(),
  };
}

function rpcRecentScanToRecord(value: unknown): RecentScan | null {
  const record = asPayload(value);
  const ticketId = stringValue(record.ticket_id);
  const scannedAt = stringValue(record.scanned_at) ?? stringValue(record.boarded_at);

  if (!ticketId || !scannedAt) return null;

  return {
    ticket_id: ticketId,
    passenger: stringValue(record.passenger) ?? "Passenger",
    origin: stringValue(record.origin) ?? "-",
    destination: stringValue(record.destination) ?? "-",
    seat: numberValue(record.seat) ?? 0,
    scanned_at: scannedAt,
  };
}

function parseRecentScansPayload(payload: unknown): { todayCount?: number; recent: RecentScan[] } {
  const record = asPayload(payload);
  const recentRaw = Array.isArray(record.recent) ? record.recent : [];

  return {
    todayCount: numberValue(record.today_count),
    recent: recentRaw.map(rpcRecentScanToRecord).filter((scan): scan is RecentScan => Boolean(scan)),
  };
}

export default function ScannerLanding() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const routeState = location.state as RouteState | null;
  const [driverName, setDriverName] = useState("Driver");
  const [todayCount, setTodayCount] = useState(0);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isIos = useMemo(() => /iphone|ipad|ipod/i.test(navigator.userAgent), []);
  const isAndroid = useMemo(() => /android/i.test(navigator.userAgent), []);

  const applyDashboard = useCallback((scans: RecentScan[], serverCount?: number) => {
    const todaysLocalCount = scans.filter((scan) => isToday(scan.scanned_at)).length;
    setRecentScans(scans.filter((scan) => isToday(scan.scanned_at)).slice(0, 10));
    setTodayCount(Math.max(serverCount ?? 0, todaysLocalCount));
  }, []);

  const loadFromDatabase = useCallback(async (localScans: RecentScan[]) => {
    setRefreshing(true);

    try {
      const rpcResult = await supabase.rpc("driver_get_recent_scans" as never);
      if (!rpcResult.error) {
        const parsed = parseRecentScansPayload(rpcResult.data);
        const merged = mergeScans(parsed.recent, localScans);
        applyDashboard(merged, parsed.todayCount);
        writeRecentScans(merged);
        return;
      }

      const { data, error } = await supabase
        .from("ticket")
        .select("id, seat_number, updated_at, trips(travel_date, departure_time, routes(origin, destination))")
        .eq("status", "used")
        .gte("updated_at", todayStartIso())
        .order("updated_at", { ascending: false })
        .limit(25);

      if (error) {
        applyDashboard(localScans);
        return;
      }

      const serverScans = ((data as TicketScanRow[] | null) ?? []).map(ticketRowToRecentScan);
      const merged = mergeScans(serverScans, localScans);
      applyDashboard(merged);
      writeRecentScans(merged);
    } finally {
      setRefreshing(false);
    }
  }, [applyDashboard]);

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
    const prev = link?.href ?? "";
    if (link) link.href = "/scanner-manifest.json";

    const meta = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
    const prevColor = meta?.content ?? "";
    if (meta) meta.content = "#ffffff";

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const installedHandler = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);

    return () => {
      if (link) link.href = prev;
      if (meta) meta.content = prevColor;
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    supabase
      .from("passenger")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) setDriverName(data.full_name);
      });
  }, [user]);

  useEffect(() => {
    const routeScan = routeState?.lastScan ?? null;
    const localScans = routeScan ? mergeScans([routeScan], readRecentScans()) : readRecentScans();

    writeRecentScans(localScans);
    applyDashboard(localScans);
    void loadFromDatabase(localScans);
  }, [applyDashboard, loadFromDatabase, routeState?.lastScan]);

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
      return;
    }

    setShowInstallHelp(true);
  };

  const handleRefresh = () => {
    const localScans = readRecentScans();
    applyDashboard(localScans);
    void loadFromDatabase(localScans);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/scanner/login");
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950">
      <header className="flex items-center justify-between px-5 pb-4 pt-12">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-orange-100 bg-white shadow-sm">
            <img src="/scanner-icons/icon-96x96.png" alt="QR" className="h-8 w-8 rounded-xl" />
          </div>
          <div>
            <p className="text-base font-extrabold leading-tight">QR Reader</p>
            <p className="text-xs text-slate-500">Welcome, {driverName}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:text-slate-900"
          aria-label="Log out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <main className="flex-1 px-5 pb-8">
        <section className="mt-4 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-orange-100 bg-orange-50 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Today's Boarding</p>
          </div>
          <div className="flex items-end justify-between p-5">
            <div>
              <p className="text-6xl font-black tracking-tight text-slate-950">{todayCount}</p>
              <p className="mt-1 text-sm font-medium text-slate-500">
                {todayCount === 0 ? "No passengers boarded yet" : todayCount === 1 ? "Passenger boarded" : "Passengers boarded"}
              </p>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50">
              <CheckCircle2 className="h-9 w-9 text-green-600" />
            </div>
          </div>
        </section>

        <button
          onClick={() => navigate("/scanner/scan")}
          className="mt-4 flex w-full items-center justify-center gap-3 rounded-3xl bg-orange-500 py-5 text-lg font-extrabold text-white shadow-lg shadow-orange-500/20 transition-all hover:bg-orange-600 active:scale-[0.99]"
        >
          <ScanLine className="h-6 w-6" />
          Start Scanning
        </button>

        {!installed && (
          <button
            onClick={handleInstall}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-white py-4 text-sm font-bold text-orange-600 shadow-sm transition-colors hover:bg-orange-50"
          >
            <Download className="h-4 w-4" />
            {installPrompt ? "Install QR Reader App" : "How to Install QR Reader"}
          </button>
        )}

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-extrabold text-slate-900">Recent Scans</p>
              <p className="text-xs text-slate-500">Latest verified boardings today</p>
            </div>
            <button
              onClick={handleRefresh}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm"
              aria-label="Refresh recent scans"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          {recentScans.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white py-12 text-center shadow-sm">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50">
                <ScanLine className="h-7 w-7 text-orange-500" />
              </div>
              <p className="text-sm font-bold text-slate-700">No scans yet today</p>
              <p className="mt-1 text-xs text-slate-500">Tap Start Scanning to begin</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentScans.map((scan) => (
                <div key={`${scan.ticket_id}-${scan.scanned_at}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-green-50">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {scan.origin} to {scan.destination}
                    </p>
                    <p className="text-xs text-slate-500">
                      {scan.passenger} - Seat #{scan.seat || "-"}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-slate-500">
                    <Clock className="h-3 w-3" />
                    {format(new Date(scan.scanned_at), "h:mm a")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {showInstallHelp && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 backdrop-blur-sm" onClick={() => setShowInstallHelp(false)}>
          <div className="w-full rounded-t-3xl border-t border-slate-200 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-200" />
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50">
                <Smartphone className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-lg font-extrabold text-slate-950">Install QR Reader</p>
                <p className="text-sm text-slate-500">Use your browser install option if the button does not appear.</p>
              </div>
            </div>
            {(isIos
              ? ["Open this page in Safari.", "Tap Share at the bottom.", "Tap Add to Home Screen.", "Tap Add."]
              : isAndroid
                ? ["Open this page in Chrome.", "Tap the three-dot menu.", "Tap Install app or Add to Home screen.", "Confirm Install."]
                : ["Open this page in Chrome or Edge.", "Click the install icon in the address bar, or open the browser menu.", "Choose Install QR Reader or Install app.", "Confirm Install."]
            ).map((text, index) => (
              <div key={text} className="mb-3 flex items-center gap-3">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">{index + 1}</div>
                <p className="text-sm font-medium text-slate-700">{text}</p>
              </div>
            ))}
            <button onClick={() => setShowInstallHelp(false)} className="mt-4 w-full rounded-2xl bg-orange-500 py-3.5 font-bold text-white">
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
