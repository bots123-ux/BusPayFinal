import { useEffect, useState, useRef } from "react";
import { Plus, ArrowDownLeft, ArrowUpRight, CreditCard, Smartphone, Loader2, X, ChevronRight, Check, ChevronLeft, Calendar } from "lucide-react";
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
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type TopupStep = "amount" | "method-select" | "gcash-form" | "card-form" | "confirm";
type ModalMode = "topup" | "setup-gcash" | "setup-card";

// ─── Mini Expiry Calendar Picker ───────────────────────────────────────────
function ExpiryCalendarPicker({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const minYear = 2026;
  const parts = value.split("/");
  const initYear = parts[2] ? Math.max(minYear, parseInt(parts[2], 10)) : minYear;

  const [pickerYear, setPickerYear] = useState(initYear);
  const [pickerView, setPickerView] = useState<"month" | "year">("month");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const selectMonth = (monthIdx: number) => {
    const mm = String(monthIdx + 1).padStart(2, "0");
    const yyyy = String(pickerYear);
    const dd = parts[0] && parts[0].length === 2 ? parts[0] : "01";
    onChange(`${dd}/${mm}/${yyyy}`);
    onClose();
  };

  const yearRange = () => {
    const years: number[] = [];
    for (let y = minYear; y <= minYear + 15; y++) years.push(y);
    return years;
  };

  const selMonth = parts[1] ? parseInt(parts[1], 10) - 1 : -1;
  const selYear = parts[2] ? parseInt(parts[2], 10) : -1;

  return (
    <div
      ref={ref}
      className="absolute z-50 top-full mt-2 left-0 w-72 rounded-2xl border border-border bg-card shadow-elevated p-4 animate-fade-in"
    >
      {pickerView === "month" ? (
        <>
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setPickerYear((y) => Math.max(minYear, y - 1))}
              className="rounded-lg p-1.5 hover:bg-secondary transition-colors disabled:opacity-30"
              disabled={pickerYear <= minYear}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPickerView("year")}
              className="font-bold text-sm hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-secondary"
            >
              {pickerYear}
            </button>
            <button
              onClick={() => setPickerYear((y) => y + 1)}
              className="rounded-lg p-1.5 hover:bg-secondary transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {MONTHS.map((m, i) => {
              const isSelected = selMonth === i && selYear === pickerYear;
              return (
                <button
                  key={m}
                  onClick={() => selectMonth(i)}
                  className={cn(
                    "rounded-xl py-2 text-sm font-semibold transition-all",
                    isSelected
                      ? "bg-accent text-primary border-2 border-accent"
                      : "hover:bg-secondary"
                  )}
                >
                  {m}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">Select expiry month</p>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-sm">Select Year</span>
            <button onClick={() => setPickerView("month")} className="text-xs text-primary hover:underline">← Back</button>
          </div>
          <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
            {yearRange().map((y) => (
              <button
                key={y}
                onClick={() => { setPickerYear(y); setPickerView("month"); }}
                className={cn(
                  "rounded-xl py-2 text-sm font-semibold transition-all",
                  y === pickerYear ? "bg-accent text-primary border-2 border-accent" : "hover:bg-secondary"
                )}
              >
                {y}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Wallet Page ───────────────────────────────────────────────────────
export default function Wallet() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [balance, setBalance] = useState<number>(0);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTopup, setShowTopup] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("topup");
  const [amount, setAmount] = useState<string>("500");
  const [method, setMethod] = useState<"gcash" | "card">("gcash");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<TopupStep>("amount");

  const [savedMethods, setSavedMethods] = useState<PaymentMethod[]>([]);

  // GCash form
  const [gcashNumber, setGcashNumber] = useState("");
  const [gcashName, setGcashName] = useState("");

  // Card form
  const [cardHolder, setCardHolder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiryDay, setCardExpiryDay] = useState("");
  const [cardExpiryMonth, setCardExpiryMonth] = useState("");
  const [cardExpiryYear, setCardExpiryYear] = useState("");
  const [bankName, setBankName] = useState("BDO");
  const [showCalendar, setShowCalendar] = useState(false);

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
    setModalMode("topup");
    setStep("amount");
    setShowTopup(true);
  };

  const openSetupGcash = (prefill?: PaymentMethod) => {
    setModalMode("setup-gcash");
    setGcashNumber(prefill?.gcash_number ?? "");
    setGcashName(prefill?.gcash_name ?? "");
    setShowTopup(true);
  };

  const openSetupCard = (prefill?: PaymentMethod) => {
    setModalMode("setup-card");
    setCardHolder(prefill?.card_holder ?? "");
    setCardNumber("");
    const exp = prefill?.card_expiry ?? "";
    const p = exp.split("/");
    setCardExpiryDay(p[0] ?? "");
    setCardExpiryMonth(p[1] ?? "");
    setCardExpiryYear(p[2] ?? "");
    setBankName(prefill?.bank_name ?? "BDO");
    setShowTopup(true);
  };

  const closeTopup = () => {
    setShowTopup(false);
    setStep("amount");
    setShowCalendar(false);
  };

  const handleMethodNext = (m: "gcash" | "card") => {
    setMethod(m);
    if (m === "gcash") {
      if (savedGcash) {
        setStep("confirm");
      } else {
        setGcashNumber(""); setGcashName("");
        setStep("gcash-form");
      }
    } else {
      if (savedCard) {
        setStep("confirm");
      } else {
        setCardHolder(""); setCardNumber("");
        setCardExpiryDay(""); setCardExpiryMonth(""); setCardExpiryYear("");
        setBankName("BDO");
        setStep("card-form");
      }
    }
  };

  const buildExpiry = () =>
    `${cardExpiryDay.padStart(2, "0")}/${cardExpiryMonth.padStart(2, "0")}/${cardExpiryYear}`;

  const expiryPickerValue = `${cardExpiryDay}/${cardExpiryMonth}/${cardExpiryYear}`;

  const validateExpiry = () => {
    const d = parseInt(cardExpiryDay, 10);
    const m = parseInt(cardExpiryMonth, 10);
    const y = parseInt(cardExpiryYear, 10);
    if (!cardExpiryDay || !cardExpiryMonth || !cardExpiryYear) return "Enter full expiry date";
    if (d < 1 || d > 31) return "Day must be 1–31";
    if (m < 1 || m > 12) return "Month must be 1–12";
    if (String(cardExpiryYear).length !== 4 || y < 2026) return "Year must be 2026 or later (4 digits)";
    return null;
  };

  const saveGcash = async (onDone?: () => void) => {
    if (!user) return;
    const num = gcashNumber.trim();
    const name = gcashName.trim();
    if (!/^\+63\d{10}$/.test(num)) { toast.error("Enter a valid GCash number (+63XXXXXXXXXX)"); return; }
    if (name.length < 2) { toast.error("Enter your GCash account name"); return; }
    const { error } = await supabase.from("payment_methods").upsert(
      { user_id: user.id, type: "gcash", gcash_number: num, gcash_name: name },
      { onConflict: "user_id,type" }
    );
    if (error) { toast.error("Failed to save GCash info"); return; }
    await load();
    if (onDone) onDone(); else setStep("confirm");
  };

  const saveCard = async (onDone?: () => void) => {
    if (!user) return;
    const holder = cardHolder.trim();
    const raw = cardNumber.replace(/\s/g, "");
    const expiryErr = validateExpiry();
    if (expiryErr) { toast.error(expiryErr); return; }
    if (holder.length < 2) { toast.error("Enter cardholder name"); return; }
    if (!/^\d{16}$/.test(raw)) { toast.error("Enter a valid 16-digit card number"); return; }
    const { error } = await supabase.from("payment_methods").upsert(
      {
        user_id: user.id, type: "card",
        card_holder: holder, card_last4: raw.slice(-4),
        card_expiry: buildExpiry(), bank_name: bankName,
      },
      { onConflict: "user_id,type" }
    );
    if (error) { toast.error("Failed to save card info"); return; }
    await load();
    if (onDone) onDone(); else setStep("confirm");
  };

  const handleTopup = async () => {
    if (!user) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0 || amt > 50000) {
      toast.error("Enter a valid amount (₱1 – ₱50,000).");
      return;
    }
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

  const formatCardNum = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  const formatGcashDisplay = (digits: string) => {
    const d = digits.replace(/\D/g, "").slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + " " + d.slice(3);
    return d.slice(0, 3) + " " + d.slice(3, 6) + " " + d.slice(6);
  };

  // ─── Shared Form Blocks ────────────────────────────────────────────────────
  const GcashForm = ({ onBack, onSave }: { onBack: () => void; onSave: () => void }) => (
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
      <Button variant="navy" size="lg" className="w-full" onClick={onSave}>Save & Continue</Button>
      <button onClick={onBack} className="w-full text-center text-sm text-muted-foreground hover:text-foreground">← Back</button>
    </div>
  );

  const CardForm = ({ onBack, onSave }: { onBack: () => void; onSave: () => void }) => (
    <div className="space-y-4">
      <div className="rounded-2xl bg-purple-500/5 border border-purple-200 p-3 text-xs text-purple-700">
        This is a demo. Your card will not be charged. Only the last 4 digits are saved.
      </div>
      {/* Bank */}
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
      {/* Cardholder */}
      <div className="space-y-1.5">
        <Label>Cardholder Name <span className="text-destructive">*</span></Label>
        <Input placeholder="JUAN DELA CRUZ" value={cardHolder}
          onChange={(e) => setCardHolder(e.target.value.toUpperCase())} className="h-12 rounded-xl" maxLength={60} />
      </div>
      {/* Card Number */}
      <div className="space-y-1.5">
        <Label>Card Number <span className="text-destructive">*</span></Label>
        <Input placeholder="0000 0000 0000 0000" value={cardNumber}
          onChange={(e) => setCardNumber(formatCardNum(e.target.value))}
          className="h-12 rounded-xl font-mono tracking-widest" maxLength={19} inputMode="numeric"
          onKeyDown={(e) => { if (!/[\d\s\b]/.test(e.key) && !e.ctrlKey && !e.metaKey && e.key.length === 1) e.preventDefault(); }} />
      </div>
      {/* Expiry — DD / MM / YYYY with calendar */}
      <div className="space-y-1.5">
        <Label>Expiry Date <span className="text-destructive">*</span></Label>
        <div className="relative flex items-center gap-1.5">
          <Input
            placeholder="DD"
            value={cardExpiryDay}
            onChange={(e) => setCardExpiryDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
            onBlur={() => {
              const d = parseInt(cardExpiryDay, 10);
              if (d >= 1) setCardExpiryDay(String(Math.min(31, d)).padStart(2, "0"));
            }}
            className="h-12 w-14 rounded-xl text-center font-mono text-base"
            inputMode="numeric" maxLength={2}
          />
          <span className="text-base font-bold text-muted-foreground">/</span>
          <Input
            placeholder="MM"
            value={cardExpiryMonth}
            onChange={(e) => setCardExpiryMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
            onBlur={() => {
              const m = parseInt(cardExpiryMonth, 10);
              if (m >= 1) setCardExpiryMonth(String(Math.min(12, m)).padStart(2, "0"));
            }}
            className="h-12 w-14 rounded-xl text-center font-mono text-base"
            inputMode="numeric" maxLength={2}
          />
          <span className="text-base font-bold text-muted-foreground">/</span>
          <Input
            placeholder="YYYY"
            value={cardExpiryYear}
            onChange={(e) => setCardExpiryYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onBlur={() => {
              const y = parseInt(cardExpiryYear, 10);
              if (y > 0 && y < 2026) setCardExpiryYear("2026");
            }}
            className="h-12 w-20 rounded-xl text-center font-mono text-base"
            inputMode="numeric" maxLength={4}
          />
          <button
            type="button"
            onClick={() => setShowCalendar((v) => !v)}
            className="ml-1 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border-2 border-border hover:border-accent/50 hover:bg-secondary transition-all"
          >
            <Calendar className="h-5 w-5 text-muted-foreground" />
          </button>
          {showCalendar && (
            <ExpiryCalendarPicker
              value={expiryPickerValue}
              onChange={(v) => {
                const p = v.split("/");
                setCardExpiryDay(p[0] ?? "");
                setCardExpiryMonth(p[1] ?? "");
                setCardExpiryYear(p[2] ?? "");
              }}
              onClose={() => setShowCalendar(false)}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">Day (01–31) / Month (01–12) / Year (2026+) · tap 📅 to pick month</p>
      </div>
      <Button variant="navy" size="lg" className="w-full" onClick={onSave}>Save & Continue</Button>
      <button onClick={onBack} className="w-full text-center text-sm text-muted-foreground hover:text-foreground">← Back</button>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="px-5 py-6">
      <h1 className="mb-5 text-2xl font-extrabold animate-fade-in">{t("wallet.title")}</h1>

      {/* Balance card */}
      <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-hero p-6 text-primary-foreground shadow-navy animate-slide-up">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">{t("wallet.balance")}</p>
        {loading ? (
          <div className="mt-2 h-10 w-40 animate-shimmer rounded-lg" />
        ) : (
          <div className="mt-1 text-4xl font-extrabold">
            ₱{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        )}
        <Button variant="hero" size="lg" className="mt-5 w-full" onClick={openTopup}>
          <Plus className="h-5 w-5" /> {t("wallet.topup")}
        </Button>
      </section>

      {/* Payment Methods — always visible */}
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Payment Methods</h2>
        <div className="space-y-2">
          {/* GCash */}
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 flex-shrink-0">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold">GCash</div>
              <div className="text-xs text-muted-foreground truncate">
                {savedGcash
                  ? `${savedGcash.gcash_number} · ${savedGcash.gcash_name}`
                  : "Not set up yet"}
              </div>
            </div>
            {savedGcash && <Check className="h-4 w-4 text-success flex-shrink-0" />}
            <button
              onClick={() => openSetupGcash(savedGcash)}
              className="text-xs font-semibold text-primary hover:underline flex-shrink-0 ml-1"
            >
              {savedGcash ? "Edit" : "Set up"}
            </button>
          </div>

          {/* Card / Banking */}
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 flex-shrink-0">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold">Card / Banking</div>
              <div className="text-xs text-muted-foreground truncate">
                {savedCard
                  ? `${savedCard.bank_name} ••••${savedCard.card_last4} · Exp ${savedCard.card_expiry}`
                  : "Not set up yet"}
              </div>
            </div>
            {savedCard && <Check className="h-4 w-4 text-success flex-shrink-0" />}
            <button
              onClick={() => openSetupCard(savedCard)}
              className="text-xs font-semibold text-primary hover:underline flex-shrink-0 ml-1"
            >
              {savedCard ? "Edit" : "Set up"}
            </button>
          </div>
        </div>
      </section>

      {/* Transaction history */}
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
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", positive ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive")}>
                    {positive ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">{tx.description ?? tx.type}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(tx.created_at), "PP · p")}</div>
                  </div>
                  <div className={cn("font-bold", positive ? "text-success" : "text-foreground")}>
                    {positive ? "+" : ""}₱{Math.abs(displayAmt).toLocaleString()}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Modal ── */}
      {showTopup && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-primary/40 backdrop-blur-sm animate-fade-in"
          onClick={closeTopup}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-card p-6 shadow-elevated animate-slide-up max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-xl font-extrabold">
                {modalMode === "setup-gcash" && "GCash Details"}
                {modalMode === "setup-card" && "Card / Banking Details"}
                {modalMode === "topup" && (
                  <>
                    {step === "amount" && t("wallet.topup")}
                    {step === "method-select" && "Choose Payment Method"}
                    {step === "gcash-form" && "GCash Details"}
                    {step === "card-form" && "Card / Banking Details"}
                    {step === "confirm" && "Confirm Top Up"}
                  </>
                )}
              </h3>
              <button onClick={closeTopup} className="rounded-full p-2 hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ── Standalone setup modes ── */}
            {modalMode === "setup-gcash" && (
              <GcashForm
                onBack={closeTopup}
                onSave={() => saveGcash(() => { toast.success("GCash saved!"); closeTopup(); })}
              />
            )}
            {modalMode === "setup-card" && (
              <CardForm
                onBack={closeTopup}
                onSave={() => saveCard(() => { toast.success("Card saved!"); closeTopup(); })}
              />
            )}

            {/* ── Top-up flow ── */}
            {modalMode === "topup" && (
              <>
                {/* STEP 1 — Amount */}
                {step === "amount" && (
                  <>
                    {/* Limit notice */}
                    <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-0.5">
                      <p className="font-semibold">⚠ Top-up Limits</p>
                      <p>Single transaction: up to <span className="font-bold">₱50,000</span></p>
                      <p>Daily limit: <span className="font-bold">₱100,000</span> per account</p>
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
                    <Input
                      id="amount" type="number" min={1} max={50000} value={amount}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 5);
                        const num = Number(raw);
                        setAmount(num > 50000 ? "50000" : raw);
                      }}
                      onKeyDown={(e) => { if (!/[\d\b]/.test(e.key) && !e.ctrlKey && !e.metaKey && e.key.length === 1) e.preventDefault(); }}
                      inputMode="numeric"
                      className="mb-5 h-12 rounded-xl text-lg font-bold"
                    />
                    <Button variant="navy" size="lg" className="w-full"
                      onClick={() => setStep("method-select")}
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

                {/* STEP 3 — GCash Form */}
                {step === "gcash-form" && (
                  <GcashForm
                    onBack={() => setStep("method-select")}
                    onSave={() => saveGcash()}
                  />
                )}

                {/* STEP 4 — Card Form */}
                {step === "card-form" && (
                  <CardForm
                    onBack={() => setStep("method-select")}
                    onSave={() => saveCard()}
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
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
