import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Loader2, ScanLine } from "lucide-react";

export function ScannerGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate(`/auth?redirect=/scanner`, { replace: true });
      return;
    }
    supabase.rpc("is_driver_or_admin").then(({ data }) => {
      if (!data) { navigate("/app", { replace: true }); return; }
      setAllowed(true);
      setChecking(false);
    });
  }, [user]);

  if (checking) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/20">
        <ScanLine className="h-8 w-8 animate-pulse text-orange-400" />
      </div>
      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
    </div>
  );

  if (!allowed) return null;
  return <>{children}</>;
}
