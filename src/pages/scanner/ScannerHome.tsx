import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, XCircle, RotateCcw,
  User, MapPin, Calendar, Clock, Armchair, ArrowLeft
} from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type ScanResult = {
  success: boolean; reason?: string;
  passenger?: string; seat?: number;
  origin?: string; destination?: string;
  travel_date?: string; departure?: string;
};
type Phase = "scanning" | "processing" | "result";

const QR_DIV = "bp-qr-reader";

export default function ScannerHome() {
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("scanning");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [camError, setCamError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => { if (!cancelled) startCamera(); }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      safeStop();
    };
  }, []);

  const startCamera = async () => {
    try {
      const scanner = new Html5Qrcode(QR_DIV, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;

      const onDecode = async (decoded: string) => {
        if (processedRef.current) return;
        processedRef.current = true;
        await safeStop();
        await processQR(decoded);
      };

      // No qrbox = scans full frame. No aspectRatio = works on all devices.
      const config = {
        fps: 10,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      };

      try {
        await scanner.start({ facingMode: "environment" }, config, onDecode, () => {});
      } catch {
        await scanner.start(true, config, onDecode, () => {});
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (msg.toLowerCase().includes("notallowed") || msg.toLowerCase().includes("permission")) {
        setCamError("Camera permission denied. Tap the lock icon in your browser address bar, enable camera, then reload.");
      } else {
        setCamError(`Camera error: ${msg}.\n\nTry: allow camera permission, close other apps using camera, or switch to Chrome.`);
      }
    }
  };

  const safeStop = async () => {
    try {
      if (scannerRef.current?.isScanning) await scannerRef.current.stop();
    } catch { /* ignore */ }
  };

  const processQR = async (qrValue: string) => {
    setPhase("processing");
    if (!qrValue.startsWith("BUSPAY:")) {
      setResult({ success: false, reason: "Not a valid BusPay ticket QR code." });
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
    setCamError(null);
    setPhase("scanning");
    if (scannerRef.current && !scannerRef.current.isScanning) {
      const config = { fps: 10, experimentalFeatures: { useBarCodeDetectorIfSupported: true } };
      const onDecode = async (decoded: string) => {
        if (processedRef.current) return;
        processedRef.current = true;
        await safeStop();
        await processQR(decoded);
      };
      try {
        await scannerRef.current.start({ facingMode: "environment" }, config, onDecode, () => {});
      } catch {
        try { await scannerRef.current.start(true, config, onDecode, () => {}); }
        catch (err: any) { setCamError(`Could not restart: ${err?.message}`); }
      }
    }
  };

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black">

      {/* ── Critical CSS: hide html5-qrcode's own injected white UI ── */}
      <style>{`
        #${QR_DIV} { background: #000 !important; }
        #${QR_DIV} > div { background: transparent !important; border: none !important; }
        #${QR_DIV}__header_message { display: none !important; }
        #${QR_DIV}__status_span    { display: none !important; }
        #${QR_DIV}__dashboard      { display: none !important; }
        #${QR_DIV}__scan_region {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          border: none !important;
        }
        #${QR_DIV}__scan_region video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
        #${QR_DIV}__scan_region img { display: none !important; }
        @keyframes scanline {
          0%   { top: 10%; }
          50%  { top: 80%; }
          100% { top: 10%; }
        }
      `}</style>

      {/* Camera viewport — ALWAYS in DOM, NEVER hidden or display:none */}
      <div id={QR_DIV} className="absolute inset-0 z-0" />

      {/* Dark vignette so UI elements are readable over camera */}
      <div className="absolute inset-0 z-10 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 70% 60% at 50% 45%, transparent 0%, rgba(0,0,0,0.55) 100%)" }} />

      {/* Top gradient so header is readable */}
      <div className="absolute top-0 left-0 right-0 h-36 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)" }} />

      {/* Bottom gradient so status pill is readable */}
      <div className="absolute bottom-0 left-0 right-0 h-40 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)" }} />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 pt-12 pb-4">
        <button onClick={() => { safeStop(); navigate("/scanner"); }}
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-black/40 text-white backdrop-blur-sm">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="rounded-full border border-white/20 bg-black/40 px-5 py-2 text-sm font-bold text-white backdrop-blur-sm">
          Scan Ticket
        </span>
        {scanCount > 0
          ? <div className="flex items-center gap-1.5 rounded-full border border-green-400/40 bg-black/40 px-3 py-2 backdrop-blur-sm">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              <span className="text-xs font-bold text-green-400">{scanCount}</span>
            </div>
          : <div className="w-10" />
        }
      </div>

      {/* Scan frame overlay — decorative corners */}
      {phase === "scanning" && !camError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
          <div className="relative" style={{ width: 260, height: 260 }}>
            {/* Corner markers */}
            {[
              "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-2xl",
              "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-2xl",
              "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-2xl",
              "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-2xl",
            ].map((cls, i) => (
              <div key={i} className={`absolute h-9 w-9 border-orange-400 ${cls}`} />
            ))}
            {/* Animated scan line */}
            <div className="absolute left-3 right-3 h-[2px] rounded-full"
              style={{
                background: "linear-gradient(90deg, transparent, #f97316 30%, #f97316 70%, transparent)",
                boxShadow: "0 0 12px rgba(249,115,22,1)",
                animation: "scanline 2s ease-in-out infinite",
              }} />
          </div>
          <p className="mt-5 rounded-full border border-white/20 bg-black/40 px-4 py-2 text-xs font-medium text-white backdrop-blur-sm">
            Point camera at passenger QR code
          </p>
        </div>
      )}

      {/* Camera error */}
      {camError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 px-6">
          <div className="w-full max-w-xs rounded-3xl border border-red-500/30 bg-[#1a1a2e] p-6 text-center">
            <XCircle className="mx-auto mb-3 h-14 w-14 text-red-400" />
            <p className="mb-5 whitespace-pre-line text-sm leading-relaxed text-slate-300">{camError}</p>
            <button onClick={() => { setCamError(null); startCamera(); }}
              className="w-full rounded-2xl bg-orange-500 py-3.5 text-sm font-bold text-white hover:bg-orange-600 active:scale-95 transition-all">
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Processing overlay */}
      {phase === "processing" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 gap-5">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
          <p className="text-sm font-semibold text-slate-300">Verifying ticket...</p>
        </div>
      )}

      {/* Result bottom sheet */}
      {phase === "result" && result && (
        <div className="absolute inset-0 z-30 flex items-end">
          {/* Semi-transparent backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className={cn(
            "relative w-full rounded-t-[2rem] border-t pb-12 p-6",
            result.success ? "bg-[#0a1f10] border-green-500/40" : "bg-[#1f0a0a] border-red-500/40"
          )}>
            <div className="mx-auto mb-5 h-1 w-14 rounded-full bg-white/20" />

            {result.success ? (
              <>
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-green-500/25 border border-green-500/30">
                    <CheckCircle2 className="h-8 w-8 text-green-400" />
                  </div>
                  <div>
                    <p className="text-xl font-extrabold text-green-400">Boarding Confirmed!</p>
                    <p className="text-xs text-slate-400 mt-0.5">Ticket verified successfully</p>
                  </div>
                </div>
                <div className="mb-5 space-y-3 rounded-2xl border border-white/5 bg-white/5 p-4">
                  <Row icon={<User className="h-3.5 w-3.5"/>}     label="Passenger" value={result.passenger ?? "—"} />
                  <Row icon={<Armchair className="h-3.5 w-3.5"/>} label="Seat"      value={`Seat #${result.seat}`} />
                  <Row icon={<MapPin className="h-3.5 w-3.5"/>}   label="Route"     value={`${result.origin} → ${result.destination}`} />
                  <Row icon={<Calendar className="h-3.5 w-3.5"/>} label="Date"
                    value={result.travel_date ? format(new Date(result.travel_date), "EEE, MMM d") : "—"} />
                  <Row icon={<Clock className="h-3.5 w-3.5"/>}    label="Departure" value={result.departure?.slice(0,5) ?? "—"} />
                </div>
                <button onClick={handleReset}
                  className="w-full rounded-2xl bg-green-500 py-4 text-sm font-bold text-white hover:bg-green-600 active:scale-[0.98] transition-all">
                  Scan Next Passenger
                </button>
              </>
            ) : (
              <>
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-red-500/25 border border-red-500/30">
                    <XCircle className="h-8 w-8 text-red-400" />
                  </div>
                  <div>
                    <p className="text-xl font-extrabold text-red-400">Scan Failed</p>
                    <p className="text-xs text-slate-400 mt-0.5">Could not verify this ticket</p>
                  </div>
                </div>
                <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                  <p className="text-sm text-red-300 text-center leading-relaxed">{result.reason}</p>
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

      {/* Status pill */}
      {phase === "scanning" && !camError && (
        <div className="absolute bottom-10 left-0 right-0 z-20 flex justify-center pointer-events-none">
          <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/50 px-5 py-2.5 text-xs font-semibold text-white backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
            Ready to Scan
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-slate-400 flex-shrink-0">
        <span className="text-orange-400">{icon}</span>
        <span className="text-xs">{label}</span>
      </div>
      <span className="text-sm font-semibold text-white text-right truncate max-w-[190px]">{value}</span>
    </div>
  );
}
