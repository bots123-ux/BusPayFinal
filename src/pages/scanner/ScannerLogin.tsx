import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock, Mail, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export default function ScannerLogin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  // Swap manifest for installability
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
    const prev = link?.href ?? "";
    if (link) link.href = "/scanner-manifest.json";
    const meta = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
    const prevTheme = meta?.content ?? "";
    if (meta) meta.content = "#0a0f28";

    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);

    return () => {
      if (link) link.href = prev;
      if (meta) meta.content = prevTheme;
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  // Redirect if already logged in as driver/admin
  useEffect(() => {
    if (!user) return;
    supabase.rpc("is_driver_or_admin").then(({ data }) => {
      if (data) navigate("/scanner", { replace: true });
    });
  }, [user]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { toast.error("Invalid email or password"); setLoading(false); return; }
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
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0f28] px-6">
      {/* Icon + title */}
      <div className="mb-8 flex flex-col items-center gap-4">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl border-2 border-orange-500/30 bg-slate-900 shadow-lg shadow-orange-500/10">
          <img src="/scanner-icons/icon-192x192.png" alt="QR Reader" className="h-20 w-20 rounded-2xl" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-white">QR Reader</h1>
          <p className="text-sm text-slate-400 mt-1">BusPay Driver App · Boarding Verification</p>
        </div>
      </div>

      {/* Install button */}
      {!installed && installPrompt && (
        <button onClick={handleInstall}
          className="mb-6 flex items-center gap-2 rounded-2xl bg-orange-500/15 border border-orange-500/30 px-5 py-3 text-sm font-semibold text-orange-400 hover:bg-orange-500/25 transition-colors">
          <Download className="h-4 w-4" /> Install QR Reader App
        </button>
      )}

      {/* Login form */}
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Driver email" required autoComplete="email"
            className="w-full rounded-2xl border border-white/10 bg-slate-900 py-4 pl-11 pr-4 text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
        </div>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" required autoComplete="current-password"
            className="w-full rounded-2xl border border-white/10 bg-slate-900 py-4 pl-11 pr-4 text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
        </div>
        <button type="submit" disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign In to Scanner"}
        </button>
      </form>

      {/* iOS install hint */}
      {!installed && !installPrompt && (
        <div className="mt-8 text-center rounded-2xl border border-white/10 bg-white/5 px-5 py-4 w-full max-w-sm">
          <p className="text-xs font-semibold text-slate-400 mb-1">Install on iPhone</p>
          <p className="text-xs text-slate-500">Open in Safari → Share (□↑) → Add to Home Screen</p>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-slate-600">
        Only authorized driver accounts can access this app.
      </p>
    </div>
  );
}
