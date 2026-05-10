import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Bus, Ticket, CreditCard, Map,
  LogOut, Menu, X, Bell, ChevronRight, Truck, Settings
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/admin", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/admin/users", icon: Users, label: "Users" },
  { to: "/admin/trips", icon: Bus, label: "Trips" },
  { to: "/admin/tickets", icon: Ticket, label: "Tickets" },
  { to: "/admin/payments", icon: CreditCard, label: "Payments" },
  { to: "/admin/fleet", icon: Truck, label: "Fleet" },
  { to: "/admin/routes", icon: Map, label: "Routes" },
];

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Mobile overlay */}
      {open && <div className="fixed inset-0 z-20 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-slate-900 border-r border-slate-800 transition-transform duration-300",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
          <img src="/icons/icon-96x96.png" alt="BusPay" className="h-9 w-9 rounded-xl" />
          <div>
            <div className="font-extrabold text-white text-sm">BusPay</div>
            <div className="text-xs text-orange-400 font-semibold">Admin Panel</div>
          </div>
          <button className="ml-auto lg:hidden text-slate-400 hover:text-white" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
              className={({ isActive }) => cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-orange-500/15 text-orange-400 border border-orange-500/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              )}>
              {({ isActive }) => (
                <>
                  <Icon className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-orange-400" : "")} />
                  {label}
                  {isActive && <ChevronRight className="ml-auto h-3 w-3 opacity-60" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-slate-800 p-4 space-y-2">
          <NavLink to="/app" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-all">
            <Settings className="h-4 w-4" /> Back to App
          </NavLink>
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-all">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-slate-800 bg-slate-950/95 backdrop-blur px-6">
          <button className="lg:hidden text-slate-400 hover:text-white" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 rounded-xl bg-slate-800 px-3 py-1.5">
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-slate-300 font-medium">Live</span>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-white text-xs font-bold">A</div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
