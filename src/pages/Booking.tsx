import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatTime12h, arrivalTime, formatDuration } from "@/lib/time";
import { ArrowLeft, Loader2, Wallet as WalletIcon, Smartphone, Check, CreditCard, X, ChevronRight, ChevronLeft, Calendar } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardSkeleton } from "@/components/Skeleton";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Method = "gcash" | "wallet" | "card";

interface TripDetail {
  id: string;
  travel_date: string;
  departure_time: string;
  bus_id: string;
  buses: { plate_number: string; model: string | null; total_seats: number };
  routes: { origin: string; destination: string; price_php: number; duration_minutes: number };
}

interface PaymentMethod {
  id: string;
  type: "gcash" | "card";
  gcash_number?: string;
  gcash_name?: string;
  card_holder?: string;
  card_last4?: string;
  card_expiry?: string;
  bank_name?: string;
}

const BANKS = ["BDO", "BPI", "Metrobank", "UnionBank", "PNB", "Security Bank", "RCBC", "Chinabank", "Other"];

// ── Mini Calendar ─────────────────────────────────────────────────────────────
function MiniCalendar({
  value, onChange, onClose,
}: {
  value: { day: number; month: number; year: number } | null;
  onChange: (d: { day: number; month: number; year: number }) => void;
  onClose: () => void;
}) {
  const today = new Date();
  const minYear = 2026;
  const initYear = value?.year ?? Math.max(today.getFullYear(), minYear);
  const initMonth = value?.month ? value.month - 1 : (initYear === minYear ? 0 : today.getMonth());
  const [viewYear, setViewYear] = useState(initYear);
  const [viewMonth, setViewMonth] = useState(initMonth);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  const prevMonth = () => {
    if (viewMonth === 0) { if (viewYear <= minYear) return; setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };
  const isPrevDisabled = viewYear === minYear && viewMonth === 0;
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return (
    <div className="absolute z-50 mt-1 rounded-2xl border border-border bg-card shadow-elevated p-4 w-72">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} disabled={isPrevDisabled}
          className="p-1 rounded-lg hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-bold text-sm">{MONTHS[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-secondary transition">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const isSelected = day !== null && value?.day === day && value?.month === viewMonth + 1 && value?.year === viewYear;
          return (
            <button key={i} disabled={day === null}
              onClick={() => { if (!day) return; onChange({ day, month: viewMonth + 1, year: viewYear }); onClose(); }}
              className={cn("h-8 w-full rounded-lg text-xs font-medium transition-all",
                day === null && "cursor-default",
                day !== null && !isSelected && "hover:bg-secondary",
                isSelected && "bg-accent text-white font-bold")}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Expiry Input with Calendar ─────────────────────────────────────────────────
function ExpiryInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [showCal, setShowCal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const parseExpiry = (v: string): { day: number; month: number; year: number } | null => {
    const parts = v.split("/");
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10), month = parseInt(parts[1], 10), year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    return { day, month, year };
  };
  const handleRaw = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    let result = digits;
    if (digits.length >= 3 && digits.length < 5) result = digits.slice(0, 2) + "/" + digits.slice(2);
    else if (digits.length >= 5) result = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
    onChange(result);
  };
  const handleCalSelect = (d: { day: number; month: number; year: number }) => {
    const dd = String(d.day).padStart(2, "0");
    const mm = String(d.month).padStart(2, "0");
    onChange(`${dd}/${mm}/${d.year}`);
  };
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShowCal(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Input placeholder="DD/MM/YYYY" value={value} onChange={e => handleRaw(e.target.value)}
          className="h-12 rounded-xl pr-10" maxLength={10} inputMode="numeric"
          onKeyDown={e => { if (!/[\d/\b]/.test(e.key) && !e.ctrlKey && !e.metaKey && e.key.length === 1) e.preventDefault(); }} />
        <button type="button" onClick={() => setShowCal(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors">
          <Calendar className="h-4 w-4" />
        </button>
      </div>
      {showCal && <MiniCalendar value={parseExpiry(value)} onChange={handleCalSelect} onClose={() => setShowCal(false)} />}
    </div>
  );
}

// ── GCash Form ─────────────────────────────────────────────────────────────────
function GCashForm({ gcashNumber, setGcashNumber, gcashName, setGcashName, onSave, onBack }: {
  gcashNumber: string; setGcashNumber: (v: string) => void;
  gcashName: string; setGcashName: (v: string) => void;
  onSave: () => void; onBack: () => void;
}) {
  const formatGcashDisplay = (digits: string) => {
    const d = digits.replace(/\D/g, "").slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + " " + d.slice(3);
    return d.slice(0, 3) + " " + d.slice(3, 6) + " " + d.slice(6);
  };
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-blue-500/5 border border-blue-200 p-3 text-xs text-blue-700">
        Demo only — no real GCash transaction will occur.
      </div>
      <div className="space-y-1.5">
        <Label>GCash Mobile Number <span className="text-destructive">*</span></Label>
        <div className="flex">
          <span className="inline-flex h-12 items-center rounded-l-xl border border-r-0 border-input bg-secondary px-3 text-sm font-semibold text-muted-foreground select-none">+63</span>
          <Input placeholder="917 123 4567" inputMode="numeric"
            className="h-12 rounded-l-none rounded-r-xl flex-1 font-mono tracking-wider" maxLength={12}
            value={gcashNumber.startsWith("+63") ? formatGcashDisplay(gcashNumber.slice(3)) : formatGcashDisplay(gcashNumber)}
            onChange={e => { const digits = e.target.value.replace(/\D/g, "").slice(0, 10); setGcashNumber("+63" + digits); }} />
        </div>
        <p className="text-xs text-muted-foreground">Enter your 10-digit GCash number</p>
      </div>
      <div className="space-y-1.5">
        <Label>GCash Account Name <span className="text-destructive">*</span></Label>
        <Input placeholder="Juan Dela Cruz" value={gcashName}
          onChange={e => setGcashName(e.target.value)} className="h-12 rounded-xl" maxLength={80} />
      </div>
      <Button variant="navy" size="lg" className="w-full" onClick={onSave}>Save & Pay</Button>
      <button onClick={onBack} className="w-full text-center text-sm text-muted-foreground hover:text-foreground">← Back</button>
    </div>
  );
}

// ── Card Form ─────────────────────────────────────────────────────────────────
function CardForm({ cardHolder, setCardHolder, cardNumber, setCardNumber, cardExpiry, setCardExpiry, bankName, setBankName, onSave, onBack }: {
  cardHolder: string; setCardHolder: (v: string) => void;
  cardNumber: string; setCardNumber: (v: string) => void;
  cardExpiry: string; setCardExpiry: (v: string) => void;
  bankName: string; setBankName: (v: string) => void;
  onSave: () => void; onBack: () => void;
}) {
  const formatCardNum = (v: string) => v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-purple-500/5 border border-purple-200 p-3 text-xs text-purple-700">
        Demo only — your card will not be charged. Only last 4 digits are saved.
      </div>
      <div className="space-y-1.5">
        <Label>Bank</Label>
        <div className="grid grid-cols-3 gap-2">
          {BANKS.map(b => (
            <button key={b} onClick={() => setBankName(b)}
              className={cn("rounded-xl border-2 py-2 text-xs font-semibold transition-all",
                bankName === b ? "border-accent bg-accent/10 text-primary" : "border-border hover:border-accent/40")}>
              {b}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Cardholder Name <span className="text-destructive">*</span></Label>
        <Input placeholder="JUAN DELA CRUZ" value={cardHolder}
          onChange={e => setCardHolder(e.target.value.toUpperCase())} className="h-12 rounded-xl" maxLength={60} />
      </div>
      <div className="space-y-1.5">
        <Label>Card Number <span className="text-destructive">*</span></Label>
        <Input placeholder="0000 0000 0000 0000" value={cardNumber}
          onChange={e => setCardNumber(formatCardNum(e.target.value))}
          className="h-12 rounded-xl font-mono tracking-widest" maxLength={19} inputMode="numeric"
          onKeyDown={e => { if (!/[\d\s\b]/.test(e.key) && !e.ctrlKey && !e.metaKey && e.key.length === 1) e.preventDefault(); }} />
      </div>
      <div className="space-y-1.5">
        <Label>Expiry Date <span className="text-destructive">*</span></Label>
        <ExpiryInput value={cardExpiry} onChange={setCardExpiry} />
        <p className="text-xs text-muted-foreground">Format: DD/MM/YYYY · Must be 2026 or later</p>
      </div>
      <Button variant="navy" size="lg" className="w-full" onClick={onSave}>Save & Pay</Button>
      <button onClick={onBack} className="w-full text-center text-sm text-muted-foreground hover:text-foreground">← Back</button>
    </div>
  );
}

const SEAT_LAYOUT = (() => {
  const rows: { row: number; left: number[]; right: number[] }[] = [];
  let n = 1;
  for (let i = 0; i < 10; i++) rows.push({ row: i + 1, left: [n++, n++], right: [n++, n++] });
  return rows;
})();

export default function Booking() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [taken, setTaken] = useState<Set<number>>(new Set());
  const [passengerCount, setPassengerCount] = useState(1);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [step, setStep] = useState<"seat" | "pay" | "pm-setup" | "done">("seat");
  const [method, setMethod] = useState<Method>("gcash");
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedTicketId, setConfirmedTicketId] = useState<string | null>(null);

  // Payment methods
  const [savedMethods, setSavedMethods] = useState<PaymentMethod[]>([]);
  const [gcashNumber, setGcashNumber] = useState("");
  const [gcashName, setGcashName] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [bankName, setBankName] = useState("BDO");

  const savedGcash = savedMethods.find((m) => m.type === "gcash");
  const savedCard = savedMethods.find((m) => m.type === "card");

  const refreshOccupiedSeats = async (tid: string) => {
    const { data, error } = await supabase.rpc("get_trip_occupied_seats", { p_trip_id: tid });
    if (!error && data) setTaken(new Set((data as { seat_number: number }[]).map((r) => r.seat_number)));
  };

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    (async () => {
      const { data: tripData, error } = await supabase
        .from("trips")
        .select("id, status, travel_date, departure_time, bus_id, buses(plate_number, model, total_seats), routes(origin, destination, price_php, duration_minutes)")
        .eq("id", tripId).maybeSingle();
      if (error || !tripData) { toast.error("Trip not found"); navigate("/app"); return; }
      if ((tripData as any).status === "cancelled") { toast.error("Trip cancelled"); navigate("/app"); return; }
      if (cancelled) return;
      setTrip(tripData as unknown as TripDetail);
      await refreshOccupiedSeats(tripId);
      if (user) {
        const [{ data: w }, { data: pm }] = await Promise.all([
          supabase.from("wallet").select("balance_php").eq("user_id", user.id).maybeSingle(),
          supabase.from("payment_methods").select("*").eq("user_id", user.id),
        ]);
        if (!cancelled) {
          setWalletBalance(Number(w?.balance_php ?? 0));
          setSavedMethods((pm as PaymentMethod[]) ?? []);
        }
      }
      if (!cancelled) setLoading(false);
    })();

    const channel = supabase.channel(`trip-${tripId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket", filter: `trip_id=eq.${tripId}` },
        () => refreshOccupiedSeats(tripId))
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [tripId, user, navigate]);

  const price = trip ? Number(trip.routes.price_php) : 0;

  const handleSeatClick = (n: number) => {
    if (taken.has(n)) return;
    setSelectedSeats((prev) => {
      if (prev.includes(n)) return prev.filter((s) => s !== n);
      if (prev.length < passengerCount) return [...prev, n];
      return [...prev.slice(0, prev.length - 1), n];
    });
  };

  // When user clicks Confirm on the pay step — check if PM is saved
  const handlePayProceed = () => {
    if (method === "wallet") { handleConfirm(); return; }
    const hasSaved = method === "gcash" ? !!savedGcash : !!savedCard;
    if (hasSaved) { handleConfirm(); return; }
    // Need to collect payment method info first
    if (method === "gcash") { setGcashNumber(""); setGcashName(""); }
    else { setCardHolder(""); setCardNumber(""); setCardExpiry(""); setBankName("BDO"); }
    setStep("pm-setup");
  };

  const savePmAndConfirm = async () => {
    if (!user) return;
    if (method === "gcash") {
      const num = gcashNumber.trim();
      const name = gcashName.trim();
      if (!/^\+63\d{10}$/.test(num)) { toast.error("Enter a valid GCash number (+63XXXXXXXXXX)"); return; }
      if (name.length < 2) { toast.error("Enter your GCash account name"); return; }
      const { error } = await supabase.from("payment_methods").upsert(
        { user_id: user.id, type: "gcash", gcash_number: num, gcash_name: name },
        { onConflict: "user_id,type" }
      );
      if (error) { toast.error("Failed to save GCash info"); return; }
    } else {
      const holder = cardHolder.trim();
      const raw = cardNumber.replace(/\s/g, "");
      const expiry = cardExpiry.trim();
      if (holder.length < 2) { toast.error("Enter cardholder name"); return; }
      if (!/^\d{16}$/.test(raw)) { toast.error("Enter a valid 16-digit card number"); return; }
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(expiry)) { toast.error("Enter expiry as DD/MM/YYYY (e.g. 31/12/2028)"); return; }
      const [dd, mm, yyyy] = expiry.split("/").map(Number);
      if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yyyy < 2026) { toast.error("Enter a valid expiry (DD/MM/YYYY, year 2026 or later)"); return; }
      const { error } = await supabase.from("payment_methods").upsert(
        { user_id: user.id, type: "card", card_holder: holder, card_last4: raw.slice(-4), card_expiry: expiry, bank_name: bankName },
        { onConflict: "user_id,type" }
      );
      if (error) { toast.error("Failed to save card info"); return; }
    }
    // Refresh saved methods then confirm
    const { data: pm } = await supabase.from("payment_methods").select("*").eq("user_id", user.id);
    setSavedMethods((pm as PaymentMethod[]) ?? []);
    setStep("pay");
    handleConfirm();
  };

  const handleConfirm = async () => {
    if (!trip || !user || selectedSeats.length === 0) return;
    const totalPrice = price * selectedSeats.length;
    if (method === "wallet" && walletBalance < totalPrice) { toast.error("Insufficient wallet balance."); return; }
    setSubmitting(true);
    try {
      const ticketIds: string[] = [];
      for (const seatNum of selectedSeats) {
        const { data: ticketRow, error: tErr } = await supabase.from("ticket")
          .insert({ user_id: user.id, trip_id: trip.id, seat_number: seatNum, status: "pending", price_php: price })
          .select("id").single();
        if (tErr) throw tErr;
        await supabase.from("ticket").update({ qr_code: `BUSPAY:${ticketRow.id}` }).eq("id", ticketRow.id);
        const { data: confirmed, error: cErr } = await supabase.rpc("confirm_ticket_payment", {
          p_ticket_id: ticketRow.id, p_payment_method: method === "card" ? "gcash" : method, p_amount: price,
        });
        if (cErr) throw cErr;
        if (!confirmed) throw new Error("Payment confirmation failed");
        ticketIds.push(ticketRow.id);
      }
      if (method === "wallet") {
        const { data: deducted, error: dErr } = await supabase.rpc("deduct_wallet", {
          p_user_id: user.id, p_amount: totalPrice,
          p_description: `${selectedSeats.length} ticket(s) · ${trip.routes.origin} → ${trip.routes.destination}`,
        });
        if (dErr) throw dErr;
        if (!deducted) { toast.error("Insufficient wallet balance."); return; }
        setWalletBalance((b) => b - totalPrice);
      }
      setConfirmedTicketId(ticketIds[0]);
      setStep("done");
    } catch (err: any) {
      toast.error(err?.message ?? "Booking failed. The seat may have just been taken.");
      setStep("pay");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !trip) return <div className="px-5 py-6"><CardSkeleton /></div>;

  return (
    <div className="px-5 py-6">
      <button onClick={() => { if (step === "pay" || step === "pm-setup") setStep("seat"); else navigate(-1); }}
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("common.back")}
      </button>

      {/* SEAT SELECTION */}
      {step === "seat" && (
        <div className="animate-fade-in">
          <h1 className="mb-1 text-2xl font-extrabold">{t("home.seat")}</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            {trip.routes.origin} → {trip.routes.destination} · {format(new Date(trip.travel_date + "T00:00:00"), "EEE, MMM d")} · {formatTime12h(trip.departure_time)}
          </p>
          <div className="mb-5 flex items-center justify-between rounded-2xl border border-border bg-card p-4">
            <div><div className="font-semibold">Passengers</div><div className="text-xs text-muted-foreground">Select a seat per passenger</div></div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => { if (passengerCount > 1) { setPassengerCount(p => p - 1); setSelectedSeats([]); } }}
                className="flex h-8 w-8 items-center justify-center rounded-xl border-2 border-border text-lg font-bold hover:border-accent transition-colors disabled:opacity-40"
                disabled={passengerCount <= 1}>−</button>
              <span className="w-4 text-center font-extrabold text-lg">{passengerCount}</span>
              <button type="button" onClick={() => { if (passengerCount < 5) { setPassengerCount(p => p + 1); setSelectedSeats([]); } }}
                className="flex h-8 w-8 items-center justify-center rounded-xl border-2 border-border text-lg font-bold hover:border-accent transition-colors disabled:opacity-40"
                disabled={passengerCount >= 5}>+</button>
            </div>
          </div>
          <div className="mb-3 flex items-center gap-4 text-xs">
            <Legend color="bg-seat-available" label="Available" />
            <Legend color="bg-seat-selected" label="Selected" />
            <Legend color="bg-seat-taken" label="Taken" />
          </div>
          <p className="mb-4 text-xs text-muted-foreground">Tap a seat to select it. Tap another to switch.</p>
          <div className="rounded-3xl border-2 border-border bg-gradient-card p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              <span>🚍 Front · Driver</span><span>Door →</span>
            </div>
            <div className="space-y-2">
              {SEAT_LAYOUT.map(({ row, left, right }) => (
                <div key={row} className="flex items-center justify-between gap-2">
                  <div className="flex gap-2">{left.map((n) => <Seat key={n} n={n} taken={taken.has(n)} selected={selectedSeats.includes(n)} onClick={() => handleSeatClick(n)} />)}</div>
                  <span className="w-6 text-center text-xs font-semibold text-muted-foreground">{row}</span>
                  <div className="flex gap-2">{right.map((n) => <Seat key={n} n={n} taken={taken.has(n)} selected={selectedSeats.includes(n)} onClick={() => handleSeatClick(n)} />)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="sticky bottom-24 mt-5">
            <Button variant="navy" size="lg" className="w-full" disabled={selectedSeats.length < passengerCount} onClick={() => setStep("pay")}>
              {selectedSeats.length < passengerCount
                ? `Select ${passengerCount - selectedSeats.length} more seat${passengerCount - selectedSeats.length > 1 ? "s" : ""}`
                : `Seats ${selectedSeats.join(", ")} · ${t("home.continue")}`}
            </Button>
          </div>
        </div>
      )}

      {/* PAYMENT */}
      {step === "pay" && (
        <div className="animate-fade-in">
          <h1 className="mb-1 text-2xl font-extrabold">{t("pay.title")}</h1>
          <p className="mb-5 text-sm text-muted-foreground">{t("pay.method")}</p>
          <div className="mb-5 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-3xl font-extrabold text-primary">₱{(price * passengerCount).toLocaleString()}</span>
            </div>
            <div className="mt-3 border-t border-border pt-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Route</span><span className="font-semibold">{trip.routes.origin} → {trip.routes.destination}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-semibold">{format(new Date(trip.travel_date), "PP")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Departure</span><span className="font-semibold">{formatTime12h(trip.departure_time)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Arrival (est.)</span><span className="font-semibold">{arrivalTime(trip.departure_time, trip.routes.duration_minutes)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-semibold">{formatDuration(trip.routes.duration_minutes)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Seat(s)</span><span className="font-semibold">#{selectedSeats.join(", #")}</span></div>
            </div>
          </div>
          <div className="space-y-3">
            {/* GCash */}
            <PayOption
              icon={<Smartphone className="h-5 w-5" />}
              label="GCash"
              hint={savedGcash ? `${savedGcash.gcash_number} · ${savedGcash.gcash_name}` : "Set up GCash to pay"}
              badge={!savedGcash ? "Setup required" : undefined}
              active={method === "gcash"}
              onClick={() => setMethod("gcash")}
            />
            {/* Card */}
            <PayOption
              icon={<CreditCard className="h-5 w-5" />}
              label="Card / Banking"
              hint={savedCard ? `${savedCard.bank_name} ••••${savedCard.card_last4} · ${savedCard.card_holder}` : "Set up your card to pay"}
              badge={!savedCard ? "Setup required" : undefined}
              active={method === "card"}
              onClick={() => setMethod("card")}
            />
            {/* Wallet */}
            <PayOption
              icon={<WalletIcon className="h-5 w-5" />}
              label={`${t("pay.wallet")} · ₱${walletBalance.toLocaleString()}`}
              hint={walletBalance < price * passengerCount ? "Insufficient" : "Instant"}
              disabled={walletBalance < price * passengerCount}
              active={method === "wallet"}
              onClick={() => setMethod("wallet")}
            />
          </div>
          <Button variant="navy" size="lg" className="mt-6 w-full" disabled={submitting} onClick={handlePayProceed}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("pay.confirm")}
          </Button>
        </div>
      )}

      {/* PAYMENT METHOD SETUP */}
      {step === "pm-setup" && (
        <div className="animate-fade-in">
          <h1 className="mb-1 text-2xl font-extrabold">{method === "gcash" ? "GCash Details" : "Card Details"}</h1>
          <p className="mb-5 text-sm text-muted-foreground">Save your details to complete payment.</p>

          {method === "gcash" ? (
            <GCashForm
              gcashNumber={gcashNumber}
              setGcashNumber={setGcashNumber}
              gcashName={gcashName}
              setGcashName={setGcashName}
              onSave={savePmAndConfirm}
              onBack={() => setStep("pay")}
            />
          ) : (
            <CardForm
              cardHolder={cardHolder}
              setCardHolder={setCardHolder}
              cardNumber={cardNumber}
              setCardNumber={setCardNumber}
              cardExpiry={cardExpiry}
              setCardExpiry={setCardExpiry}
              bankName={bankName}
              setBankName={setBankName}
              onSave={savePmAndConfirm}
              onBack={() => setStep("pay")}
            />
          )}
        </div>
      )}

      {/* DONE */}
      {step === "done" && confirmedTicketId && (
        <div className="animate-scale-in py-12 text-center">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="h-12 w-12" strokeWidth={3} />
          </div>
          <h1 className="mb-2 text-2xl font-extrabold">{t("pay.success")}</h1>
          <p className="mb-8 text-sm text-muted-foreground">
            Seat(s) #{selectedSeats.join(", #")} · {trip.routes.origin} → {trip.routes.destination} · {formatTime12h(trip.departure_time)}
          </p>
          <div className="flex flex-col gap-3">
            <Button variant="navy" size="lg" onClick={() => navigate(`/app/tickets/${confirmedTicketId}`)}>View ticket</Button>
            <Button variant="outline" size="lg" onClick={() => navigate("/app")}>Back to home</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Seat({ n, taken, selected, onClick }: { n: number; taken: boolean; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={taken} onClick={onClick}
      aria-label={`Seat ${n}${taken ? " (taken)" : selected ? " (selected)" : " (available)"}`}
      className={cn("flex h-11 w-11 items-center justify-center rounded-xl text-xs font-bold transition-all border-2 shadow-sm",
        taken && "cursor-not-allowed border-seat-taken bg-seat-taken text-seat-taken-fg opacity-70",
        !taken && !selected && "border-seat-available bg-seat-available text-seat-available-fg hover:scale-105",
        selected && "border-accent bg-seat-selected text-seat-selected-fg scale-110 shadow-gold")}>
      {n}
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded", color)} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function PayOption({ icon, label, hint, badge, active, onClick, disabled }: {
  icon: React.ReactNode; label: string; hint?: string; badge?: string;
  active: boolean; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={cn("flex w-full items-center gap-4 rounded-2xl border-2 bg-card p-4 text-left transition-all",
        active ? "border-accent shadow-soft" : "border-border hover:border-accent/40",
        disabled && "cursor-not-allowed opacity-50")}>
      <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", active ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground")}>{icon}</div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{label}</span>
          {badge && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{badge}</span>}
        </div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {active && <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground"><Check className="h-4 w-4" strokeWidth={3} /></div>}
    </button>
  );
}