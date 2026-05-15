import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Loader2, Globe, User as UserIcon, Mail, Phone, FileText, HelpCircle, CreditCard, MapPin, ChevronRight, Download, Smartphone, Share } from "lucide-react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardSkeleton } from "@/components/Skeleton";
import { sanitizeText, sanitizePhone } from "@/lib/sanitize";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const nameSchema = z.string().min(2).max(80);
const phoneSchema = z.string().regex(/^\+\d{8,15}$/).or(z.literal(""));

export default function Profile() {
  const { user, signOut } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("passenger")
        .select("full_name, email, phone")
        .eq("user_id", user.id)
        .maybeSingle();
      setFullName(data?.full_name ?? "");
      setEmail(data?.email ?? user.email ?? "");
      setPhone(data?.phone ?? "");
      setLoading(false);
    })();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    const cleanName = sanitizeText(fullName, 80);
    const cleanPhone = sanitizePhone(phone);
    const nv = nameSchema.safeParse(cleanName);
    if (!nv.success) {
      toast.error("Please enter a valid name (2–80 characters).");
      return;
    }
    const pv = phoneSchema.safeParse(cleanPhone);
    if (!pv.success) {
      toast.error("Phone must be in international format, e.g. +639171234567 — or leave blank.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("passenger")
        .update({ full_name: cleanName, phone: cleanPhone || null, language: lang })
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Profile updated");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="px-5 py-6">
      <h1 className="mb-5 text-2xl font-extrabold animate-fade-in">{t("profile.title")}</h1>

      {loading ? (
        <CardSkeleton />
      ) : (
        <>
          {/* Avatar block */}
          <section className="mb-6 flex items-center gap-4 rounded-2xl border border-border bg-card p-5 animate-slide-up">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-hero text-2xl font-extrabold text-accent shadow-navy">
              {(fullName || email).slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate font-bold">{fullName || "—"}</div>
              <div className="truncate text-sm text-muted-foreground">{email}</div>
            </div>
          </section>

          {/* Form */}
          <section className="mb-6 space-y-4 rounded-2xl border border-border bg-card p-5 animate-slide-up">
            <div className="space-y-1.5">
              <Label htmlFor="pf-name">Full name</Label>
              <div className="relative">
                <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="pf-name" value={fullName} maxLength={80} onChange={(e) => setFullName(e.target.value)} className="h-12 rounded-xl pl-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="pf-email" value={email} disabled className="h-12 rounded-xl pl-10 bg-secondary" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-phone">Phone</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="pf-phone"
                  value={phone}
                  maxLength={16}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-12 rounded-xl pl-10"
                  placeholder="+639171234567"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                <Globe className="h-4 w-4" /> Language
              </Label>
              <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {([
                  { code:"en",  label:"English",     cc:"EN", color:"bg-blue-700" },
                  { code:"fil", label:"Filipino",     cc:"PH", color:"bg-blue-600" },
                  { code:"ceb", label:"Cebuano",      cc:"PH", color:"bg-red-600" },
                  { code:"ilo", label:"Ilocano",      cc:"PH", color:"bg-yellow-600" },
                  { code:"kap", label:"Kapampangan",  cc:"PH", color:"bg-green-700" },
                  { code:"ja",  label:"Japanese",     cc:"JP", color:"bg-red-500" },
                  { code:"ko",  label:"Korean",       cc:"KR", color:"bg-blue-500" },
                  { code:"zh",  label:"Chinese",      cc:"CN", color:"bg-red-600" },
                  { code:"fr",  label:"French",       cc:"FR", color:"bg-indigo-600" },
                  { code:"es",  label:"Spanish",      cc:"ES", color:"bg-yellow-600" },
                  { code:"de",  label:"German",       cc:"DE", color:"bg-gray-800" },
                  { code:"it",  label:"Italian",      cc:"IT", color:"bg-green-700" },
                  { code:"hi",  label:"Hindi",        cc:"IN", color:"bg-orange-500" },
                  { code:"th",  label:"Thai",         cc:"TH", color:"bg-blue-800" },
                  { code:"vi",  label:"Vietnamese",   cc:"VN", color:"bg-red-700" },
                ] as const).map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLang(l.code)}
                    style={{ minHeight: 44 }}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border-2 px-3 text-sm font-semibold transition-all",
                      lang === l.code ? "border-accent bg-accent/10 text-primary" : "border-border hover:border-accent/40",
                    )}
                  >
                    <span className={`flex h-6 w-7 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold text-white ${l.color}`}>{l.cc}</span>
                    <span className="truncate">{l.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <Button variant="navy" size="lg" className="w-full" disabled={saving} onClick={handleSave}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("profile.save")}
            </Button>
          </section>

          {/* Quick links */}
          <section className="space-y-1 rounded-2xl border border-border bg-card p-2">
            {[
              {to:"/app/faq",icon:HelpCircle,label:"FAQ"},
              {to:"/app/payment-methods",icon:CreditCard,label:"Payment Methods"},
              {to:"/app/route-map",icon:MapPin,label:"Route Map"},
              {to:"/app/policy",icon:FileText,label:"Privacy Policy"},
            ].map(({to,icon:Icon,label})=>(
              <Link key={to} to={to} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-secondary transition-colors">
                <Icon className="h-4 w-4 text-muted-foreground"/>
                <span className="flex-1 text-sm font-semibold">{label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground"/>
              </Link>
            ))}
          </section>

          {/* Download App */}
          <DownloadAppSection />
          <OpenScannerSection />



          <Button variant="outline" size="lg" className="mt-2 w-full text-destructive hover:bg-destructive/5" onClick={handleLogout}>
            <LogOut className="h-4 w-4" /> {t("profile.logout")}
          </Button>

          <p className="mt-8 text-center text-xs text-muted-foreground">{t("profile.version")}</p>
        </>
      )}
    </div>
  );
}


