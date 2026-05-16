import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) {
      // Save the intended admin URL so Auth can redirect back
      navigate(`/auth?redirect=${encodeURIComponent(location.pathname)}`, { replace: true });
      return;
    }
    supabase.rpc("is_admin").then(({ data }) => {
      if (!data) { navigate("/app", { replace: true }); return; }
      setIsAdmin(true);
      setChecking(false);
    });
  }, [user]);

  if (checking) return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
    </div>
  );

  if (!isAdmin) return null;
  return <>{children}</>;
}
