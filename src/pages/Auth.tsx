import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Mail, Phone, Lock, User as UserIcon, AlertCircle, Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeEmail, sanitizePhone, sanitizeText } from "@/lib/sanitize";
import { attemptsRemaining, clearAttempts, getLockRemainingMs, recordFailedAttempt } from "@/lib/loginThrottle";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const emailSchema = z.string().email().max(254);
const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(128);
const nameSchema = z.string().min(2, "Name is too short").max(80);
const phoneSchema = z.string().regex(/^\+\d{8,15}$/, "Use international format, e.g. +63917...");
type Mode = "signin" | "signup" | "forgot";
type Method = "email" | "phone";

function formatTime(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}
function friendlyError(msg: string): string {
  if (!msg) return "Something went wrong. Please try again.";
  if (msg.includes("rate limit")) return "Too many requests. Please wait a few minutes and try again.";
  if (msg.includes("Email not confirmed")) return "Please check your email to confirm your account first.";
  if (msg.includes("Invalid login credentials")) return "Incorrect email or password. Please try again.";
  if (msg.includes("User already registered")) return "This email is already registered. Try signing in instead.";
  if (msg.includes("Password should be")) return "Password must be at least 8 characters.";
  return msg;
}

export default function Auth() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search] = useSearchParams();
  const [mode, setMode] = useState<Mode>(search.get("mode") === "signup" ? "signup" : "signin");
  const [method, setMethod] = useState<Method>("email");
  const [submitting, setSubmitting] = useState(false);
  const [lockMs, setLockMs] = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");

  useEffect(() => { if (user) navigate("/app", { replace: true }); }, [user, navigate]);

  // Update lock state when email changes — per-email throttle
  useEffect(() => {
    if (email) setLockMs(getLockRemainingMs(email));
  }, [email]);
  useEffect(() => {
    if (lockMs <= 0) return;
    const timer = setInterval(() => { const r = getLockRemainingMs(); setLockMs(r); if (r <= 0) clearInterval(timer); }, 1000);
    return () => clearInterval(timer);
  }, [lockMs]);
  const isLocked = lockMs > 0 && mode === "signin";

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    const cleanEmail = sanitizeEmail(email);
    if (!emailSchema.safeParse(cleanEmail).success) { toast.error("Please enter a valid email."); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: `${window.location.origin}/auth?mode=reset` });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: any) { toast.error(friendlyError(err?.message)); }
    finally { setSubmitting(false); }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    const cleanEmail = sanitizeEmail(email);
    if (!emailSchema.safeParse(cleanEmail).success) { toast.error("Please enter a valid email."); return; }
    if (!passwordSchema.safeParse(password).success) { toast.error("Password must be at least 8 characters."); return; }
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const cleanName = sanitizeText(fullName, 80);
        if (!nameSchema.safeParse(cleanName).success) { toast.error("Name is too short."); setSubmitting(false); return; }
        const { error } = await supabase.auth.signUp({ email: cleanEmail, password, options: { emailRedirectTo: `${window.location.origin}/app`, data: { full_name: cleanName } } });
        if (error) throw error;
        await supabase.auth.signOut();
        toast.success("Account created! Please sign in.");
        setMode("signin"); setPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) { const r = recordFailedAttempt(cleanEmail); if (r.locked) setLockMs(r.remainingMs); throw error; }
        clearAttempts(cleanEmail); navigate("/app", { replace: true });
      }
    } catch (err: any) { toast.error(friendlyError(err?.message)); }
    finally { setSubmitting(false); }
  };

  const handleGoogle = async () => {
    if (isLocked) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/app` } });
      if (error) throw error;
    } catch (err: any) { toast.error(friendlyError(err?.message)); setSubmitting(false); }
  };

  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    const cleanPhone = sanitizePhone(phone);
    if (!phoneSchema.safeParse(cleanPhone).success) { toast.error("Use international format, e.g. +63917..."); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: cleanPhone });
      if (error) throw error;
      setOtpSent(true); toast.success("Code sent!");
    } catch (err: any) { toast.error(friendlyError(err?.message)); }
    finally { setSubmitting(false); }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ phone: sanitizePhone(phone), token: otp.replace(/\D/g, "").slice(0, 6), type: "sms" });
      if (error) { const r = recordFailedAttempt(cleanEmail); if (r.locked) setLockMs(r.remainingMs); throw error; }
      clearAttempts(cleanEmail); navigate("/app", { replace: true });
    } catch (err: any) { toast.error(friendlyError(err?.message)); }
    finally { setSubmitting(false); }
  };

  if (mode === "forgot") return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
        <header className="mb-8 animate-fade-in"><Logo /></header>
        <section className="flex-1">
          <button type="button" onClick={() => { setMode("signin"); setForgotSent(false); }}
            className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </button>
          <h1 className="mb-2 text-3xl font-extrabold">Forgot password?</h1>
          <p className="mb-6 text-sm text-muted-foreground">Enter your email and we will send you a reset link.</p>
          {forgotSent ? (
            <div className="rounded-2xl border-2 border-accent/30 bg-accent/5 p-6 text-center">
              <div className="mb-3 text-4xl">📧</div>
              <h2 className="mb-1 font-bold text-primary">Check your inbox!</h2>
              <p className="text-sm text-muted-foreground">Reset link sent to <strong>{email}</strong></p>
              <button type="button" onClick={() => { setForgotSent(false); setEmail(""); }}
                className="mt-4 text-xs text-muted-foreground underline hover:text-foreground">Try a different email</button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">Email address</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    maxLength={254} required className="h-12 rounded-xl pl-10" placeholder="you@example.com" />
                </div>
              </div>
              <Button type="submit" variant="navy" size="lg" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
              </Button>
            </form>
          )}
        </section>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
        <header className="mb-8 animate-fade-in"><Logo /></header>
        <section className="flex-1">
          <div className="mb-6">
            <h1 className="text-3xl font-extrabold animate-slide-up">{mode === "signin" ? t("auth.signIn") : t("auth.signUp")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "signin" ? t("auth.noAccount") : t("auth.haveAccount")}{" "}
              <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="font-semibold text-primary underline-offset-2 hover:underline">
                {mode === "signin" ? t("auth.signUp") : t("auth.signIn")}
              </button>
            </p>
          </div>
          {isLocked && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
              <div className="text-sm">
                <div className="font-bold text-destructive">{t("auth.lockTitle")}</div>
                <div>{t("auth.lockBody")} <span className="font-mono font-bold">{formatTime(lockMs)}</span></div>
              </div>
            </div>
          )}
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
            {(["email", "phone"] as const).map((m) => (
              <button key={m} onClick={() => { setMethod(m); setOtpSent(false); }}
                className={cn("rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                  method === m ? "bg-card text-primary shadow-soft" : "text-muted-foreground")}>
                {m === "email" ? "Email" : "Phone"}
              </button>
            ))}
          </div>
          {method === "email" ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">{t("auth.fullName")}</Label>
                  <div className="relative">
                    <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)}
                      maxLength={80} required className="h-12 rounded-xl pl-10" placeholder="Juan Dela Cruz" />
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="email" type="email" autoComplete="email" value={email}
                    onChange={(e) => setEmail(e.target.value)} maxLength={254} required className="h-12 rounded-xl pl-10" placeholder="you@example.com" />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  {mode === "signin" && (
                    <button type="button" onClick={() => setMode("forgot")} className="text-xs font-semibold text-primary hover:underline">
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="password" type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    maxLength={128} required className="h-12 rounded-xl pl-10 pr-10" placeholder="••••••••" style={{WebkitAppearance:"none"}} />
                  <button type="button"
                    onMouseDown={(e) => { e.preventDefault(); setShowPassword(p => !p); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {mode === "signin" && !isLocked && attemptsRemaining(email) < 5 && (
                  <p className="text-xs text-destructive">{attemptsRemaining(email)} attempts remaining before lockout</p>
                )}
              </div>
              <Button type="submit" variant="navy" size="lg" className="w-full" disabled={submitting || isLocked}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signin" ? t("auth.signIn") : t("auth.signUp")}
              </Button>
            </form>
          ) : (
            <form onSubmit={otpSent ? handleVerifyOtp : handleSendOtp} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone">{t("auth.phone")}</Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="phone" type="tel" autoComplete="tel" value={phone}
                    onChange={(e) => setPhone(e.target.value)} maxLength={16} required disabled={otpSent}
                    className="h-12 rounded-xl pl-10" placeholder="+639171234567" />
                </div>
              </div>
              {otpSent && (
                <div className="space-y-1.5">
                  <Label htmlFor="otp">{t("auth.otp")}</Label>
                  <Input id="otp" inputMode="numeric" value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g,"").slice(0,6))}
                    maxLength={6} required className="h-12 rounded-xl text-center text-2xl tracking-[0.5em] font-mono" placeholder="000000" />
                </div>
              )}
              <Button type="submit" variant="navy" size="lg" className="w-full" disabled={submitting || isLocked}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : otpSent ? t("auth.verifyOtp") : t("auth.sendOtp")}
              </Button>
              {otpSent && <button type="button" onClick={() => setOtpSent(false)} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground">Use a different number</button>}
            </form>
          )}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("auth.or")}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Button type="button" variant="outline" size="lg" className="w-full" disabled={submitting || isLocked} onClick={handleGoogle}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.98 10.98 0 001 12c0 1.78.43 3.46 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {t("auth.continueWithGoogle")}
          </Button>
        </section>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to our terms. <Link to="/" className="underline">Back to home</Link>
        </p>
      </div>
    </main>
  );
}
