import { useEffect, useRef, useState } from "react";
import { Bell, Ticket, CreditCard, Info, Check, Trash2, X, BellOff } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { CardSkeleton } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Notif {
  id: string;
  type: "booking" | "payment" | "reminder" | "system";
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

const TYPE_CONFIG: Record<Notif["type"], { icon: typeof Bell; color: string; bg: string }> = {
  booking:  { icon: Ticket,     color: "text-accent",             bg: "bg-accent/15" },
  payment:  { icon: CreditCard, color: "text-emerald-500",        bg: "bg-emerald-500/15" },
  reminder: { icon: Bell,       color: "text-amber-500",          bg: "bg-amber-500/15" },
  system:   { icon: Info,       color: "text-blue-500",           bg: "bg-blue-500/15" },
};

export default function Notifications() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showClear, setShowClear] = useState(false);
  const markedReadRef = useRef<Set<string>>(new Set());

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications").select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data as Notif[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`notif-page-${user.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as Notif;
          setItems((prev) => [n, ...prev]);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Mark as read only once
  useEffect(() => {
    if (!user || items.length === 0) return;
    const ids = items.filter((i) => !i.read && !markedReadRef.current.has(i.id)).map((i) => i.id);
    if (ids.length === 0) return;
    ids.forEach((id) => markedReadRef.current.add(id));
    supabase.from("notifications").update({ read: true }).in("id", ids).then(() => {
      setItems((prev) => prev.map((n) => ids.includes(n.id) ? { ...n, read: true } : n));
    });
  }, [user, items]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) toast.error("Failed to delete.");
    else {
      setItems((prev) => prev.filter((n) => n.id !== id));
      markedReadRef.current.delete(id);
    }
    setDeleting(null);
  };

  const handleClearAll = async () => {
    if (!user) return;
    const { error } = await supabase.from("notifications").delete().eq("user_id", user.id);
    if (error) toast.error("Failed to clear.");
    else { setItems([]); markedReadRef.current.clear(); toast.success("All notifications cleared."); }
    setShowClear(false);
  };

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <div className="px-5 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between animate-fade-in">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold">{t("notif.title")}</h1>
            {unreadCount > 0 && (
              <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white animate-scale-in">
                {unreadCount}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        {items.length > 0 && (
          <button onClick={() => setShowClear(true)}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-destructive hover:text-destructive transition-colors">
            <Trash2 className="h-3.5 w-3.5" /> Clear all
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-secondary">
            <BellOff className="h-9 w-9 text-muted-foreground" />
          </div>
          <h3 className="mb-1 font-bold text-lg">{t("notif.empty")}</h3>
          <p className="text-sm text-muted-foreground max-w-xs">We will notify you about bookings, payments, and trip reminders here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n, i) => {
            const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system;
            const Icon = cfg.icon;
            const timeAgo = formatDistanceToNow(new Date(n.created_at), { addSuffix: true });
            const fullDate = format(new Date(n.created_at), "MMM d, yyyy · h:mm a");
            return (
              <div key={n.id}
                className={cn(
                  "group relative flex items-start gap-4 rounded-2xl border p-4 transition-all animate-slide-up",
                  n.read
                    ? "border-border bg-card"
                    : "border-accent/30 bg-gradient-to-r from-accent/[0.06] to-transparent",
                )}
                style={{ animationDelay: `${i * 25}ms` }}>
                {/* Unread dot */}
                {!n.read && (
                  <span className="absolute right-4 top-4 h-2 w-2 rounded-full bg-red-500" />
                )}
                {/* Icon */}
                <div className={cn("flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl", cfg.bg)}>
                  <Icon className={cn("h-5 w-5", cfg.color)} />
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0 pr-6">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn("font-semibold leading-snug", !n.read && "text-foreground")}>{n.title}</p>
                  </div>
                  {n.body && (
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{n.body}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground" title={fullDate}>{timeAgo}</span>
                    {n.read && <Check className="h-3 w-3 text-muted-foreground/50" />}
                  </div>
                </div>
                {/* Delete button */}
                <button
                  onClick={() => handleDelete(n.id)}
                  disabled={deleting === n.id}
                  className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-xl text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                  aria-label="Delete">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Clear all modal */}
      {showClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 backdrop-blur-sm px-6"
          onClick={() => setShowClear(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-elevated animate-scale-in"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <Trash2 className="h-7 w-7" />
            </div>
            <h3 className="mb-2 text-xl font-extrabold">Clear all notifications?</h3>
            <p className="mb-6 text-sm text-muted-foreground">This will permanently delete all {items.length} notification{items.length !== 1 ? "s" : ""}.</p>
            <div className="flex gap-3">
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setShowClear(false)}>Cancel</Button>
              <Button variant="destructive" size="lg" className="flex-1" onClick={handleClearAll}>Clear all</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