const IOS_STEPS = [
  { step: "1", text: "Open BusPay in Safari (not Chrome)" },
  { step: "2", text: "Tap the Share button at the bottom of Safari" },
  { step: "3", text: "Scroll down and tap Add to Home Screen" },
  { step: "4", text: "Tap Add — BusPay will appear on your home screen!" },
];

const ANDROID_STEPS = [
  { step: "1", text: "Open BusPay in Chrome" },
  { step: "2", text: "Tap the three-dot menu in the top-right corner" },
  { step: "3", text: "Tap Add to Home screen or Install app" },
  { step: "4", text: "Tap Add or Install — BusPay will appear on your home screen!" },
];

const DESKTOP_STEPS = [
  { step: "1", text: "Look for the install icon in your browser address bar" },
  { step: "2", text: "Click Install BusPay" },
  { step: "3", text: "BusPay will open as a standalone app!" },
];

function DownloadAppSection() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  const isInStandaloneMode =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;

  useEffect(() => {
    if (isInStandaloneMode) { setInstalled(true); return; }
    const handler = (e: any) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferredPrompt(null);
    } else {
      setShowInstructions(true);
    }
  };

  if (installed) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/5 p-4 text-center">
        <div className="text-2xl mb-1">✅</div>
        <div className="font-bold text-success text-sm">BusPay is installed!</div>
        <div className="text-xs text-muted-foreground">Find it on your home screen.</div>
      </div>
    );
  }

  const steps = isIos ? IOS_STEPS : isAndroid ? ANDROID_STEPS : DESKTOP_STEPS;

  return (
    <>
      <div className="overflow-hidden rounded-2xl border-2 border-accent/40 bg-gradient-to-br from-accent/10 to-primary/5 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary">
            <img src="/icons/icon-96x96.png" alt="BusPay" className="h-10 w-10 rounded-xl" />
          </div>
          <div>
            <div className="font-extrabold">Download Our App</div>
            <div className="text-xs text-muted-foreground">BusPay · Online Ticketing</div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Install BusPay on your phone for a faster, full-screen experience — works like a native app on both iOS and Android. Free, no app store needed.
        </p>
        <div className="flex gap-2 mb-4">
          <div className="flex items-center gap-1 rounded-xl bg-secondary px-3 py-1.5 text-xs font-semibold">
            <Smartphone className="h-3 w-3" /> iOS
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-secondary px-3 py-1.5 text-xs font-semibold">
            <Smartphone className="h-3 w-3" /> Android
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-secondary px-3 py-1.5 text-xs font-semibold">
            Free
          </div>
        </div>
        <button
          onClick={handleInstall}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Download className="h-4 w-4" /> Install BusPay App
        </button>
      </div>

      {showInstructions && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowInstructions(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-card p-6 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-xl font-extrabold">Install BusPay</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {isIos ? "On iPhone or iPad:" : isAndroid ? "On Android:" : "On your browser:"}
            </p>
            <div className="space-y-3">
              {steps.map(({ step, text }) => (
                <div key={step} className="flex items-start gap-3 text-sm">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold">
                    {step}
                  </span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
            {isIos && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
                <Share className="h-4 w-4 flex-shrink-0" />
                Make sure you are using Safari — other browsers do not support installation on iOS.
              </div>
            )}
            <button
              onClick={() => setShowInstructions(false)}
              className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
}


function OpenScannerSection() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    supabase.rpc("is_driver_or_admin").then(({ data }) => setIsAdmin(!!data));
  }, []);

  if (!isAdmin) return null;

  return (
    <>
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900">
            <img
              src="/scanner-icons/icon-96x96.png"
              alt="QR Reader"
              className="h-10 w-10 rounded-xl"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div>
            <div className="font-extrabold text-sm">QR Reader</div>
            <div className="text-xs text-muted-foreground">Driver boarding scanner</div>
          </div>
        </div>

        {/* Open scanner directly — works inside BusPay PWA without URL bar */}
        <button
          onClick={() => navigate("/scanner")}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all mb-2"
        >
          Open QR Reader
        </button>

        {/* Add to home screen as separate icon */}
        <button
          onClick={() => setShowModal(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary py-3 text-sm font-semibold text-foreground hover:bg-secondary/80 active:scale-[0.98] transition-all"
        >
          <Download className="h-4 w-4" />
          Add QR Reader to Home Screen
        </button>
      </div>

      {/* Shortcut pinning instructions */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm"
          onClick={() => setShowModal(false)}>
          <div className="w-full rounded-t-3xl border border-border bg-card p-6"
            onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-border" />
            <h3 className="text-xl font-extrabold mb-1">Add QR Reader to Home Screen</h3>
            <p className="text-sm text-muted-foreground mb-5">
              {isIos
                ? "Get a separate QR Reader icon on iPhone:"
                : "Get a separate QR Reader icon on Android:"}
            </p>
            {(isIos ? [
              "Go to buspay-team-ace2.vercel.app/scanner in Safari",
              "Tap the Share button (□↑) at the bottom",
              "Tap Add to Home Screen",
              "Tap Add — QR Reader icon appears on your home screen",
            ] : [
              "Long-press the BusPay icon on your home screen",
              "You will see a QR Reader shortcut appear above the icon",
              "Long-press QR Reader and drag it to your home screen",
              "QR Reader icon is now on your home screen — no URL bar!",
            ]).map((text, i) => (
              <div key={i} className="flex items-start gap-3 mb-4">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </div>
                <p className="text-sm pt-0.5">{text}</p>
              </div>
            ))}
            <button onClick={() => setShowModal(false)}
              className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all">
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
