import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScanLine, Loader2, Lock, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function ScannerLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("Invalid credentials");
      setLoading(false);
      return;
    }
    // Check if driver or admin
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6">
      {/* Icon */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-900 border-2 border-orange-500/30 shadow-lg">
          <img src="/scanner-icons/icon-96x96.png" alt="Scanner" className="h-14 w-14 rounded-2xl" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-white">BusPay Scanner</h1>
          <p className="text-sm text-slate-400">Driver boarding verification</p>
        </div>
      </div>

      {/* Login form */}
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Driver email" required autoComplete="email"
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 py-4 pl-11 pr-4 text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
        </div>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" required autoComplete="current-password"
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 py-4 pl-11 pr-4 text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
        </div>
        <button type="submit" disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 font-bold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><ScanLine className="h-5 w-5" /> Sign In to Scanner</>}
        </button>
      </form>
      <p className="mt-8 text-center text-xs text-slate-600">
        Only authorized driver accounts can access this app.
      </p>
    </div>
  );
}
