import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Loader2, Lock, Mail, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function ScannerLogin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const isIos = useMemo(() => /iphone|ipad|ipod/i.test(navigator.userAgent), []);
  const isAndroid = useMemo(() => /android/i.test(navigator.userAgent), []);

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
    const prev = link?.href ?? "";
    if (link) link.href = "/scanner-manifest.json";

    const meta = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
    const prevTheme = meta?.content ?? "";
    if (meta) meta.content = "#ffffff";

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const installedHandler = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);

    return () => {
      if (link) link.href = prev;
      if (meta) meta.content = prevTheme;
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase.rpc("is_driver_or_admin").then(({ data }) => {
      if (data) navigate("/scanner", { replace: true });
    });
  }, [navigate, user]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("Invalid email or password");
      setLoading(false);
      return;
    }

    const { data: allowed } = await supabase.rpc("is_driver_or_admin");
    if (!allowed) {
      await supabase.auth.signOut();
      toast.error("This account is not authorized as a driver.");
      setLoading(false);
      return;
    }

    navigate("/scanner", { replace: true });
  };

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
      return;
    }

    setShowInstallHelp(true);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-slate-950">
      <div className="mb-8 flex flex-col items-center gap-4">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-orange-100 bg-white shadow-sm">
          <img src="/scanner-icons/icon-192x192.png" alt="QR Reader" className="h-20 w-20 rounded-2xl" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-extrabold">QR Reader</h1>
          <p className="mt-1 text-sm text-slate-500">BusPay Driver App - Boarding Verification</p>
        </div>
      </div>

      {!installed && (
        <button
          onClick={handleInstall}
          className="mb-6 flex items-center gap-2 rounded-2xl border border-orange-200 bg-white px-5 py-3 text-sm font-bold text-orange-600 shadow-sm transition-colors hover:bg-orange-50"
        >
          <Download className="h-4 w-4" />
          {installPrompt ? "Install QR Reader App" : "How to Install QR Reader"}
        </button>
      )}

      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Driver email"
            required
            autoComplete="email"
            className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-11 pr-4 text-slate-950 shadow-sm placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
          />
        </div>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            required
            autoComplete="current-password"
            className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-11 pr-4 text-slate-950 shadow-sm placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 font-bold text-white shadow-lg shadow-orange-500/20 transition-colors hover:bg-orange-600 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign In to Scanner"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-500">Only authorized driver accounts can access this app.</p>

      {showInstallHelp && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 backdrop-blur-sm" onClick={() => setShowInstallHelp(false)}>
          <div className="w-full rounded-t-3xl border-t border-slate-200 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-200" />
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50">
                <Smartphone className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-lg font-extrabold">Install QR Reader</p>
                <p className="text-sm text-slate-500">Use your browser install option if a prompt does not appear.</p>
              </div>
            </div>
            {(isIos
              ? ["Open this page in Safari.", "Tap Share at the bottom.", "Tap Add to Home Screen.", "Tap Add."]
              : isAndroid
                ? ["Open this page in Chrome.", "Tap the three-dot menu.", "Tap Install app or Add to Home screen.", "Confirm Install."]
                : ["Open this page in Chrome or Edge.", "Click the install icon in the address bar, or open the browser menu.", "Choose Install QR Reader or Install app.", "Confirm Install."]
            ).map((text, index) => (
              <div key={text} className="mb-3 flex items-center gap-3">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">{index + 1}</div>
                <p className="text-sm font-medium text-slate-700">{text}</p>
              </div>
            ))}
            <button onClick={() => setShowInstallHelp(false)} className="mt-4 w-full rounded-2xl bg-orange-500 py-3.5 font-bold text-white">
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
