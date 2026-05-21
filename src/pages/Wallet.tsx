import { useEffect, useState, useRef } from "react";
import { Plus, ArrowDownLeft, ArrowUpRight, CreditCard, Smartphone, Loader2, X, ChevronRight, Check, Calendar, ChevronLeft } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardSkeleton } from "@/components/Skeleton";
import { EmptyState, EmptyWalletIllustration } from "@/components/EmptyState";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Tx {
  id: string;
  type: "topup" | "payment" | "refund";
  amount_php: number;
  description: string | null;
  created_at: string;
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

const QUICK_AMOUNTS = [200, 500, 1000, 2000];
const BANKS = ["BDO", "BPI", "Metrobank", "UnionBank", "PNB", "Security Bank", "RCBC", "Chinabank", "Other"];

type TopupStep = "amount" | "method-select" | "gcash-form" | "card-form" | "confirm";
type WalletSection = "setup-gcash" | "setup-card" | null;

// ── Mini Calendar Component ──────────────────────────────────────────────────
function MiniCalendar({
  value,
  onChange,
  onClose,
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
  const [viewMonth, setViewMonth] = useState(initMonth); // 0-indexed

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const prevMonth = () => {
    if (viewMonth === 0) {
      if (viewYear <= minYear) return; // can't go before Jan 2026
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const isPrevDisabled = viewYear === minYear && viewMonth === 0;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="absolute z-50 mt-1 rounded-2xl border border-border bg-card shadow-elevated p-4 w-72">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          disabled={isPrevDisabled}
          className="p-1 rounded-lg hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-bold text-sm">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-secondary transition">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const isSelected =
            day !== null &&
            value?.day === day &&
            value?.month === viewMonth + 1 &&
            value?.year === viewYear;
          return (
            <button
              key={i}
              disabled={day === null}
              onClick={() => {
                if (!day) return;
                onChange({ day, month: viewMonth + 1, year: viewYear });
                onClose();
              }}
              className={cn(
                "h-8 w-full rounded-lg text-xs font-medium transition-all",
                day === null && "cursor-default",
                day !== null && !isSelected && "hover:bg-secondary",
                isSelected && "bg-accent text-white font-bold"
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Expiry Input with Calendar ───────────────────────────────────────────────
function ExpiryInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [showCal, setShowCal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Parse DD/MM/YYYY from string
  const parseExpiry = (v: string): { day: number; month: number; year: number } | null => {
    const parts = v.split("/");
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    return { day, month, year };
  };

  const handleRaw = (raw: string) => {
    // Allow only digits and slashes, format as DD/MM/YYYY
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    let result = digits;
    if (digits.length >= 3 && digits.length < 5) {
      result = digits.slice(0, 2) + "/" + digits.slice(2);
    } else if (digits.length >= 5) {
      result = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
    }
    onChange(result);
  };

  const handleCalSelect = (d: { day: number; month: number; year: number }) => {
    const dd = String(d.day).padStart(2, "0");
    const mm = String(d.month).padStart(2, "0");
    const yyyy = String(d.year);
    onChange(`${dd}/${mm}/${yyyy}`);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowCal(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Input
          placeholder="DD/MM/YYYY"
          value={value}
          onChange={(e) => handleRaw(e.target.value)}
          className="h-12 rounded-xl pr-10"
          maxLength={10}
          inputMode="numeric"
          onKeyDown={(e) => {
            if (!/[\d/\b]/.test(e.key) && !e.ctrlKey && !e.metaKey && e.key.length === 1)
              e.preventDefault();
          }}
        />
        <button
          type="button"
          onClick={() => setShowCal((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
        >
          <Calendar className="h-4 w-4" />
        </button>
      </div>
      {showCal && (
        <MiniCalendar
          value={parseExpiry(value)}
          onChange={handleCalSelect}
          onClose={() => setShowCal(false)}
        />
      )}
    </div>
  );
}

// ── GCash Form (standalone, reusable) ───────────────────────────────────────
function GCashForm({
  gcashNumber,
  setGcashNumber,
  gcashName,
  setGcashName,
  onSave,
  onBack,
  backLabel = "← Back",
  saveLabel = "Save GCash",
}: {
  gcashNumber: string;
  setGcashNumber: (v: string) => void;
  gcashName: string;
  setGcashName: (v: string) => void;
  onSave: () => void;
  onBack: () => void;
  backLabel?: string;
  saveLabel?: string;
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
        This is a demo. No real GCash transaction will occur.
      </div>
      <div className="space-y-1.5">
        <Label>GCash Mobile Number <span className="text-destructive">*</span></Label>
        <div className="flex">
          <span className="inline-flex h-12 items-center rounded-l-xl border border-r-0 border-input bg-secondary px-3 text-sm font-semibold text-muted-foreground select-none">+63</span>
          <Input
            placeholder="917 123 4567"
            inputMode="numeric"
            className="h-12 rounded-l-none rounded-r-xl flex-1 font-mono tracking-wider"
            maxLength={12}
            value={gcashNumber.startsWith("+63") ? formatGcashDisplay(gcashNumber.slice(3)) : formatGcashDisplay(gcashNumber)}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
              setGcashNumber("+63" + digits);
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">Enter your 10-digit GCash number</p>
      </div>
      <div className="space-y-1.5">
        <Label>GCash Account Name <span className="text-destructive">*</span></Label>
        <Input placeholder="Juan Dela Cruz" value={gcashName}
          onChange={(e) => setGcashName(e.target.value)} className="h-12 rounded-xl" maxLength={80} />
      </div>
      <Button variant="navy" size="lg" className="w-full" onClick={onSave}>{saveLabel}</Button>
      <button onClick={onBack} className="w-full text-center text-sm text-muted-foreground hover:text-foreground">{backLabel}</button>
    </div>
  );
}

// ── Card Form (standalone, reusable) ────────────────────────────────────────
function CardForm({
  cardHolder,
  setCardHolder,
  cardNumber,
  setCardNumber,
  cardExpiry,
  setCardExpiry,
  bankName,
  setBankName,
  onSave,
  onBack,
  backLabel = "← Back",
  saveLabel = "Save Card",
}: {
  cardHolder: string;
  setCardHolder: (v: string) => void;
  cardNumber: string;
  setCardNumber: (v: string) => void;
  cardExpiry: string;
  setCardExpiry: (v: string) => void;
  bankName: string;
  setBankName: (v: string) => void;
  onSave: () => void;
  onBack: () => void;
  backLabel?: string;
  saveLabel?: string;
}) {
  const formatCardNum = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-purple-500/5 border border-purple-200 p-3 text-xs text-purple-700">
        This is a demo. Your card will not be charged. Only the last 4 digits are saved.
      </div>
      <div className="space-y-1.5">
        <Label>Bank</Label>
        <div className="grid grid-cols-3 gap-2">
          {BANKS.map((b) => (
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
          onChange={(e) => setCardHolder(e.target.value.toUpperCase())} className="h-12 rounded-xl" maxLength={60} />
      </div>
      <div className="space-y-1.5">
        <Label>Card Number <span className="text-destructive">*</span></Label>
        <Input placeholder="0000 0000 0000 0000" value={cardNumber}
          onChange={(e) => setCardNumber(formatCardNum(e.target.value))}
          className="h-12 rounded-xl font-mono tracking-widest" maxLength={19} inputMode="numeric"
          onKeyDown={(e) => { if (!/[\d\s\b]/.test(e.key) && !e.ctrlKey && !e.metaKey && e.key.length === 1) e.preventDefault(); }} />
      </div>
      <div className="space-y-1.5">
        <Label>Expiry Date <span className="text-destructive">*</span></Label>
        <ExpiryInput value={cardExpiry} onChange={setCardExpiry} />
        <p className="text-xs text-muted-foreground">Format: DD/MM/YYYY · Must be 2026 or later</p>
      </div>
      <Button variant="navy" size="lg" className="w-full" onClick={onSave}>{saveLabel}</Button>
      <button onClick={onBack} className="w-full text-center text-sm text-muted-foreground hover:text-foreground">{backLabel}</button>
    </div>
  );
}

// ── Main Wallet Component ────────────────────────────────────────────────────
export default function Wallet() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [balance, setBalance] = useState<number>(0);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTopup, setShowTopup] = useState(false);
  const [amount, setAmount] = useState<string>("500");
  const [method, setMethod] = useState<"gcash" | "card">("gcash");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<TopupStep>("amount");

  // Wallet section: which standalone setup panel is open
  const [walletSection, setWalletSection] = useState<WalletSection>(null);

  // Saved payment methods
  const [savedMethods, setSavedMethods] = useState<PaymentMethod[]>([]);

  // GCash form state
  const [gcashNumber, setGcashNumber] = useState("");
  const [gcashName, setGcashName] = useState("");

  // Card form state
  const [cardHolder, setCardHolder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [bankName, setBankName] = useState("BDO");


  const load = async () => {
    if (!user) return;
    const [{ data: w }, { data: txData }, { data: pmData }] = await Promise.all([
      supabase.from("wallet").select("balance_php").eq("user_id", user.id).maybeSingle(),
      supabase.from("wallet_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("payment_methods").select("*").eq("user_id", user.id),
    ]);
    setBalance(Number(w?.balance_php ?? 0));
    setTxs((txData as Tx[]) ?? []);
    setSavedMethods((pmData as PaymentMethod[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const savedGcash = savedMethods.find((m) => m.type === "gcash");
  const savedCard = savedMethods.find((m) => m.type === "card");

  const openTopup = () => {
    setStep("amount");
    setShowTopup(true);
  };

  const closeTopup = () => {
    setShowTopup(false);
    setStep("amount");
  };

  // ── Validate expiry DD/MM/YYYY ─────────────────────────────────────────
  const validateExpiry = (expiry: string): boolean => {
    const parts = expiry.split("/");
    if (parts.length !== 3) return false;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return false;
    if (day < 1 || day > 31) return false;
    if (month < 1 || month > 12) return false;
    if (year < 2026 || parts[2].length !== 4) return false;
    return true;
  };

  // ── Save GCash (shared logic) ──────────────────────────────────────────
  const doSaveGcash = async (onSuccess: () => void) => {
    if (!user) return;
    const num = gcashNumber.trim();
    const name = gcashName.trim();
    if (!/^\+63\d{10}$/.test(num)) { toast.error("Enter a valid GCash number (+63XXXXXXXXXX)"); return; }
    if (name.length < 2) { toast.error("Enter your GCash account name"); return; }
    const { error } = await supabase.from("payment_methods").upsert({
      user_id: user.id, type: "gcash", gcash_number: num, gcash_name: name,
    }, { onConflict: "user_id,type" });
    if (error) { toast.error("Failed to save GCash info"); return; }
    toast.success("GCash saved!");
    await load();
    onSuccess();
  };

  // ── Save Card (shared logic) ───────────────────────────────────────────
  const doSaveCard = async (onSuccess: () => void) => {
    if (!user) return;
    const holder = cardHolder.trim();
    const raw = cardNumber.replace(/\s/g, "");
    const expiry = cardExpiry.trim();
    if (holder.length < 2) { toast.error("Enter cardholder name"); return; }
    if (!/^\d{16}$/.test(raw)) { toast.error("Enter a valid 16-digit card number"); return; }
    if (!validateExpiry(expiry)) {
      toast.error("Enter a valid expiry (DD/MM/YYYY, year 2026 or later, day 1–31, month 1–12)");
      return;
    }
    const { error } = await supabase.from("payment_methods").upsert({
      user_id: user.id, type: "card",
      card_holder: holder, card_last4: raw.slice(-4),
      card_expiry: expiry, bank_name: bankName,
    }, { onConflict: "user_id,type" });
    if (error) { toast.error("Failed to save card info"); return; }
    toast.success("Card saved!");
    await load();
    onSuccess();
  };

  // ── Topup-flow method routing ──────────────────────────────────────────
  const handleMethodNext = (m: "gcash" | "card") => {
    setMethod(m);
    if (m === "gcash") {
      if (savedGcash) {
        setStep("confirm");
      } else {
        setGcashNumber("");
        setGcashName("");
        setStep("gcash-form");
      }
    } else {
      if (savedCard) {
        setStep("confirm");
      } else {
        setCardHolder("");
        setCardNumber("");
        setCardExpiry("");
        setBankName("BDO");
        setStep("card-form");
      }
    }
  };

  const handleTopup = async () => {
    if (!user) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0 || amt > 50000) { toast.error("Enter a valid amount (₱1 – ₱50,000). Maximum single top-up is ₱50,000."); return; }
    setSubmitting(true);
    try {
      const { data: ok, error } = await supabase.rpc("topup_wallet", {
        p_user_id: user.id,
        p_amount: amt,
        p_description: `Top up via ${method === "gcash" ? "GCash" : "Card"}`,
      });
      if (error) throw error;
      if (!ok) throw new Error("Top up failed");
      await supabase.from("notifications").insert({
        user_id: user.id, type: "payment",
        title: "Wallet topped up",
        body: `₱${amt.toLocaleString()} added to your wallet via ${method === "gcash" ? "GCash" : "Card"}.`,
      });
      toast.success(`Added ₱${amt.toLocaleString()} to your wallet`);
      closeTopup();
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Top up failed");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Open standalone setup from wallet section ──────────────────────────
  const openWalletGcash = (edit?: boolean) => {
    if (edit && savedGcash) {
      setGcashNumber(savedGcash.gcash_number ?? "");
      setGcashName(savedGcash.gcash_name ?? "");
    } else {
      setGcashNumber("");
      setGcashName("");
    }
    setWalletSection("setup-gcash");
  };

  const openWalletCard = (edit?: boolean) => {
    if (edit && savedCard) {
      setCardHolder(savedCard.card_holder ?? "");
      setCardNumber("");
      setCardExpiry(savedCard.card_expiry ?? "");
      setBankName(savedCard.bank_name ?? "BDO");
    } else {
      setCardHolder("");
      setCardNumber("");
      setCardExpiry("");
      setBankName("BDO");
    }
    setWalletSection("setup-card");
  };

  return (
    <div className="px-5 py-6">
      <h1 className="mb-5 text-2xl font-extrabold animate-fade-in">{t("wallet.title")}</h1>

      {/* Balance card */}
      <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-hero p-6 text-primary-foreground shadow-navy animate-slide-up">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">{t("wallet.balance")}</p>
        {loading ? (
          <div className="mt-2 h-10 w-40 animate-shimmer rounded-lg" />
        ) : (
          <div className="mt-1 text-4xl font-extrabold">₱{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        )}
        <Button variant="hero" size="lg" className="mt-5 w-full" onClick={openTopup}>
          <Plus className="h-5 w-5" /> {t("wallet.topup")}
        </Button>
      </section>

      {/* ── Standalone Payment Methods Section (always visible) ── */}
      {walletSection === null && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Payment Methods</h2>
          <div className="space-y-2">
            {/* GCash tile */}
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                <Smartphone className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">GCash</div>
                <div className="text-xs text-muted-foreground">
                  {savedGcash
                    ? `${savedGcash.gcash_number} · ${savedGcash.gcash_name}`
                    : "No GCash account linked yet"}
                </div>
              </div>
              {savedGcash && <Check className="h-4 w-4 text-success shrink-0" />}
              <button
                onClick={() => openWalletGcash(!!savedGcash)}
                className="text-xs font-semibold text-primary hover:underline shrink-0"
              >
                {savedGcash ? "Edit" : "Set up"}
              </button>
            </div>

            {/* Card tile */}
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">Card / Banking</div>
                <div className="text-xs text-muted-foreground">
                  {savedCard
                    ? `${savedCard.bank_name} ••••${savedCard.card_last4} · Exp ${savedCard.card_expiry}`
                    : "No card or bank account linked yet"}
                </div>
              </div>
              {savedCard && <Check className="h-4 w-4 text-success shrink-0" />}
              <button
                onClick={() => openWalletCard(!!savedCard)}
                className="text-xs font-semibold text-primary hover:underline shrink-0"
              >
                {savedCard ? "Edit" : "Set up"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Standalone GCash Setup Panel ── */}
      {walletSection === "setup-gcash" && (
        <section className="mb-6 rounded-2xl border border-border bg-card p-5 animate-slide-up">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-base">{savedGcash ? "Edit GCash" : "Set Up GCash"}</h2>
            <button onClick={() => setWalletSection(null)} className="rounded-full p-1.5 hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
          <GCashForm
            gcashNumber={gcashNumber}
            setGcashNumber={setGcashNumber}
            gcashName={gcashName}
            setGcashName={setGcashName}
            onSave={() => doSaveGcash(() => setWalletSection(null))}
            onBack={() => setWalletSection(null)}
            backLabel="Cancel"
            saveLabel={savedGcash ? "Update GCash" : "Save GCash"}
          />
        </section>
      )}

      {/* ── Standalone Card Setup Panel ── */}
      {walletSection === "setup-card" && (
        <section className="mb-6 rounded-2xl border border-border bg-card p-5 animate-slide-up">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-base">{savedCard ? "Edit Card / Banking" : "Set Up Card / Banking"}</h2>
            <button onClick={() => setWalletSection(null)} className="rounded-full p-1.5 hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
          <CardForm
            cardHolder={cardHolder}
            setCardHolder={setCardHolder}
            cardNumber={cardNumber}
            setCardNumber={setCardNumber}
            cardExpiry={cardExpiry}
            setCardExpiry={setCardExpiry}
            bankName={bankName}
            setBankName={setBankName}
            onSave={() => doSaveCard(() => setWalletSection(null))}
            onBack={() => setWalletSection(null)}
            backLabel="Cancel"
            saveLabel={savedCard ? "Update Card" : "Save Card"}
          />
        </section>
      )}

      {/* Transactions */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t("wallet.history")}</h2>
        {loading ? (
          <div className="space-y-3"><CardSkeleton /><CardSkeleton /></div>
        ) : txs.length === 0 ? (
          <EmptyState illustration={<EmptyWalletIllustration />} title={t("wallet.empty")} description="Top up to start booking faster." />
        ) : (
          <ul className="space-y-2">
            {txs.map((tx) => {
              const displayAmt = tx.type === "payment" ? -Math.abs(tx.amount_php) : Math.abs(tx.amount_php);
              const positive = displayAmt >= 0;
              return (
                <li key={tx.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl shrink-0", positive ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive")}>
                    {positive ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{tx.description ?? tx.type}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(tx.created_at), "PP · p")}</div>
                  </div>
                  <div className={cn("font-bold shrink-0", positive ? "text-success" : "text-foreground")}>
                    {positive ? "+" : ""}₱{Math.abs(displayAmt).toLocaleString()}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Top-up Sheet ── */}
      {showTopup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/40 backdrop-blur-sm animate-fade-in" onClick={closeTopup}>
          <div className="w-full max-w-md rounded-t-3xl bg-card p-6 shadow-elevated animate-slide-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-xl font-extrabold">
                {step === "amount" && t("wallet.topup")}
                {step === "method-select" && "Choose Payment Method"}
                {step === "gcash-form" && "GCash Details"}
                {step === "card-form" && "Card / Banking Details"}
                {step === "confirm" && "Confirm Top Up"}
              </h3>
              <button onClick={closeTopup} className="rounded-full p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
            </div>

            {/* STEP 1 — Amount */}
            {step === "amount" && (
              <>
                {/* Limit notice */}
                <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2">
                  <span className="text-amber-500 text-base leading-none mt-0.5">ℹ</span>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    <span className="font-semibold">Top-up limit:</span> Minimum ₱1 · Maximum ₱50,000 per transaction. Daily limit may apply based on your verification level.
                  </p>
                </div>

                <div className="mb-4 grid grid-cols-4 gap-2">
                  {QUICK_AMOUNTS.map((a) => (
                    <button key={a} onClick={() => setAmount(String(a))}
                      className={cn("rounded-xl border-2 py-2 text-sm font-semibold transition-all",
                        Number(amount) === a ? "border-accent bg-accent/10 text-primary" : "border-border hover:border-accent/40")}>
                      ₱{a.toLocaleString()}
                    </button>
                  ))}
                </div>
                <Label htmlFor="amount">Custom Amount</Label>
                <Input id="amount" type="number" min={1} max={50000} value={amount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 5);
                    const num = Number(raw);
                    setAmount(num > 50000 ? "50000" : raw);
                  }}
                  onKeyDown={(e) => { if (!/[\d\b]/.test(e.key) && !e.ctrlKey && !e.metaKey && e.key.length === 1) e.preventDefault(); }}
                  inputMode="numeric"
                  className="mb-5 h-12 rounded-xl text-lg font-bold" />
                <Button variant="navy" size="lg" className="w-full" onClick={() => setStep("method-select")}
                  disabled={!amount || Number(amount) <= 0}>
                  Continue — ₱{Number(amount || 0).toLocaleString()} <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}

            {/* STEP 2 — Method Select */}
            {step === "method-select" && (
              <div className="space-y-3">
                <button onClick={() => handleMethodNext("gcash")}
                  className="flex w-full items-center gap-4 rounded-2xl border-2 border-border bg-card p-4 hover:border-accent/50 transition-all">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600"><Smartphone className="h-5 w-5" /></div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold">GCash</div>
                    <div className="text-xs text-muted-foreground">
                      {savedGcash ? `${savedGcash.gcash_number} · ${savedGcash.gcash_name}` : "Set up your GCash account"}
                    </div>
                  </div>
                  {savedGcash && <Check className="h-4 w-4 text-success" />}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <button onClick={() => handleMethodNext("card")}
                  className="flex w-full items-center gap-4 rounded-2xl border-2 border-border bg-card p-4 hover:border-accent/50 transition-all">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600"><CreditCard className="h-5 w-5" /></div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold">Card / Banking</div>
                    <div className="text-xs text-muted-foreground">
                      {savedCard ? `${savedCard.bank_name} ••••${savedCard.card_last4}` : "Set up your debit or credit card"}
                    </div>
                  </div>
                  {savedCard && <Check className="h-4 w-4 text-success" />}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <button onClick={() => setStep("amount")} className="mt-2 w-full text-center text-sm text-muted-foreground hover:text-foreground">← Back</button>
              </div>
            )}

            {/* STEP 3 — GCash Form (in topup flow) */}
            {step === "gcash-form" && (
              <GCashForm
                gcashNumber={gcashNumber}
                setGcashNumber={setGcashNumber}
                gcashName={gcashName}
                setGcashName={setGcashName}
                onSave={() => doSaveGcash(() => setStep("confirm"))}
                onBack={() => setStep("method-select")}
                saveLabel="Save & Continue"
              />
            )}

            {/* STEP 4 — Card Form (in topup flow) */}
            {step === "card-form" && (
              <CardForm
                cardHolder={cardHolder}
                setCardHolder={setCardHolder}
                cardNumber={cardNumber}
                setCardNumber={setCardNumber}
                cardExpiry={cardExpiry}
                setCardExpiry={setCardExpiry}
                bankName={bankName}
                setBankName={setBankName}
                onSave={() => doSaveCard(() => setStep("confirm"))}
                onBack={() => setStep("method-select")}
                saveLabel="Save & Continue"
              />
            )}

            {/* STEP 5 — Confirm */}
            {step === "confirm" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-secondary/50 p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-bold text-lg text-primary">₱{Number(amount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Method</span>
                    <span className="font-semibold">
                      {method === "gcash"
                        ? `GCash · ${savedGcash?.gcash_number}`
                        : `${savedCard?.bank_name} ••••${savedCard?.card_last4}`}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Account</span>
                    <span className="font-semibold">
                      {method === "gcash" ? savedGcash?.gcash_name : savedCard?.card_holder}
                    </span>
                  </div>
                </div>
                <Button variant="navy" size="lg" className="w-full" disabled={submitting} onClick={handleTopup}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `Confirm Top Up ₱${Number(amount).toLocaleString()}`}
                </Button>
                <button onClick={() => setStep("method-select")} className="w-full text-center text-sm text-muted-foreground hover:text-foreground">← Change method</button>
                <p className="text-center text-xs text-muted-foreground">Demo wallet — no real charges.</p>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}