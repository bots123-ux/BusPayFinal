import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, RotateCcw, User, MapPin, Calendar, Clock, Armchair, ArrowLeft } from "lucide-react";
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
type Phase = "scanning" | "processing" | "result";

const QR_DIV = "bp-qr-reader";

export default function ScannerHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("scanning");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [camError, setCamError] = useState<string | null>(null);

  // Start camera on mount — div is always in DOM
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const scanner = new Html5Qrcode(QR_DIV, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (w, h) => {
              const s = Math.min(w, h) * 0.62;
              return { width: Math.round(s), height: Math.round(s) };
            },
            aspectRatio: window.innerHeight / window.innerWidth,
            disableFlip: false,
          },
          async (decoded) => {
            if (processedRef.current) return;
            processedRef.current = true;
            try { await scanner.stop(); } catch { /* ignore */ }
            await processQR(decoded);
          },
          () => { /* per-frame: no QR found, normal */ }
        );
      } catch (err: any) {
        if (!cancelled) {
          setCamError(
            err?.message?.includes("NotAllowed")
              ? "Camera permission denied. Please allow camera access in your browser settings and reload."
              : "Could not open camera. Make sure you are on HTTPS and the camera is not in use."
          );
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopScanner();
    };
  }, []);

  const stopScanner = async () => {
    try {
      if (scannerRef.current?.isScanning) await scannerRef.current.stop();
    } catch { /* ignore */ }
  };

  const processQR = async (qrValue: string) => {
    setPhase("processing");
    if (!qrValue.startsWith("BUSPAY:")) {
      setResult({ success: false, reason: "Not a valid BusPay ticket QR code" });
      setPhase("result");
      return;
    }
    try {
      const { data, error } = await supabase.rpc("driver_scan_qr", { p_qr_code: qrValue });
      if (error) throw error;
      const res = data as ScanResult;
      setResult(res);
      if (res.success) setScanCount(c => c + 1);
    } catch (err: any) {
      setResult({ success: false, reason: err.message ?? "Scan failed. Please try again." });
    }
    setPhase("result");
  };

  const handleReset = async () => {
    processedRef.current = false;
    setResult(null);
    setPhase("scanning");
    setCamError(null);
    try {
      if (scannerRef.current && !scannerRef.current.isScanning) {
        await scannerRef.current.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (w, h) => {
              const s = Math.min(w, h) * 0.62;
              return { width: Math.round(s), height: Math.round(s) };
            },
            aspectRatio: window.innerHeight / window.innerWidth,
          },
          async (decoded) => {
            if (processedRef.current) return;
            processedRef.current = true;
            try { await scannerRef.current?.stop(); } catch { /* ignore */ }
            await processQR(decoded);
          },
          () => {}
        );
      }
    } catch { /* ignore */ }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#0f0f1a]">

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 pt-12 pb-4"
        style={{ background: "linear-gradient(to bottom, rgba(15,15,26,1) 0%, rgba(15,15,26,0) 100%)" }}>
        <button onClick={() => { stopScanner(); navigate("/scanner"); }}
          className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="text-sm font-bold text-white">Scan Ticket</p>
        {scanCount > 0 ? (
          <div className="flex items-center gap-1.5 rounded-full bg-green-500/20 border border-green-500/30 px-3 py-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            <span className="text-xs font-bold text-green-400">{scanCount}</span>
          </div>
        ) : <div className="w-16" />}
      </div>

      {/* Camera — ALWAYS IN DOM, NEVER HIDDEN */}
      <div id={QR_DIV} className="absolute inset-0 z-0" style={{ background: "#000" }} />

      {/* Scan frame overlay — shown while scanning */}
      {phase === "scanning" && !camError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
          {/* Dark overlay with hole */}
          <div className="absolute inset-0" style={{
            background: "radial-gradient(ellipse 55vw 55vw at center, transparent 0%, rgba(0,0,0,0.65) 100%)"
          }} />
          {/* Corner frame */}
          <div className="relative z-10" style={{ width: "62vw", height: "62vw", maxWidth: 280, maxHeight: 280 }}>
            {[
              "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-2xl",
              "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-2xl",
              "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-2xl",
              "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-2xl",
            ].map((cls, i) => (
              <div key={i} className={`absolute h-8 w-8 border-orange-400 ${cls}`} />
            ))}
            {/* Scan line */}
            <div className="absolute left-1 right-1 h-[2px] rounded-full"
              style={{
                background: "linear-gradient(90deg, transparent, #f97316, transparent)",
                boxShadow: "0 0 8px rgba(249,115,22,0.8)",
                animation: "scanline 2s ease-in-out infinite",
              }} />
          </div>
          <p className="relative z-10 mt-7 text-sm font-medium text-white/80">
            Point camera at passenger QR code
          </p>
        </div>
      )}

      {/* Camera error */}
      {camError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-8">
          <div className="w-full max-w-xs rounded-3xl border border-red-500/30 bg-[#1a1a2e] p-6 text-center">
            <XCircle className="mx-auto mb-3 h-12 w-12 text-red-400" />
            <p className="text-sm text-slate-300 leading-relaxed mb-5">{camError}</p>
            <button onClick={() => { setCamError(null); window.location.reload(); }}
              className="w-full rounded-2xl bg-orange-500 py-3 text-sm font-bold text-white">
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Processing overlay */}
      {phase === "processing" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-orange-500 border-t-transparent mb-4" />
          <p className="text-sm font-semibold text-slate-300">Verifying ticket...</p>
        </div>
      )}

      {/* Result bottom sheet */}
      {phase === "result" && result && (
        <div className="absolute inset-0 z-20 flex items-end bg-black/60 backdrop-blur-[2px]">
          <div className={cn(
            "w-full rounded-t-[2rem] border-t p-6 pb-10",
            result.success
              ? "bg-[#0d1f12] border-green-500/30"
              : "bg-[#1f0d0d] border-red-500/30"
          )}>
            <div className="mx-auto mb-5 h-1 w-12 rounded-full bg-white/15" />
            {result.success ? (
              <>
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-green-500/20">
                    <CheckCircle2 className="h-8 w-8 text-green-400" />
                  </div>
                  <div>
                    <p className="text-xl font-extrabold text-green-400">Boarding Confirmed!</p>
                    <p className="text-xs text-slate-400 mt-0.5">Ticket verified successfully</p>
                  </div>
                </div>
                <div className="mb-5 space-y-3 rounded-2xl bg-white/5 border border-white/5 p-4">
                  <InfoRow icon={<User className="h-3.5 w-3.5" />}   label="Passenger"  value={result.passenger ?? "—"} />
                  <InfoRow icon={<Armchair className="h-3.5 w-3.5" />} label="Seat"      value={`Seat #${result.seat}`} />
                  <InfoRow icon={<MapPin className="h-3.5 w-3.5" />}  label="Route"      value={`${result.origin} → ${result.destination}`} />
                  <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Date"
                    value={result.travel_date ? format(new Date(result.travel_date), "EEE, MMM d") : "—"} />
                  <InfoRow icon={<Clock className="h-3.5 w-3.5" />}   label="Departure"  value={result.departure?.slice(0, 5) ?? "—"} />
                </div>
                <button onClick={handleReset}
                  className="w-full rounded-2xl bg-green-500 py-4 text-sm font-bold text-white hover:bg-green-600 active:scale-[0.98] transition-all">
                  Scan Next Passenger
                </button>
              </>
            ) : (
              <>
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-red-500/20">
                    <XCircle className="h-8 w-8 text-red-400" />
                  </div>
                  <div>
                    <p className="text-xl font-extrabold text-red-400">Scan Failed</p>
                    <p className="text-xs text-slate-400 mt-0.5">Could not verify this ticket</p>
                  </div>
                </div>
                <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                  <p className="text-sm text-red-300 text-center">{result.reason}</p>
                </div>
                <button onClick={handleReset}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 text-sm font-bold text-white hover:bg-orange-600 active:scale-[0.98] transition-all">
                  <RotateCcw className="h-4 w-4" /> Try Again
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bottom status pill */}
      <div className="absolute bottom-8 left-0 right-0 z-10 flex justify-center pointer-events-none">
        <div className={cn(
          "flex items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold border backdrop-blur-md",
          camError ? "bg-red-500/20 border-red-500/30 text-red-300" :
          phase === "processing" ? "bg-orange-500/20 border-orange-500/30 text-orange-300" :
          phase === "result" && result?.success ? "bg-green-500/20 border-green-500/30 text-green-300" :
          phase === "result" ? "bg-red-500/20 border-red-500/30 text-red-300" :
          "bg-black/40 border-white/10 text-slate-300"
        )}>
          <span className={cn("h-2 w-2 rounded-full",
            camError ? "bg-red-400" :
            phase === "processing" ? "bg-orange-400 animate-pulse" :
            phase === "result" && result?.success ? "bg-green-400" :
            phase === "result" ? "bg-red-400" :
            "bg-orange-400 animate-pulse")} />
          {camError ? "Camera Error" :
           phase === "scanning" ? "Ready to Scan" :
           phase === "processing" ? "Verifying..." :
           result?.success ? "Boarding Confirmed" : "Scan Failed"}
        </div>
      </div>

      <style>{`
        @keyframes scanline {
          0%   { top: 6%;  opacity: 1; }
          48%  { opacity: 1; }
          50%  { top: 88%; opacity: 0.5; }
          52%  { opacity: 1; }
          100% { top: 6%;  opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-slate-400 flex-shrink-0">
        <span className="text-orange-400">{icon}</span>
        <span className="text-xs">{label}</span>
      </div>
      <span className="text-sm font-semibold text-white text-right truncate">{value}</span>
    </div>
  );
}
