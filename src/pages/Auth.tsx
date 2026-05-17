import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import {
  Mail,
  Phone,
  Lock,
  User as UserIcon,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Eye,
  EyeOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  sanitizeEmail,
  sanitizePhone,
  sanitizeText,
} from "@/lib/sanitize";

import {
  attemptsRemaining,
  clearAttempts,
  getLockRemainingMs,
  recordFailedAttempt,
} from "@/lib/loginThrottle";

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

  return `${Math.floor(total / 60)}:${(total % 60)
    .toString()
    .padStart(2, "0")}`;
}

function friendlyError(msg: string): string {
  if (!msg) return "Something went wrong. Please try again.";

  if (msg.includes("rate limit")) {
    return "Too many requests. Please wait a few minutes and try again.";
  }

  if (msg.includes("Email not confirmed")) {
    return "Please check your email to confirm your account first.";
  }

  if (msg.includes("Invalid login credentials")) {
    return "Incorrect email or password. Please try again.";
  }

  if (msg.includes("User already registered")) {
    return "This email is already registered. Try signing in instead.";
  }

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
  }, [user, navigate, redirectTo]);

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
  }, [lockMs, email]);

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