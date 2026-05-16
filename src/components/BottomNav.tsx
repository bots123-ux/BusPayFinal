import { NavLink } from "react-router-dom";
import { Home, Ticket, Wallet, Bell, User } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  unreadCount?: number;
  ticketCount?: number;
}

export function BottomNav({ unreadCount = 0, ticketCount = 0 }: BottomNavProps) {
  const { t } = useI18n();

  const items = [
    { to: "/app", icon: Home, label: t("nav.home"), end: true, badge: 0 },
    { to: "/app/tickets", icon: Ticket, label: t("nav.tickets"), badge: ticketCount },
    { to: "/app/wallet", icon: Wallet, label: t("nav.wallet"), badge: 0 },
    { to: "/app/notifications", icon: Bell, label: t("nav.notif"), badge: unreadCount },
    { to: "/app/profile", icon: User, label: t("nav.profile"), badge: 0 },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-lg shadow-elevated pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-2xl items-stretch justify-around px-2">
        {items.map(({ to, icon: Icon, label, end, badge }) => (
          <li key={to} className="flex-1">
            <NavLink to={to} end={end}
              className={({ isActive }) =>
                cn("relative flex flex-col items-center justify-center gap-1 px-2 py-3 text-xs font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground")
              }>
              {({ isActive }) => (
                <>
                  <div className={cn("relative flex h-9 w-12 items-center justify-center rounded-xl transition-all",
                    isActive && "bg-accent/20 text-primary")}>
                    <Icon className="h-5 w-5" />
                    {badge > 0 && (
                      <span className={cn(
                        "absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white animate-scale-in",
                        to === "/app/notifications" ? "bg-red-500" : "bg-accent"
                      )}>
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </div>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
