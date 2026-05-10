import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ScanLine, CheckCircle2, XCircle, LogOut, RotateCcw, User, MapPin, Calendar, Clock, Armchair } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ScanResult = {
  success: boolean;
  reason?: string;
  ticket_id?: string;
  passenger?: string;
  email?: string;
  seat?: number;
  origin?: string;
  destination?: string;
  travel_date?: string;
  departure?: string;
  boarded_at?: string;
};

type ScanState = "idle" | "scanning" | "success" | "error";

export default function ScannerHome() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const processingRef = useRef(false);

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [driverName, setDriverName] = useState("Driver");

  useEffect(() => {
    supabase.from("passenger").select("full_name").eq("user_id", (supabase.auth as any)._currentSession?.user?.id ?? "")
      .maybeSingle().then(({ data }) => { if (data?.full_name) setDriverName(data.full_name); });
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setScanState("scanning");
        startScanning();
      }
    } catch (err: any) {
      setCameraError("Camera access denied. Please allow camera permissions and reload.");
    }
  };

  const stopCamera = () => {
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const startScanning = () => {
    const scan = async () => {
      if (!videoRef.current || !canvasRef.current || processingRef.current) {
        animFrameRef.current = requestAnimationFrame(scan);
        return;
      }
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        animFrameRef.current = requestAnimationFrame(scan);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { animFrameRef.current = requestAnimationFrame(scan); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Try native BarcodeDetector API (Android Chrome, Samsung Browser)
      if ("BarcodeDetector" in window) {
        try {
          const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
          const barcodes = await detector.detect(canvas);
          if (barcodes.length > 0) {
            await processQR(barcodes[0].rawValue);
            return;
          }
        } catch { /* fallback below */ }
      }

      // Fallback: try jsQR via dynamic import (if available in bundle)
      try {
        const jsQR = (await import("jsqr")).default;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        if (code) {
          await processQR(code.data);
          return;
        }
      } catch { /* jsQR not available */ }

      animFrameRef.current = requestAnimationFrame(scan);
    };
    animFrameRef.current = requestAnimationFrame(scan);
  };

  const processQR = useCallback(async (qrValue: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    cancelAnimationFrame(animFrameRef.current);

    setScanState("scanning");

    // Only process BUSPAY QR codes
    if (!qrValue.startsWith("BUSPAY:")) {
      setResult({ success: false, reason: "Not a BusPay ticket QR code" });
      setScanState("error");
      processingRef.current = false;
      return;
    }

    try {
      const { data, error } = await supabase.rpc("driver_scan_qr", { p_qr_code: qrValue });
      if (error) throw error;
      const res = data as ScanResult;
      setResult(res);
      setScanState(res.success ? "success" : "error");
      if (res.success) setScanCount(c => c + 1);
    } catch (err: any) {
      setResult({ success: false, reason: err.message ?? "Scan failed" });
      setScanState("error");
    }
    processingRef.current = false;
  }, []);

  const handleReset = () => {
    setResult(null);
    setScanState("scanning");
    processingRef.current = false;
    startScanning();
  };

  const handleLogout = async () => {
    stopCamera();
    await supabase.auth.signOut();
    navigate("/scanner/login");
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <img src="/scanner-icons/icon-96x96.png" alt="Scanner" className="h-8 w-8 rounded-xl" />
          <div>
            <div className="font-bold text-sm">BusPay Scanner</div>
            <div className="text-xs text-slate-400">{driverName} · {scanCount} scanned today</div>
          </div>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors">
          <LogOut className="h-3.5 w-3.5" /> Logout
        </button>
      </header>

      {/* Camera / Result area */}
      <div className="relative flex-1 flex flex-col items-center justify-center">
        {cameraError ? (
          <div className="flex flex-col items-center gap-4 px-8 text-center">
            <XCircle className="h-16 w-16 text-red-400" />
            <p className="text-slate-300">{cameraError}</p>
            <button onClick={() => { setCameraError(null); startCamera(); }}
              className="rounded-2xl bg-orange-500 px-6 py-3 font-bold text-white hover:bg-orange-600">
              Retry Camera
            </button>
          </div>
        ) : scanState === "success" && result ? (
          <SuccessCard result={result} onReset={handleReset} />
        ) : scanState === "error" && result ? (
          <ErrorCard result={result} onReset={handleReset} />
        ) : (
          <div className="relative w-full max-w-sm mx-auto px-5">
            {/* Video */}
            <div className="relative overflow-hidden rounded-3xl border-2 border-slate-700 bg-slate-900 aspect-square">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
              <canvas ref={canvasRef} className="hidden" />

              {/* Scan overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative h-56 w-56">
                  {/* Corner markers */}
                  {[
                    "top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl",
                    "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
                    "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
                    "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl",
                  ].map((cls, i) => (
                    <div key={i} className={`absolute h-10 w-10 border-orange-500 ${cls}`} />
                  ))}
                  {/* Animated scan line */}
                  <div className="absolute left-0 right-0 h-0.5 bg-orange-500 opacity-80 animate-scan-line" />
                </div>
              </div>
            </div>
            <p className="mt-4 text-center text-sm text-slate-400">
              Point the camera at the passenger's QR code
            </p>
          </div>
        )}
      </div>

      {/* Bottom status bar */}
      <div className="border-t border-slate-800 px-5 py-4 text-center">
        <div className={cn("inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold",
          scanState === "success" ? "bg-green-500/15 text-green-400" :
          scanState === "error"   ? "bg-red-500/15 text-red-400" :
          "bg-slate-800 text-slate-400")}>
          <ScanLine className="h-4 w-4" />
          {scanState === "success" ? "Boarding Confirmed" :
           scanState === "error"   ? "Scan Failed" :
           "Ready to Scan"}
        </div>
      </div>

      <style>{`
        @keyframes scan-line {
          0%   { top: 10%; }
          50%  { top: 85%; }
          100% { top: 10%; }
        }
        .animate-scan-line { animation: scan-line 2s linear infinite; position: absolute; }
      `}</style>
    </div>
  );
}

function SuccessCard({ result, onReset }: { result: ScanResult; onReset: () => void }) {
  return (
    <div className="w-full max-w-sm mx-auto px-5 animate-fade-in">
      <div className="rounded-3xl border border-green-500/30 bg-slate-900 overflow-hidden">
        {/* Green header */}
        <div className="bg-green-500/10 px-6 py-6 text-center border-b border-green-500/20">
          <CheckCircle2 className="h-16 w-16 text-green-400 mx-auto mb-3" />
          <h2 className="text-2xl font-extrabold text-green-400">Boarding Confirmed!</h2>
          <p className="text-sm text-slate-400 mt-1">Ticket verified successfully</p>
        </div>
        {/* Passenger info */}
        <div className="p-6 space-y-3">
          <InfoRow icon={<User className="h-4 w-4" />} label="Passenger" value={result.passenger ?? "—"} />
          <InfoRow icon={<Armchair className="h-4 w-4" />} label="Seat" value={`#${result.seat}`} />
          <InfoRow icon={<MapPin className="h-4 w-4" />} label="Route" value={`${result.origin} → ${result.destination}`} />
          <InfoRow icon={<Calendar className="h-4 w-4" />} label="Date"
            value={result.travel_date ? format(new Date(result.travel_date), "EEE, MMM d yyyy") : "—"} />
          <InfoRow icon={<Clock className="h-4 w-4" />} label="Departure"
            value={result.departure ? result.departure.slice(0, 5) : "—"} />
        </div>
        <div className="px-6 pb-6">
          <button onClick={onReset}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-500 py-4 font-bold text-white hover:bg-green-600 transition-colors">
            <ScanLine className="h-5 w-5" /> Scan Next Passenger
          </button>
        </div>
      </div>
    </div>
  );
}

function ErrorCard({ result, onReset }: { result: ScanResult; onReset: () => void }) {
  return (
    <div className="w-full max-w-sm mx-auto px-5 animate-fade-in">
      <div className="rounded-3xl border border-red-500/30 bg-slate-900 overflow-hidden">
        <div className="bg-red-500/10 px-6 py-8 text-center border-b border-red-500/20">
          <XCircle className="h-16 w-16 text-red-400 mx-auto mb-3" />
          <h2 className="text-2xl font-extrabold text-red-400">Scan Failed</h2>
          <p className="mt-2 text-sm text-slate-300 px-4">{result.reason ?? "Unknown error"}</p>
        </div>
        <div className="p-6">
          <button onClick={onReset}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 font-bold text-white hover:bg-orange-600 transition-colors">
            <RotateCcw className="h-5 w-5" /> Try Again
          </button>
        </div>
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
        <span className="font-semibold text-white">{value}</span>
      </div>
    </div>
  );
}
