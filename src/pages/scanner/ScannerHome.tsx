import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, XCircle, LogOut, RotateCcw,
  User, MapPin, Calendar, Clock, Armchair, Download
} from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type ScanResult = {
  success: boolean; reason?: string; ticket_id?: string;
  passenger?: string; seat?: number; origin?: string;
  destination?: string; travel_date?: string; departure?: string;
};
type ScanState = "scanning" | "processing" | "success" | "error";

const SCANNER_ID = "qr-scanner-viewport";

export default function ScannerHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const activeRef = useRef(false);

  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [driverName, setDriverName] = useState("Driver");
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  // ── Dynamic manifest swap so scanner is separately installable ──
  useEffect(() => {
    // Swap manifest to QR Reader
    const link = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
    const prev = link?.href ?? "";
    if (link) link.href = "/scanner-manifest.json";

    // Swap theme color
    const meta = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
    const prevTheme = meta?.content ?? "";
    if (meta) meta.content = "#0a0f28";

    // PWA install prompt
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));

    // Check if already in standalone mode
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);

    return () => {
      if (link) link.href = prev;
      if (meta) meta.content = prevTheme;
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  // ── Load driver name ──
  useEffect(() => {
    if (!user) return;
    supabase.from("passenger").select("full_name")
      .eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.full_name) setDriverName(data.full_name); });
  }, [user]);

  // ── Start html5-qrcode scanner ──
  useEffect(() => {
    if (scanState !== "scanning") return;
    activeRef.current = true;

    const scanner = new Html5Qrcode(SCANNER_ID, {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      verbose: false,
    });
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 },
      async (decodedText) => {
        if (!activeRef.current) return;
        activeRef.current = false;
        await stopScanner();
        await processQR(decodedText);
      },
      () => { /* ignore per-frame errors — normal when no QR in frame */ }
    ).catch((err) => {
      console.error("Scanner start error:", err);
    });

    return () => { stopScanner(); };
  }, [scanState]);

  const stopScanner = async () => {
    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
      }
    } catch { /* ignore stop errors */ }
    scannerRef.current = null;
  };

  const processQR = async (qrValue: string) => {
    setScanState("processing");
    if (!qrValue.startsWith("BUSPAY:")) {
      setResult({ success: false, reason: "Not a BusPay ticket — invalid QR code" });
      setScanState("error");
      return;
    }
    try {
      const { data, error } = await supabase.rpc("driver_scan_qr", { p_qr_code: qrValue });
      if (error) throw error;
      const res = data as ScanResult;
      setResult(res);
      if (res.success) setScanCount(c => c + 1);
      setScanState(res.success ? "success" : "error");
    } catch (err: any) {
      setResult({ success: false, reason: err.message ?? "Scan failed. Try again." });
      setScanState("error");
    }
  };

  const handleReset = () => {
    setResult(null);
    setScanState("scanning");
  };

  const handleLogout = async () => {
    await stopScanner();
    await supabase.auth.signOut();
    navigate("/scanner/login");
  };

  const handleInstall = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0f28] text-white select-none">

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <img src="/scanner-icons/icon-96x96.png" alt="QR Reader" className="h-9 w-9 rounded-xl" />
          <div>
            <div className="font-bold text-sm leading-tight">QR Reader</div>
            <div className="text-xs text-slate-400">{driverName} · {scanCount} scanned</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!installed && installPrompt && (
            <button onClick={handleInstall}
              className="flex items-center gap-1.5 rounded-xl bg-orange-500/20 px-3 py-1.5 text-xs font-semibold text-orange-400 hover:bg-orange-500/30">
              <Download className="h-3.5 w-3.5" /> Install
            </button>
          )}
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-6 gap-5">

        {/* Success */}
        {scanState === "success" && result && (
          <div className="w-full max-w-sm animate-fade-in">
            <div className="rounded-3xl border border-green-500/30 bg-slate-900 overflow-hidden">
              <div className="bg-green-500/10 px-6 py-7 text-center">
                <CheckCircle2 className="h-16 w-16 text-green-400 mx-auto mb-3" />
                <h2 className="text-2xl font-extrabold text-green-400">Boarding Confirmed!</h2>
                <p className="text-sm text-slate-400 mt-1">Ticket verified successfully</p>
              </div>
              <div className="p-5 space-y-3">
                <InfoRow icon={<User className="h-4 w-4" />} label="Passenger" value={result.passenger ?? "—"} />
                <InfoRow icon={<Armchair className="h-4 w-4" />} label="Seat" value={`#${result.seat}`} />
                <InfoRow icon={<MapPin className="h-4 w-4" />} label="Route" value={`${result.origin} → ${result.destination}`} />
                <InfoRow icon={<Calendar className="h-4 w-4" />} label="Date"
                  value={result.travel_date ? format(new Date(result.travel_date), "EEE, MMM d yyyy") : "—"} />
                <InfoRow icon={<Clock className="h-4 w-4" />} label="Departure"
                  value={result.departure ? result.departure.slice(0, 5) : "—"} />
              </div>
              <div className="px-5 pb-5">
                <button onClick={handleReset}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-500 py-4 font-bold text-white hover:bg-green-600 transition-colors">
                  Scan Next Passenger
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {scanState === "error" && result && (
          <div className="w-full max-w-sm animate-fade-in">
            <div className="rounded-3xl border border-red-500/30 bg-slate-900 overflow-hidden">
              <div className="bg-red-500/10 px-6 py-7 text-center">
                <XCircle className="h-16 w-16 text-red-400 mx-auto mb-3" />
                <h2 className="text-2xl font-extrabold text-red-400">Scan Failed</h2>
                <p className="mt-2 text-sm text-slate-300 px-4">{result.reason}</p>
              </div>
              <div className="p-5">
                <button onClick={handleReset}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 font-bold text-white hover:bg-orange-600 transition-colors">
                  <RotateCcw className="h-5 w-5" /> Try Again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Processing */}
        {scanState === "processing" && (
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
            <p className="text-slate-400 text-sm">Verifying ticket...</p>
          </div>
        )}

        {/* Camera viewfinder — always rendered so html5-qrcode can attach */}
        <div className={cn("w-full max-w-sm", scanState !== "scanning" && "hidden")}>
          <p className="text-center text-sm text-slate-400 mb-4">
            Point at the passenger's QR code to scan
          </p>
          {/* html5-qrcode attaches to this div by ID */}
          <div id={SCANNER_ID}
            className="overflow-hidden rounded-3xl border-2 border-orange-500/40 bg-slate-900"
            style={{ minHeight: 300 }}
          />
          <p className="mt-3 text-center text-xs text-slate-500">
            Allow camera access when prompted
          </p>
        </div>

        {/* iOS manual install instructions */}
        {!installed && !installPrompt && scanState === "scanning" && (
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
            <p className="text-xs text-slate-400 mb-1 font-semibold">Install QR Reader on iPhone</p>
            <p className="text-xs text-slate-500">Safari → Share (□↑) → Add to Home Screen</p>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10 px-5 py-3 text-center">
        <span className={cn("inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold",
          scanState === "success" ? "bg-green-500/15 text-green-400" :
          scanState === "error"   ? "bg-red-500/15 text-red-400" :
          scanState === "processing" ? "bg-orange-500/15 text-orange-400" :
          "bg-white/5 text-slate-400")}>
          <span className={cn("h-2 w-2 rounded-full",
            scanState === "success" ? "bg-green-400" :
            scanState === "error"   ? "bg-red-400" :
            scanState === "processing" ? "bg-orange-400 animate-pulse" :
            "bg-orange-400 animate-pulse")} />
          {scanState === "success" ? "Boarding Confirmed" :
           scanState === "error"   ? "Scan Failed" :
           scanState === "processing" ? "Verifying..." : "Ready to Scan"}
        </span>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-slate-800 text-orange-400">{icon}</div>
      <div className="flex-1 flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="font-semibold text-white text-sm">{value}</span>
      </div>
    </div>
  );
}
