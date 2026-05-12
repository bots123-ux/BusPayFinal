import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats, type Html5QrcodeCameraScanConfig } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
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
  scanned_at?: string;
};

type RecentScan = {
  ticket_id: string;
  passenger: string;
  origin: string;
  destination: string;
  seat: number;
  scanned_at: string;
};

type Phase = "scanning" | "processing" | "failed";
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
const RECENT_SCANS_KEY = "buspay:scanner:recent-scans";

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

  return "Could not open camera. Make sure the camera is not in use, then try again.";
}

function isMissingRpc(error: unknown, functionName: string) {
  const err = error as { code?: string; message?: string; details?: string };
  const text = `${err?.message ?? ""} ${err?.details ?? ""}`;
  return err?.code === "PGRST202" || text.includes(functionName) || /could not find.*function|function .* does not exist/i.test(text);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return "Scan failed. Please try again.";
}

function extractTicketId(qrValue: string) {
  const [, ticketId] = qrValue.split("BUSPAY:");
  return ticketId?.trim() || undefined;
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
    scanned_at: stringValue(record.scanned_at) ?? stringValue(record.boarded_at),
  };
}

function readRecentScans(): RecentScan[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_SCANS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecentScan(scan: RecentScan) {
  const current = readRecentScans().filter((item) => item.ticket_id !== scan.ticket_id);
  localStorage.setItem(RECENT_SCANS_KEY, JSON.stringify([scan, ...current].slice(0, 50)));
}

function toRecentScan(result: ScanResult): RecentScan | null {
  if (!result.ticket_id) return null;

  return {
    ticket_id: result.ticket_id,
    passenger: result.passenger ?? "Passenger",
    origin: result.origin ?? "-",
    destination: result.destination ?? "-",
    seat: result.seat ?? 0,
    scanned_at: result.scanned_at ?? new Date().toISOString(),
  };
}

export default function ScannerHome() {
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processedRef = useRef(false);
  const mountedRef = useRef(false);
  const startingRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("scanning");
  const [failure, setFailure] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;

    try {
      if (scanner.isScanning) await scanner.stop();
    } catch {
      // Browser streams may already be closed when the page changes.
    }
  }, []);

  const loadTicketDetails = useCallback(async (ticketId: string): Promise<Partial<ScanResult>> => {
    const { data } = await supabase
      .from("ticket")
      .select("id, user_id, seat_number, trips(travel_date, departure_time, routes(origin, destination))")
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

  const markTicketUsedBestEffort = useCallback(async (ticketId: string) => {
    await supabase
      .from("ticket")
      .update({ status: "used" } as never)
      .eq("id", ticketId)
      .then(() => undefined);
  }, []);

  const scanWithValidation = useCallback(async (qrValue: string): Promise<ScanResult> => {
    const scannedAt = new Date().toISOString();
    const fallbackTicketId = extractTicketId(qrValue);
    const driverScan = await supabase.rpc("driver_scan_qr" as never, { p_qr_code: qrValue } as never);

    if (!driverScan.error) {
      const driverResult = normalizeScanResult(driverScan.data);
      if (!driverResult.success) return driverResult;

      const ticketId = driverResult.ticket_id ?? fallbackTicketId;
      const details = ticketId ? await loadTicketDetails(ticketId) : {};
      if (ticketId) await markTicketUsedBestEffort(ticketId);

      return {
        ...details,
        ...driverResult,
        ticket_id: ticketId,
        scanned_at: driverResult.scanned_at ?? scannedAt,
      };
    }

    if (!isMissingRpc(driverScan.error, "driver_scan_qr")) {
      throw driverScan.error;
    }

    const { data, error } = await supabase.rpc("validate_ticket_qr" as never, { p_qr_code: qrValue } as never);
    if (error) throw error;

    const validation = normalizeScanResult(data);
    if (!validation.success) return validation;

    if (asPayload(data).status === "used") {
      return { success: false, reason: "Ticket has already been scanned", ticket_id: validation.ticket_id ?? fallbackTicketId };
    }

    const ticketId = validation.ticket_id ?? fallbackTicketId;
    if (!ticketId) {
      return { success: false, reason: "Ticket validated, but no ticket id was returned." };
    }

    const details = await loadTicketDetails(ticketId);
    await markTicketUsedBestEffort(ticketId);

    return {
      success: true,
      ...details,
      ticket_id: ticketId,
      scanned_at: scannedAt,
    };
  }, [loadTicketDetails, markTicketUsedBestEffort]);

  const completeSuccessfulScan = useCallback((scanResult: ScanResult) => {
    const recentScan = toRecentScan(scanResult);
    if (recentScan) writeRecentScan(recentScan);
    navigate("/scanner", { replace: true, state: { lastScan: recentScan } });
  }, [navigate]);

  const processQR = useCallback(async (rawValue: string) => {
    const qrValue = rawValue.trim();
    setPhase("processing");
    setFailure(null);

    if (!qrValue.startsWith("BUSPAY:")) {
      setFailure("Not a valid BusPay ticket QR code");
      setPhase("failed");
      return;
    }

    try {
      const scanResult = await scanWithValidation(qrValue);
      if (!mountedRef.current) return;

      if (!scanResult.success) {
        setFailure(scanResult.reason ?? "Could not verify this ticket.");
        setPhase("failed");
        return;
      }

      completeSuccessfulScan(scanResult);
    } catch (err) {
      if (!mountedRef.current) return;
      setFailure(errorMessage(err));
      setPhase("failed");
    }
  }, [completeSuccessfulScan, scanWithValidation]);

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

  const handleRetry = async () => {
    processedRef.current = false;
    setFailure(null);
    setPhase("scanning");
    await startScanner();
  };

  const handleBack = async () => {
    await stopScanner();
    navigate("/scanner");
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-white">
      <div
        className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-5 pb-4 pt-12"
        style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0) 100%)" }}
      >
        <button onClick={handleBack} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm ring-1 ring-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-slate-900 shadow-sm ring-1 ring-slate-200">Scan Ticket</p>
        <div className="w-10" />
      </div>

      <div id={QR_DIV} className="absolute inset-0 z-0 bg-slate-100" />

      {phase === "scanning" && !camError && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(circle 36vw at center, transparent 0%, transparent 38%, rgba(255,255,255,0.78) 72%, rgba(255,255,255,0.92) 100%)" }}
          />
          <div className="relative z-10" style={{ width: "62vw", height: "62vw", maxWidth: 280, maxHeight: 280 }}>
            {[
              "left-0 top-0 rounded-tl-2xl border-l-[4px] border-t-[4px]",
              "right-0 top-0 rounded-tr-2xl border-r-[4px] border-t-[4px]",
              "bottom-0 left-0 rounded-bl-2xl border-b-[4px] border-l-[4px]",
              "bottom-0 right-0 rounded-br-2xl border-b-[4px] border-r-[4px]",
            ].map((cls) => (
              <div key={cls} className={`absolute h-10 w-10 border-orange-500 ${cls}`} />
            ))}
            <div
              className="absolute left-2 right-2 h-[3px] rounded-full"
              style={{
                background: "linear-gradient(90deg, transparent, #f97316, transparent)",
                boxShadow: "0 0 12px rgba(249,115,22,0.75)",
                animation: "scanline 2s ease-in-out infinite",
              }}
            />
          </div>
          <p className="relative z-10 mt-7 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
            Point camera at passenger QR code
          </p>
        </div>
      )}

      {camError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white px-8">
          <div className="w-full max-w-xs rounded-3xl border border-red-200 bg-white p-6 text-center shadow-xl">
            <XCircle className="mx-auto mb-3 h-12 w-12 text-red-500" />
            <p className="mb-5 text-sm leading-relaxed text-slate-600">{camError}</p>
            <button onClick={() => void handleRetry()} className="w-full rounded-2xl bg-orange-500 py-3 text-sm font-bold text-white shadow-sm">
              Retry Camera
            </button>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
            <CheckCircle2 className="h-8 w-8 animate-pulse text-green-600" />
          </div>
          <p className="text-sm font-semibold text-slate-700">Verifying ticket...</p>
        </div>
      )}

      {phase === "failed" && (
        <div className="absolute inset-0 z-20 flex items-end bg-slate-950/30 backdrop-blur-[2px]">
          <div className="w-full rounded-t-[2rem] border-t border-red-100 bg-white p-6 pb-10 shadow-2xl">
            <div className="mx-auto mb-5 h-1 w-12 rounded-full bg-slate-200" />
            <div className="mb-5 flex items-center gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-red-50">
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
              <div>
                <p className="text-xl font-extrabold text-slate-900">Scan Failed</p>
                <p className="mt-0.5 text-xs text-slate-500">Could not verify this ticket</p>
              </div>
            </div>
            <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-4">
              <p className="text-center text-sm text-red-700">{failure}</p>
            </div>
            <button
              onClick={() => void handleRetry()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 text-sm font-bold text-white transition-all hover:bg-orange-600 active:scale-[0.98]"
            >
              <RotateCcw className="h-4 w-4" /> Try Again
            </button>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-8 left-0 right-0 z-10 flex justify-center px-5">
        <div
          className={cn(
            "flex items-center gap-2 rounded-full border px-5 py-2 text-xs font-semibold shadow-sm backdrop-blur-md",
            camError
              ? "border-red-200 bg-white/95 text-red-600"
              : phase === "processing"
                ? "border-orange-200 bg-white/95 text-orange-600"
                : phase === "failed"
                  ? "border-red-200 bg-white/95 text-red-600"
                  : "border-slate-200 bg-white/95 text-slate-700",
          )}
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              camError || phase === "failed" ? "bg-red-500" : phase === "processing" ? "animate-pulse bg-orange-500" : "animate-pulse bg-green-500",
            )}
          />
          {camError ? "Camera Error" : phase === "scanning" ? "Ready to Scan" : phase === "processing" ? "Verifying..." : "Scan Failed"}
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
          50%  { top: 88%; opacity: 0.55; }
          52%  { opacity: 1; }
          100% { top: 6%;  opacity: 1; }
        }
      `}</style>
    </div>
  );
}
