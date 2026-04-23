import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { BottomNav } from "./BottomNav";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function AppShell() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [newTickets, setNewTickets] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadCounts = async () => {
      const { count: notifCount } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("read", false)
        .eq("user_id", user.id);

      const { count: ticketCount } = await supabase
        .from("ticket")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("status", ["pending", "paid"]);

      if (!cancelled) {
        setUnread(notifCount ?? 0);
        setNewTickets(ticketCount ?? 0);
      }
    };

    loadCounts();

    const ch1 = supabase
      .channel(`notif-badge-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => loadCounts())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => loadCounts())
      .subscribe();

    const ch2 = supabase
      .channel(`ticket-badge-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket", filter: `user_id=eq.${user.id}` }, () => loadCounts())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [user]);

  // Clear notification badge when visiting Alerts tab
  useEffect(() => {
    if (!user) return;
    if (location.pathname === "/app/notifications" && unread > 0) {
      // Mark all as read in DB — the badge will drop to 0 via the UPDATE subscription
      supabase.from("notifications").update({ read: true })
        .eq("user_id", user.id).eq("read", false)
        .then(() => setUnread(0));
    }
  }, [location.pathname, user]);

  // Clear ticket badge when visiting Tickets tab
  useEffect(() => {
    if (location.pathname === "/app/tickets") {
      setNewTickets(0);
    }
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-secondary border-t-accent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-2xl">
        <Outlet />
      </div>
      <BottomNav unreadCount={unread} ticketCount={newTickets} />
    </div>
  );
}
