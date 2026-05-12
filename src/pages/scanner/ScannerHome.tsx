import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, RotateCcw, User, MapPin, Calendar, Clock, Armchair, ArrowLeft } from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats, type Html5QrcodeCameraScanConfig } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type ScanResult = {
  success: boolean;
  reason?: string;
  ticket_id?: string;
  passenger?: string;
  seat?: number;
  origin?: string;
  destination?: string;
  travel_date?: string;
  departure?: string;
};

type Phase = "scanning" | "processing" | "result";

type ScanPayload = Record<string, unknown>;

type TicketDetailsRow = {
  id?: string;
  user_id?: string | null;
  seat_number?: number | null;
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

const QR_DIV = "bp-qr-reader";

const SCAN_CONFIG: Html5QrcodeCameraScanConfig = {
  fps: 12,
  qrbox: (width, height) => {
    const shortestSide = Math.min(width, height);
    const size = Math.min(Math.max(shortestSide * 0.68, 180), 320);
    return { width: Math.round(size), height: Math.round(size) };
  },
  disableFlip: false,
};

function firstRelation<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function isPermissionDenied(error: unknown) {
  const message = String((error as { message?: string })?.message ?? error ?? "");
  return /notallowed|permission|permissions policy|denied/i.test(message);
}

function getCameraErrorMessage(error: unknown) {
  const message = String((error as { message?: string })?.message ?? error ?? "");

  if (/permissions policy|camera is not allowed/i.test(message)) {
    return "Camera access is blocked by the site security policy. Redeploy with the updated Vercel headers and reload.";
  }

  if (isPermissionDenied(error)) {
    return "Camera permission denied. Please allow camera access in your browser settings and reload.";
  }

  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    return "Camera access requires HTTPS. Open the scanner from your secure website URL.";
  }

  return "Could not open camera. Make sure the camera is not in use, then reload the scanner.";
}

function isMissingDriverScanRpc(error: unknown) {
  const err = error as { code?: string; message?: string; details?: string };
  const text = `${err?.message ?? ""} ${err?.details ?? ""}`;
  return err?.code === "PGRST202" || /driver_scan_qr|could not find.*function|function .* does not exist/i.test(text);
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

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return "Scan failed. Please try again.";
}

function normalizeScanResult(payload: unknown): ScanResult {
  const record = asPayload(payload);
  const seat = record.seat ?? record.seat_number;

  return {
    success: Boolean(record.success ?? record.valid),
    reason: stringValue(record.reason),
    ticket_id: stringValue(record.ticket_id),
    passenger: stringValue(record.passenger) ?? stringValue(record.user_name),
    seat: numberValue(seat),
    origin: stringValue(record.origin),
    destination: stringValue(record.destination),
    travel_date: stringValue(record.travel_date),
    departure: stringValue(record.departure) ?? stringValue(record.departure_time),
  };
}

