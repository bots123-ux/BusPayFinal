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

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character");

const nameSchema = z.string().min(2, "Name is too short").max(80);

const phoneSchema = z
  .string()
  .regex(/^\+\d{8,15}$/, "Use international format, e.g. +63917...");

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

  const redirectTo = search.get("redirect") || "/app";

  const [mode, setMode] = useState<Mode>(
    search.get("mode") === "signup" ? "signup" : "signin"
  );

  const [method, setMethod] = useState<Method>("email");

  const [submitting, setSubmitting] = useState(false);
  const [lockMs, setLockMs] = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");

  useEffect(() => {
    if (user) navigate(redirectTo, { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (email) setLockMs(getLockRemainingMs(email));
  }, [email]);

  useEffect(() => {
    if (lockMs <= 0) return;

    const timer = setInterval(() => {
      const r = getLockRemainingMs(email);

      setLockMs(r);

      if (r <= 0) clearInterval(timer);
    }, 1000);

    return () => clearInterval(timer);
  }, [lockMs]);

  const isLocked = lockMs > 0 && mode === "signin";

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();

    const cleanEmail = sanitizeEmail(email);

    if (!emailSchema.safeParse(cleanEmail).success) {
      toast.error("Please enter a valid email.");
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        cleanEmail,
        {
          redirectTo: `${window.location.origin}/auth?mode=reset`,
        }
      );

      if (error) throw error;

      setForgotSent(true);
    } catch (err: any) {
      toast.error(friendlyError(err?.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (isLocked) return;

    const cleanEmail = sanitizeEmail(email);

    if (!emailSchema.safeParse(cleanEmail).success) {
      toast.error("Please enter a valid email.");
      return;
    }

    if (!passwordSchema.safeParse(password).success) {
      toast.error(
        "Password must be 8+ characters and include uppercase, lowercase, and special characters."
      );
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "signup") {
        const cleanName = sanitizeText(fullName, 80);

        if (!nameSchema.safeParse(cleanName).success) {
          toast.error("Name is too short.");
          setSubmitting(false);
          return;
        }

        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/app`,
            data: {
              full_name: cleanName,
            },
          },
        });

        if (error) throw error;

        await supabase.auth.signOut();

        toast.success("Account created! Please sign in.");

        setMode("signin");
        setPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          const r = recordFailedAttempt(cleanEmail);

          if (r.locked) setLockMs(r.remainingMs);

          throw error;
        }

        clearAttempts(cleanEmail);

        navigate(redirectTo, { replace: true });
      }
    } catch (err: any) {
      toast.error(friendlyError(err?.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    if (isLocked) return;

    setSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/app`,
        },
      });

      if (error) throw error;
    } catch (err: any) {
      toast.error(friendlyError(err?.message));
      setSubmitting(false);
    }
  };

  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault();

    if (isLocked) return;

    const cleanPhone = sanitizePhone(phone);

    if (!phoneSchema.safeParse(cleanPhone).success) {
      toast.error("Use international format, e.g. +63917...");
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: cleanPhone,
      });

      if (error) throw error;

      setOtpSent(true);
      toast.success("Code sent!");
    } catch (err: any) {
      toast.error(friendlyError(err?.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();

    setSubmitting(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: sanitizePhone(phone),
        token: otp.replace(/\D/g, "").slice(0, 6),
        type: "sms",
      });

      if (error) {
        const r = recordFailedAttempt(phone);

        if (r.locked) setLockMs(r.remainingMs);

        throw error;
      }

      clearAttempts(phone);

      navigate("/app", { replace: true });
    } catch (err: any) {
      toast.error(friendlyError(err?.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
        <header className="mb-8 animate-fade-in">
          <Logo />
        </header>

        <section className="flex-1">
          <div className="mb-6">
            <h1 className="text-3xl font-extrabold animate-slide-up">
              {mode === "signin" ? t("auth.signIn") : t("auth.signUp")}
            </h1>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">{t("auth.fullName")} *</Label>

                <div className="relative">
                  <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                  <Input
                    id="name"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    maxLength={80}
                    required
                    className="h-12 rounded-xl pl-10"
                    placeholder="Juan Dela Cruz"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">{t("auth.email")} *</Label>

              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  required
                  className="h-12 rounded-xl pl-10"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">
                {t("auth.password")} *
              </Label>

              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "signup"
                      ? "new-password"
                      : "current-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={128}
                  required
                  className="h-12 rounded-xl pl-10 pr-10"
                  placeholder="••••••••"
                />

                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowPassword((p) => !p);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">
                  Confirm Password *
                </Label>

                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) =>
                    setConfirmPassword(e.target.value)
                  }
                  maxLength={128}
                  required
                  className="h-12 rounded-xl"
                  placeholder="Confirm your password"
                />
              </div>
            )}

            <Button
              type="submit"
              variant="navy"
              size="lg"
              className="w-full"
              disabled={submitting || isLocked}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "signin" ? (
                t("auth.signIn")
              ) : (
                t("auth.signUp")
              )}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}