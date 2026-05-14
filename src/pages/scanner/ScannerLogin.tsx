import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export default function ScannerLogin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Auto-redirect if already logged in as driver/admin
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0f0f1a] px-6"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        overscrollBehavior: "none",
      }}>

      {/* Icon + title */}
      <div className="mb-10 flex flex-col items-center gap-4">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl border-2 border-orange-500/30 bg-slate-900 shadow-xl shadow-orange-500/10">
          <img src="/scanner-icons/icon-192x192.png" alt="QR Reader" className="h-20 w-20 rounded-2xl" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-white">QR Reader</h1>
          <p className="text-sm text-slate-400 mt-1">BusPay Driver Boarding App</p>
        </div>
      </div>

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
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 font-bold text-white hover:bg-orange-600 disabled:opacity-50 active:scale-[0.98] transition-all">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign In"}
        </button>
      </form>

      <p className="mt-10 text-center text-xs text-slate-600 max-w-xs">
        Only authorized driver accounts can access this app. Open BusPay → Profile → Open QR Reader for the best experience.
      </p>
    </div>
  );
}