export default function ScannerHome() {
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processedRef = useRef(false);
  const mountedRef = useRef(false);
  const startingRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("scanning");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [camError, setCamError] = useState<string | null>(null);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;

    try {
      if (scanner.isScanning) await scanner.stop();
    } catch {
      // The library can throw if the browser already closed the stream.
    }
  }, []);

  const loadTicketDetails = useCallback(async (ticketId: string): Promise<Partial<ScanResult>> => {
    const { data } = await supabase
      .from("ticket")
      .select("id, user_id, seat_number, status, trips(travel_date, departure_time, routes(origin, destination))")
      .eq("id", ticketId)
      .maybeSingle();

    const ticket = data as TicketDetailsRow | null;
    const trip = firstRelation(ticket?.trips);
    const route = firstRelation(trip?.routes);

    let passengerName: string | undefined;
    if (ticket?.user_id) {
      const { data: passenger } = await supabase
        .from("passenger")
        .select("full_name")
        .eq("user_id", ticket.user_id)
        .maybeSingle();
      passengerName = passenger?.full_name ?? undefined;
    }

    return {
      ticket_id: ticket?.id ?? ticketId,
      passenger: passengerName,
      seat: ticket?.seat_number ?? undefined,
      origin: route?.origin ?? undefined,
      destination: route?.destination ?? undefined,
      travel_date: trip?.travel_date ?? undefined,
      departure: trip?.departure_time ?? undefined,
    };
  }, []);

  const scanWithValidation = useCallback(async (qrValue: string): Promise<ScanResult> => {
    const driverScan = await supabase.rpc("driver_scan_qr" as never, { p_qr_code: qrValue } as never);

    if (!driverScan.error) {
      return normalizeScanResult(driverScan.data);
    }

    if (!isMissingDriverScanRpc(driverScan.error)) {
      throw driverScan.error;
    }

    const { data, error } = await supabase.rpc("validate_ticket_qr" as never, { p_qr_code: qrValue } as never);
    if (error) throw error;

    const validation = normalizeScanResult(data);
    if (!validation.success) return validation;

    if (asPayload(data).status === "used") {
      return { success: false, reason: "Ticket has already been used", ticket_id: validation.ticket_id };
    }

    if (!validation.ticket_id) {
      return { success: false, reason: "Ticket validated, but no ticket id was returned." };
    }

    const details = await loadTicketDetails(validation.ticket_id);

    await supabase
      .from("ticket")
      .update({ status: "used" } as never)
      .eq("id", validation.ticket_id)
      .eq("status", "paid");

    return {
      success: true,
      ...details,
      ticket_id: validation.ticket_id,
    };
  }, [loadTicketDetails]);

  const processQR = useCallback(async (rawValue: string) => {
    const qrValue = rawValue.trim();

    setPhase("processing");

    if (!qrValue.startsWith("BUSPAY:")) {
      setResult({ success: false, reason: "Not a valid BusPay ticket QR code" });
      setPhase("result");
      return;
    }

    try {
      const scanResult = await scanWithValidation(qrValue);
      if (!mountedRef.current) return;

      setResult(scanResult);
      if (scanResult.success) setScanCount((count) => count + 1);
    } catch (err) {
      if (!mountedRef.current) return;
      setResult({ success: false, reason: errorMessage(err) });
    }

    if (mountedRef.current) setPhase("result");
  }, [scanWithValidation]);

  const startScanner = useCallback(async () => {
    if (startingRef.current || scannerRef.current?.isScanning) return;

    startingRef.current = true;
    setCamError(null);

    const onDecoded = async (decodedText: string) => {
      if (processedRef.current) return;
      processedRef.current = true;
      await stopScanner();
      await processQR(decodedText);
    };

    try {
      let scanner = scannerRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode(QR_DIV, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        scannerRef.current = scanner;
      }

      try {
        await scanner.start({ facingMode: "environment" }, SCAN_CONFIG, onDecoded, () => undefined);
      } catch (primaryError) {
        if (isPermissionDenied(primaryError)) throw primaryError;

        const cameras = await Html5Qrcode.getCameras().catch(() => []);
        const fallbackCamera = cameras.find((camera) => /back|rear|environment/i.test(camera.label)) ?? cameras[0];
        if (!fallbackCamera) throw primaryError;

        await scanner.start(fallbackCamera.id, SCAN_CONFIG, onDecoded, () => undefined);
      }
    } catch (err) {
      if (mountedRef.current) setCamError(getCameraErrorMessage(err));
    } finally {
      startingRef.current = false;
    }
  }, [processQR, stopScanner]);

  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(startScanner, 250);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(timer);
      stopScanner().finally(() => {
        try {
          scannerRef.current?.clear();
        } catch {
          // Nothing to clean if the scanner never finished mounting.
        }
        scannerRef.current = null;
      });
    };
  }, [startScanner, stopScanner]);

  const handleReset = async () => {
    processedRef.current = false;
    setResult(null);
    setPhase("scanning");
    await startScanner();
  };

  const handleBack = async () => {
    await stopScanner();
    navigate("/scanner");
  };

  const routeText = result?.origin && result?.destination ? `${result.origin} -> ${result.destination}` : "-";
  const travelDateText = result?.travel_date ? format(new Date(result.travel_date), "EEE, MMM d") : "-";
  const seatText = typeof result?.seat === "number" ? `Seat #${result.seat}` : "-";

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#0f0f1a]">
      <div
        className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-5 pb-4 pt-12"
        style={{ background: "linear-gradient(to bottom, rgba(15,15,26,1) 0%, rgba(15,15,26,0) 100%)" }}
      >
        <button onClick={handleBack} className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="text-sm font-bold text-white">Scan Ticket</p>
        {scanCount > 0 ? (
          <div className="flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/20 px-3 py-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            <span className="text-xs font-bold text-green-400">{scanCount}</span>
          </div>
        ) : (
          <div className="w-16" />
        )}
      </div>

      <div id={QR_DIV} className="absolute inset-0 z-0 bg-black" />

      {phase === "scanning" && !camError && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(ellipse 55vw 55vw at center, transparent 0%, rgba(0,0,0,0.65) 100%)" }}
          />
          <div className="relative z-10" style={{ width: "62vw", height: "62vw", maxWidth: 280, maxHeight: 280 }}>
            {[
              "left-0 top-0 rounded-tl-2xl border-l-[3px] border-t-[3px]",
              "right-0 top-0 rounded-tr-2xl border-r-[3px] border-t-[3px]",
              "bottom-0 left-0 rounded-bl-2xl border-b-[3px] border-l-[3px]",
              "bottom-0 right-0 rounded-br-2xl border-b-[3px] border-r-[3px]",
            ].map((cls) => (
              <div key={cls} className={`absolute h-8 w-8 border-orange-400 ${cls}`} />
            ))}
            <div
              className="absolute left-1 right-1 h-[2px] rounded-full"
              style={{
                background: "linear-gradient(90deg, transparent, #f97316, transparent)",
                boxShadow: "0 0 8px rgba(249,115,22,0.8)",
                animation: "scanline 2s ease-in-out infinite",
              }}
            />
          </div>
          <p className="relative z-10 mt-7 text-sm font-medium text-white/80">Point camera at passenger QR code</p>
        </div>
      )}

      {camError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-8">
          <div className="w-full max-w-xs rounded-3xl border border-red-500/30 bg-[#1a1a2e] p-6 text-center">
            <XCircle className="mx-auto mb-3 h-12 w-12 text-red-400" />
            <p className="mb-5 text-sm leading-relaxed text-slate-300">{camError}</p>
            <button onClick={() => void handleReset()} className="w-full rounded-2xl bg-orange-500 py-3 text-sm font-bold text-white">
              Retry
            </button>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mb-4 h-16 w-16 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
          <p className="text-sm font-semibold text-slate-300">Verifying ticket...</p>
        </div>
      )}

      {phase === "result" && result && (
        <div className="absolute inset-0 z-20 flex items-end bg-black/60 backdrop-blur-[2px]">
          <div
            className={cn(
              "w-full rounded-t-[2rem] border-t p-6 pb-10",
              result.success ? "border-green-500/30 bg-[#0d1f12]" : "border-red-500/30 bg-[#1f0d0d]",
            )}
          >
            <div className="mx-auto mb-5 h-1 w-12 rounded-full bg-white/15" />
            {result.success ? (
              <>
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-green-500/20">
                    <CheckCircle2 className="h-8 w-8 text-green-400" />
                  </div>
                  <div>
                    <p className="text-xl font-extrabold text-green-400">Boarding Confirmed!</p>
                    <p className="mt-0.5 text-xs text-slate-400">Ticket verified successfully</p>
                  </div>
                </div>
                <div className="mb-5 space-y-3 rounded-2xl border border-white/5 bg-white/5 p-4">
                  <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Passenger" value={result.passenger ?? "-"} />
                  <InfoRow icon={<Armchair className="h-3.5 w-3.5" />} label="Seat" value={seatText} />
                  <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Route" value={routeText} />
                  <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="Date" value={travelDateText} />
                  <InfoRow icon={<Clock className="h-3.5 w-3.5" />} label="Departure" value={result.departure?.slice(0, 5) ?? "-"} />
                </div>
                <button
                  onClick={() => void handleReset()}
                  className="w-full rounded-2xl bg-green-500 py-4 text-sm font-bold text-white transition-all hover:bg-green-600 active:scale-[0.98]"
                >
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
                    <p className="mt-0.5 text-xs text-slate-400">Could not verify this ticket</p>
                  </div>
                </div>
                <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                  <p className="text-center text-sm text-red-300">{result.reason}</p>
                </div>
                <button
                  onClick={() => void handleReset()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 text-sm font-bold text-white transition-all hover:bg-orange-600 active:scale-[0.98]"
                >
                  <RotateCcw className="h-4 w-4" /> Try Again
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-8 left-0 right-0 z-10 flex justify-center">
        <div
          className={cn(
            "flex items-center gap-2 rounded-full border px-5 py-2 text-xs font-semibold backdrop-blur-md",
            camError
              ? "border-red-500/30 bg-red-500/20 text-red-300"
              : phase === "processing"
                ? "border-orange-500/30 bg-orange-500/20 text-orange-300"
                : phase === "result" && result?.success
                  ? "border-green-500/30 bg-green-500/20 text-green-300"
                  : phase === "result"
                    ? "border-red-500/30 bg-red-500/20 text-red-300"
                    : "border-white/10 bg-black/40 text-slate-300",
          )}
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              camError
                ? "bg-red-400"
                : phase === "processing"
                  ? "animate-pulse bg-orange-400"
                  : phase === "result" && result?.success
                    ? "bg-green-400"
                    : phase === "result"
                      ? "bg-red-400"
                      : "animate-pulse bg-orange-400",
            )}
          />
          {camError
            ? "Camera Error"
            : phase === "scanning"
              ? "Ready to Scan"
              : phase === "processing"
                ? "Verifying..."
                : result?.success
                  ? "Boarding Confirmed"
                  : "Scan Failed"}
        </div>
      </div>

      <style>{`
        #${QR_DIV},
        #${QR_DIV} > div,
        #${QR_DIV} video {
          width: 100% !important;
          height: 100% !important;
        }

        #${QR_DIV} video {
          object-fit: cover !important;
        }

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

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-shrink-0 items-center gap-2 text-slate-400">
        <span className="text-orange-400">{icon}</span>
        <span className="text-xs">{label}</span>
      </div>
      <span className="truncate text-right text-sm font-semibold text-white">{value}</span>
    </div>
  );
}
